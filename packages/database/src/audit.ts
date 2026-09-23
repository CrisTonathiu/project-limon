import type { TenantContext } from '@limon/tenant';
import type { TenantTx } from './tenant-client.js';

export type AuditAction =
  | 'TenantCreated' | 'TenantSuspended' | 'TenantDeletionScheduled' | 'TenantDeleted'
  | 'NutritionistRegistered'
  | 'PatientCreated' | 'PatientRegistered' | 'PatientDeleted'
  | 'MealPlanCreated' | 'RecipeUpdated'
  | 'SubscriptionCanceled'
  | 'BrandingUpdated';

/** Metadata may contain IDs, field names and enum values — never health data or free text. */
export type AuditMetadata = Record<string, string | number | boolean | null | string[]>;

/**
 * Writes an audit entry inside the caller's tenant transaction so the audit
 * record commits (or rolls back) atomically with the change it describes.
 */
export async function writeAudit(
  tx: TenantTx,
  ctx: Pick<TenantContext, 'tenantId' | 'userId' | 'requestId'>,
  entry: { action: AuditAction; resourceType: string; resourceId?: string; metadata?: AuditMetadata },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      requestId: ctx.requestId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId ?? null,
      metadata: entry.metadata ?? {},
    },
  });
}
