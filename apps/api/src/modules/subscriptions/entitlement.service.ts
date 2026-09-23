import { withTenant } from '@limon/database';
import type { PatientEntitlement } from '@limon/types';
import type { Container } from '../../infrastructure/container.js';

/**
 * Patient entitlement: does this patient have paid access right now?
 *
 * Source of truth is `patient_subscriptions`, written only by verified provider
 * events (App Store Server Notifications / Google RTDN / Stripe webhooks) — never
 * by a client claim. GRACE_PERIOD counts as active (billing retry after a failed
 * renewal); PAST_DUE does not.
 */
const ACTIVE_STATUSES = ['ACTIVE', 'TRIALING', 'GRACE_PERIOD'] as const;

export function createEntitlementService(c: Container) {
  async function current(tenantId: string, where: { patientId?: string; userId?: string }): Promise<PatientEntitlement> {
    return withTenant(c.db, await c.registry.getPlacement(tenantId), async (tx) => {
      const patient = where.patientId
        ? { id: where.patientId }
        : await tx.patient.findFirst({ where: { tenantId, userId: where.userId, deletedAt: null }, select: { id: true } });
      if (!patient) return { active: false, status: null, currentPeriodEnd: null };

      const sub = await tx.patientSubscription.findFirst({
        where: { tenantId, patientId: patient.id, status: { in: [...ACTIVE_STATUSES] } },
        orderBy: { currentPeriodEnd: 'desc' },
      });
      if (!sub) return { active: false, status: null, currentPeriodEnd: null };

      // A period end in the past means we have not yet received the renewal event.
      const expired = sub.currentPeriodEnd ? sub.currentPeriodEnd.getTime() < Date.now() : false;
      return {
        active: !expired,
        status: sub.status,
        currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
      };
    });
  }

  return {
    current,
    async isActiveForUser(tenantId: string, userId: string): Promise<boolean> {
      return (await current(tenantId, { userId })).active;
    },
  };
}
