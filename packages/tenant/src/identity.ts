/**
 * Tenant-scoped Cognito usernames (ADR-006).
 *
 * One user pool holds users from every tenant, and the same person may be a patient
 * of two nutritionists, so email cannot be the unique login key. The username is
 * namespaced with the tenant's immutable UUID; clients compose it from their build
 * config, and the user only ever types their email address.
 *
 * This is namespacing, NOT a security boundary — the API always re-checks tenant
 * membership against the database.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function tenantUsername(tenantId: string, email: string): string {
  if (!UUID.test(tenantId)) throw new Error('tenantUsername: tenantId must be a UUID');
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes('@')) throw new Error('tenantUsername: invalid email');
  return `${tenantId}#${normalized}`;
}

export function parseTenantUsername(username: string): { tenantId: string; email: string } | null {
  const [tenantId, ...rest] = username.split('#');
  const email = rest.join('#');
  if (!tenantId || !email || !UUID.test(tenantId)) return null;
  return { tenantId, email };
}
