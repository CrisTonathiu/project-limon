import { randomUUID } from 'node:crypto';
import type { VerifiedPrincipal } from '@limon/auth';
import { copyDefaultRecipes, resolveIdentity, resolveTenantApp, withTenant, writeAudit } from '@limon/database';
import { effectiveFeatures, type TenantContext } from '@limon/tenant';
import type { MeResponse, RegisterNutritionistResponse, RegisterPatientResponse } from '@limon/types';
import type { RegisterNutritionistInput, RegisterPatientInput } from '@limon/validation';
import { createEntitlementService } from '../subscriptions/entitlement.service.js';
import { tenantsRepository } from '../tenants/tenants.repository.js';
import type { Container } from '../../infrastructure/container.js';
import { Errors } from '../../lib/errors.js';
import { authRepository } from './auth.repository.js';

export function createAuthService(c: Container) {
  return {
    /**
     * Nutritionist signup. Precondition: the user already has a project-level login (not
     * inside any identity tenant). Creates Tenant + Branding + User + Nutritionist + TenantApps
     * atomically — a nutritionist can never exist without a tenant — and gives the tenant its
     * own copy of the default recipe library in the same transaction.
     *
     * The practice's Identity Platform tenant (where its patients' logins live, ADR-006) is
     * created first, since it can't join the transaction; it's removed again if the
     * transaction fails, so a failed sign-up leaves nothing behind.
     */
    async registerNutritionist(principal: VerifiedPrincipal, input: RegisterNutritionistInput, requestId: string): Promise<RegisterNutritionistResponse> {
      if (await resolveIdentity(c.db, principal.subject)) throw Errors.conflict('This account is already registered.');
      if (principal.email && principal.email.toLowerCase() !== input.email.toLowerCase()) throw Errors.forbidden();
      if (principal.identityTenantId !== null) throw Errors.tenantMismatch();

      const tenantId = randomUUID();
      const placement = await c.registry.getPlacement(tenantId);
      const identityTenantId = c.identityAdmin ? await c.identityAdmin.createTenant(input.slug) : null;
      try {
        return await withTenant(c.db, placement, async (tx) => {
          const r = await authRepository.createTenantGraph(tx, {
            ...input, email: input.email.toLowerCase(), tenantId, authUserId: principal.subject, identityTenantId,
          });
          const ctx = { tenantId, userId: r.user.id, requestId };
          await writeAudit(tx, ctx, { action: 'TenantCreated', resourceType: 'Tenant', resourceId: tenantId });
          await writeAudit(tx, ctx, { action: 'NutritionistRegistered', resourceType: 'Nutritionist', resourceId: r.nutritionist.id });
          const recipesCopied = await copyDefaultRecipes(tx, tenantId);
          await writeAudit(tx, ctx, { action: 'DefaultRecipesCopied', resourceType: 'Tenant', resourceId: tenantId, metadata: { recipesCopied } });
          return { userId: r.user.id, tenantId, nutritionistId: r.nutritionist.id, tenantAppIds: r.apps.map((a) => a.id) };
        });
      } catch (err) {
        if (identityTenantId) await c.identityAdmin!.deleteTenant(identityTenantId).catch(() => undefined);
        throw err;
      }
    },

    /**
     * Patient self-signup from a tenant's app. The tenant comes from the app key,
     * never from the request body, so a patient can only ever be created in the
     * tenant whose app they downloaded.
     *
     * Admission (the tenant's `invite_only` flag):
     * - OPEN: anyone can sign up; an invite code, if given, activates the patient it was issued to.
     * - INVITE_ONLY: an invite code is required.
     * The code is redeemed inside the same transaction, so a failed sign-up leaves it unused.
     */
    async registerPatient(
      principal: VerifiedPrincipal,
      appKey: string | undefined,
      input: RegisterPatientInput,
      requestId: string,
    ): Promise<RegisterPatientResponse> {
      if (!appKey) throw Errors.appNotRecognized();
      const app = await resolveTenantApp(c.db, appKey);
      if (!app || app.appStatus === 'REMOVED' || app.appStatus === 'DISABLED') throw Errors.appNotRecognized();
      // Only a live practice accepts new patients (a CANCELING/SUSPENDED tenant must not take payments).
      if (app.tenantStatus !== 'ACTIVE' && app.tenantStatus !== 'TRIAL') throw Errors.tenantSuspended();
      if (app.inviteOnly && !input.inviteCode) throw Errors.inviteCodeInvalid();
      // The login must live in this practice's identity tenant: a login made in another
      // nutritionist's app can't register here, even with the same email (ADR-006).
      if (principal.identityTenantId !== app.identityTenantId) throw Errors.tenantMismatch();
      if (await resolveIdentity(c.db, principal.subject)) throw Errors.conflict('This account is already registered.');
      if (principal.email && principal.email.toLowerCase() !== input.email.toLowerCase()) throw Errors.forbidden();

      const { tenantId } = app;
      const placement = await c.registry.getPlacement(tenantId);
      return withTenant(c.db, placement, async (tx) => {
        let invitedPatientId: string | undefined;
        if (input.inviteCode) {
          invitedPatientId = (await authRepository.redeemInviteCode(tx, tenantId, input.inviteCode)) ?? undefined;
          if (!invitedPatientId) throw Errors.inviteCodeInvalid();
        }
        const account = await authRepository.createPatientAccount(tx, {
          tenantId,
          invitedPatientId,
          authUserId: principal.subject,
          email: input.email.toLowerCase(),
          firstName: input.firstName,
          lastName: input.lastName,
          dateOfBirth: input.dateOfBirth,
          consents: [
            { kind: 'PRIVACY_NOTICE', documentVersion: input.privacyNoticeVersion },
            { kind: 'SENSITIVE_DATA', documentVersion: input.privacyNoticeVersion },
            { kind: 'TERMS_OF_SERVICE', documentVersion: input.termsVersion },
          ],
        });
        // The invited patient was removed or already activated: throwing rolls the redemption back.
        if (!account) throw Errors.inviteCodeInvalid();
        const { user, patient } = account;
        await writeAudit(
          tx,
          { tenantId, userId: user.id, requestId },
          {
            action: 'PatientRegistered',
            resourceType: 'Patient',
            resourceId: patient.id,
            // Versions only — the consent documents themselves are the legal record.
            metadata: {
              privacyNoticeVersion: input.privacyNoticeVersion,
              termsVersion: input.termsVersion,
              viaInviteCode: Boolean(input.inviteCode),
            },
          },
        );
        return { userId: user.id, patientId: patient.id, tenantId };
      });
    },

    async me(ctx: TenantContext): Promise<MeResponse> {
      const placement = await c.registry.getPlacement(ctx.tenantId);
      const base = await withTenant(c.db, placement, async (tx) => {
        const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { id: true, email: true, role: true } });
        const tenant = await authRepository.findTenantSummary(tx, ctx.tenantId);
        const features = effectiveFeatures(await tenantsRepository.enabledFeatureKeys(tx, ctx.tenantId));
        return { user, tenant, features };
      });
      if (ctx.role !== 'PATIENT') return base;
      const entitlement = await createEntitlementService(c).current(ctx.tenantId, { userId: ctx.userId });
      return { ...base, entitlement };
    },
  };
}
