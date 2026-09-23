import { withTenant } from '@limon/database';
import type { JobEnvelope } from '@limon/tenant';
import type { Container } from '../../infrastructure/container.js';

/**
 * DeleteTenantData — SKELETON. Must be idempotent (SQS is at-least-once).
 *
 * Planned order (docs/architecture/tenant-lifecycle.md):
 *  1. Guard: tenant.status must be DELETION_PENDING and scheduledDeletionAt <= now
 *  2. Operational data: messages, conversations, meal_plans, recipes, foods, protocols → hard delete
 *  3. Patients: anonymize or delete (patient_subscriptions are RESTRICT, so financial rows block naive deletes)
 *  4. Users: delete app rows + AdminDeleteUser in Cognito
 *  5. S3: delete prefix tenants/{tenantId}/
 *  6. Financial records: retain per legal retention, strip PII
 *  7. Audit logs: retain (no patient data by design)
 *  8. Tenant row: status=DELETED, deletedAt=now, keep as tombstone (slug released)
 *  9. TenantApps: mark DISABLED/REMOVED — store delisting is a manual/provisioning step
 */
export async function deleteTenantData(c: Container, job: JobEnvelope): Promise<void> {
  await withTenant(c.db, await c.registry.getPlacement(job.tenantId), async (tx) => {
    const tenant = await tx.tenant.findUnique({ where: { id: job.tenantId } });
    if (!tenant || tenant.status === 'DELETED') return; // idempotent
    if (tenant.status !== 'DELETION_PENDING') throw new Error(`Refusing to delete tenant in status ${tenant.status}`);
    throw new Error('DeleteTenantData not implemented yet (retention policy pending)');
  });
}
