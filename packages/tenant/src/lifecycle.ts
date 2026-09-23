import { TenantStatus } from '@limon/types';

/**
 * Tenant lifecycle state machine.
 * Access policy is derived from status — infrastructure is never torn down to revoke access.
 */
const transitions: Record<TenantStatus, readonly TenantStatus[]> = {
  TRIAL: ['ACTIVE', 'CANCELING', 'SUSPENDED'],
  ACTIVE: ['PAST_DUE', 'CANCELING', 'SUSPENDED'],
  PAST_DUE: ['ACTIVE', 'SUSPENDED', 'CANCELING'],
  CANCELING: ['ACTIVE', 'SUSPENDED'],
  SUSPENDED: ['ACTIVE', 'DELETION_PENDING'],
  DELETION_PENDING: ['SUSPENDED', 'DELETED'], // SUSPENDED = restore within retention window
  DELETED: [],
};

export function canTransition(from: TenantStatus, to: TenantStatus): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(from: TenantStatus, to: TenantStatus): void {
  if (!canTransition(from, to)) throw new Error(`Illegal tenant transition ${from} -> ${to}`);
}

export type TenantAccessLevel = 'FULL' | 'READ_ONLY' | 'NONE';

/**
 * What the tenant's users may do, by audience.
 * - Nutritionists keep read-only access while suspended so they can export data / fix billing.
 * - Patients lose access once the tenant is suspended.
 */
export function accessFor(status: TenantStatus, audience: 'NUTRITIONIST' | 'PATIENT'): TenantAccessLevel {
  switch (status) {
    case TenantStatus.TRIAL:
    case TenantStatus.ACTIVE:
    case TenantStatus.PAST_DUE: // grace: full access while dunning retries
    case TenantStatus.CANCELING: // paid period not yet ended
      return 'FULL';
    case TenantStatus.SUSPENDED:
      return audience === 'NUTRITIONIST' ? 'READ_ONLY' : 'NONE';
    case TenantStatus.DELETION_PENDING:
    case TenantStatus.DELETED:
      return 'NONE';
  }
}
