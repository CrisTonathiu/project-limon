import type { TenantStatus, UserRole } from '@limon/types';

/**
 * Trusted, server-derived request identity. Built by the API AFTER authentication
 * and passed explicitly into services. Never constructed from client input.
 */
export type TenantContext = {
  readonly tenantId: string;
  readonly userId: string;
  readonly role: UserRole;
  readonly tenantStatus: TenantStatus;
  readonly requestId: string;
};

/**
 * Platform-admin context: not bound to a tenant. Kept as a separate type so a
 * service that requires TenantContext cannot accidentally be called without one.
 */
export type PlatformContext = {
  readonly userId: string;
  readonly role: 'PLATFORM_ADMIN';
  readonly requestId: string;
};

export function createTenantContext(input: TenantContext): TenantContext {
  if (!input.tenantId || !input.userId) throw new Error('TenantContext requires tenantId and userId');
  return Object.freeze({ ...input });
}
