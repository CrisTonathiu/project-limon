export { DatabaseRouter } from './client.js';
export { withTenant, type TenantTx } from './tenant-client.js';
export { SharedTenantRegistry } from './registry.js';
export { resolveIdentity, resolveTenantApp, type ResolvedIdentity, type ResolvedTenantApp } from './identity.js';
export { writeAudit, type AuditAction, type AuditMetadata } from './audit.js';
// Type-only, from the generated client (see client.ts) rather than @prisma/client directly.
export type { Prisma } from '../generated/client/index.js';
