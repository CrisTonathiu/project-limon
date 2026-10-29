import type { VerifiedPrincipal } from '@limon/auth';
import { resolveIdentity, resolveTenantApp, withTenant, writeAudit } from '@limon/database';
import { effectiveFeatures, type TenantContext } from '@limon/tenant';
import type { MeResponse, RegisterPatientResponse } from '@limon/types';
import type { RegisterPatientInput } from '@limon/validation';
import { createEntitlementService } from '../subscriptions/entitlement.service.js';
import { tenantsRepository } from '../tenants/tenants.repository.js';
import type { Container } from '../../infrastructure/container.js';
import { Errors } from '../../lib/errors.js';
import { authRepository } from './auth.repository.js';

export function createAuthService(c: Container) {
  return {
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
        const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { id: true, email: true, role: true, passwordChangeRequired: true } });
        const tenant = await authRepository.findTenantSummary(tx, ctx.tenantId);
        const features = effectiveFeatures(await tenantsRepository.enabledFeatureKeys(tx, ctx.tenantId));
        return { user, tenant, features };
      });
      if (ctx.role !== 'PATIENT') return base;
      const entitlement = await createEntitlementService(c).current(ctx.tenantId, { userId: ctx.userId });
      return { ...base, entitlement };
    },

    /**
     * Replaces the temporary password from `admin create-tenant`. Through the Admin SDK, not
     * the browser, so the API knows the change happened before it clears the flag. The
     * password is never logged or stored. If the flag can't be cleared afterwards, the new
     * password still works and the nutritionist simply chooses one again.
     */
    async changePassword(ctx: TenantContext, authUserId: string, password: string): Promise<void> {
      if (!c.identityAdmin) throw Errors.conflict('Passwords are managed by Identity Platform, which is off (dev auth).');
      const placement = await c.registry.getPlacement(ctx.tenantId);
      const pending = await withTenant(c.db, placement, (tx) =>
        tx.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { passwordChangeRequired: true } }),
      );
      if (!pending.passwordChangeRequired) throw Errors.conflict('There is no temporary password to replace.');
      await c.identityAdmin.setPassword(authUserId, password);
      await withTenant(c.db, placement, async (tx) => {
        await tx.user.update({ where: { id: ctx.userId }, data: { passwordChangeRequired: false } });
        await writeAudit(tx, ctx, { action: 'PasswordChanged', resourceType: 'User', resourceId: ctx.userId, metadata: { temporaryReplaced: true } });
      });
    },
  };
}
