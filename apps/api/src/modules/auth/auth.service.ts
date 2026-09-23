import { randomUUID } from 'node:crypto';
import type { VerifiedPrincipal } from '@limon/auth';
import { resolveIdentity, resolveTenantApp, withTenant, writeAudit } from '@limon/database';
import type { TenantContext } from '@limon/tenant';
import type { MeResponse, RegisterNutritionistResponse, RegisterPatientResponse } from '@limon/types';
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
     * Patient self-signup from a tenant's app. The tenant comes from the app key,
     * never from the request body, so a patient can only ever be created in the
     * tenant whose app they downloaded.
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
      if (await resolveIdentity(c.db, principal.subject)) throw Errors.conflict('This account is already registered.');
      if (principal.email && principal.email.toLowerCase() !== input.email.toLowerCase()) throw Errors.forbidden();

      const placement = await c.registry.getPlacement(app.tenantId);
      return withTenant(c.db, placement, async (tx) => {
        const { user, patient } = await authRepository.createPatientAccount(tx, {
          tenantId: app.tenantId,
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
          { tenantId: app.tenantId, userId: user.id, requestId },
          {
            action: 'PatientRegistered',
            resourceType: 'Patient',
            resourceId: patient.id,
            // Versions only — the consent documents themselves are the legal record.
            metadata: { privacyNoticeVersion: input.privacyNoticeVersion, termsVersion: input.termsVersion },
          },
        );
        return { userId: user.id, patientId: patient.id, tenantId: app.tenantId };
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
