import { randomUUID } from 'node:crypto';
import type { VerifiedPrincipal } from '@limon/auth';
import { resolveApp, resolveIdentity, resolveInviteCode, withTenant, writeAudit } from '@limon/database';
import type { TenantContext } from '@limon/tenant';
import type { MeResponse, RegisterNutritionistResponse, RegisterPatientResponse, TenantStatus } from '@limon/types';
import type { RegisterNutritionistInput, RegisterPatientInput } from '@limon/validation';
import { createEntitlementService } from '../subscriptions/entitlement.service.js';
import type { Container } from '../../infrastructure/container.js';
import { Errors } from '../../lib/errors.js';
import { authRepository } from './auth.repository.js';

export function createAuthService(c: Container) {
  return {
    /**
     * Nutritionist signup. Precondition: the user already has a verified Cognito identity.
     * Creates Tenant + Branding + User + Nutritionist + TenantApps atomically — a
     * nutritionist can never exist without a tenant.
     */
    async registerNutritionist(principal: VerifiedPrincipal, input: RegisterNutritionistInput, requestId: string): Promise<RegisterNutritionistResponse> {
      if (await resolveIdentity(c.db, principal.subject)) throw Errors.conflict('This account is already registered.');
      if (principal.email && principal.email.toLowerCase() !== input.email.toLowerCase()) throw Errors.forbidden();

      const tenantId = randomUUID();
      const placement = await c.registry.getPlacement(tenantId);
      return withTenant(c.db, placement, async (tx) => {
        const r = await authRepository.createTenantGraph(tx, {
          ...input, email: input.email.toLowerCase(), tenantId, cognitoUserId: principal.subject,
        });
        const ctx = { tenantId, userId: r.user.id, requestId };
        await writeAudit(tx, ctx, { action: 'TenantCreated', resourceType: 'Tenant', resourceId: tenantId });
        await writeAudit(tx, ctx, { action: 'NutritionistRegistered', resourceType: 'Nutritionist', resourceId: r.nutritionist.id });
        return { userId: r.user.id, tenantId, nutritionistId: r.nutritionist.id, tenantAppIds: r.apps.map((a) => a.id) };
      });
    },

    /**
     * Patient self-signup. The tenant is never taken from the request body:
     * - from a tenant's own app, it is that app's tenant (the app key);
     * - from the shared platform app, it is the tenant of the invite code, re-checked here.
     * So a patient can only join a tenant whose app they downloaded or whose code they were given.
     */
    async registerPatient(
      principal: VerifiedPrincipal,
      appKey: string | undefined,
      input: RegisterPatientInput,
      requestId: string,
    ): Promise<RegisterPatientResponse> {
      if (!appKey) throw Errors.appNotRecognized();
      const app = await resolveApp(c.db, appKey);
      if (!app || app.appStatus === 'REMOVED' || app.appStatus === 'DISABLED') throw Errors.appNotRecognized();

      let target: { tenantId: string; tenantStatus: TenantStatus };
      if (app.kind === 'SHARED') {
        if (!input.inviteCode) throw Errors.inviteCodeInvalid();
        const invite = await resolveInviteCode(c.db, input.inviteCode);
        if (!invite) throw Errors.inviteCodeInvalid();
        target = invite;
      } else {
        if (input.inviteCode) {
          const invite = await resolveInviteCode(c.db, input.inviteCode);
          if (!invite) throw Errors.inviteCodeInvalid();
          if (invite.tenantId !== app.tenantId) throw Errors.tenantMismatch();
        }
        target = app;
      }
      const { tenantId } = target;

      // Only a live practice accepts new patients (a CANCELING/SUSPENDED tenant must not take payments).
      if (target.tenantStatus !== 'ACTIVE' && target.tenantStatus !== 'TRIAL') throw Errors.tenantSuspended();
      if (await resolveIdentity(c.db, principal.subject)) throw Errors.conflict('This account is already registered.');
      if (principal.email && principal.email.toLowerCase() !== input.email.toLowerCase()) throw Errors.forbidden();

      const placement = await c.registry.getPlacement(tenantId);
      return withTenant(c.db, placement, async (tx) => {
        const { user, patient } = await authRepository.createPatientAccount(tx, {
          tenantId,
          cognitoUserId: principal.subject,
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
              app: app.kind,
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
        return { user, tenant };
      });
      if (ctx.role !== 'PATIENT') return base;
      const entitlement = await createEntitlementService(c).current(ctx.tenantId, { userId: ctx.userId });
      return { ...base, entitlement };
    },
  };
}
