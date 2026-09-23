import { withTenant, writeAudit } from '@limon/database';
import { assertTransition, type TenantContext } from '@limon/tenant';
import type { TenantStatus } from '@limon/types';
import type { Container } from '../../infrastructure/container.js';

/**
 * Tenant lifecycle orchestration (docs/architecture/tenant-lifecycle.md).
 * Access is revoked by STATUS; data removal happens later in the DeleteTenantData job.
 * Callers: Stripe webhook handler (billing-driven), scheduled sweeper job, platform admin.
 *
 * Retention periods are placeholders pending a legal/compliance decision.
 */
export const RETENTION = { cancelGraceDays: 0, suspendedBeforeDeletionDays: 30 } as const;

export function createTenantLifecycleService(c: Container) {
  async function transition(ctx: Pick<TenantContext, 'tenantId' | 'userId' | 'requestId'>, to: TenantStatus, reason: string) {
    return withTenant(c.db, await c.registry.getPlacement(ctx.tenantId), async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } });
      assertTransition(tenant.status, to);
      const scheduledDeletionAt =
        to === 'DELETION_PENDING' ? new Date(Date.now() + RETENTION.suspendedBeforeDeletionDays * 86_400_000) : null;
      await tx.tenant.update({ where: { id: tenant.id }, data: { status: to, statusChangedAt: new Date() } });
      await tx.tenantLifecycleEvent.create({
        data: { tenantId: tenant.id, fromStatus: tenant.status, toStatus: to, reason, actorId: ctx.userId, scheduledDeletionAt },
      });
      if (to === 'SUSPENDED') await writeAudit(tx, ctx, { action: 'TenantSuspended', resourceType: 'Tenant', resourceId: tenant.id, metadata: { reason } });
      if (to === 'DELETION_PENDING') await writeAudit(tx, ctx, { action: 'TenantDeletionScheduled', resourceType: 'Tenant', resourceId: tenant.id });
      return { from: tenant.status, to, scheduledDeletionAt };
    });
  }

  return {
    transition,
    /** Called when the deletion window elapses (by a scheduled sweeper). Enqueues — never deletes inline. */
    async enqueueDeletion(ctx: Pick<TenantContext, 'tenantId' | 'userId' | 'requestId'>) {
      return c.jobs.publish({ type: 'DeleteTenantData', tenantId: ctx.tenantId, actorUserId: null, payload: {}, requestId: ctx.requestId });
    },
  };
}
