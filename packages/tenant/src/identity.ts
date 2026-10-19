/**
 * Tenant-namespaced login names, used for dev token subjects.
 *
 * The same person may be a patient of two nutritionists, so email alone cannot identify
 * a login. With Identity Platform each nutritionist has their own identity tenant (ADR-006);
 * dev auth has no tenants, so the subject is namespaced with the tenant's immutable UUID.
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
