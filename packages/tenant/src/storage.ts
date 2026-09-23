/**
 * Canonical S3 key builder. All tenant objects live under tenants/{tenantId}/.
 * tenantId must come from TenantContext; user-provided file names are sanitized.
 */
export type TenantObjectArea = 'branding' | 'recipes' | 'patients' | 'documents' | 'exports';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function tenantObjectKey(tenantId: string, area: TenantObjectArea, ...parts: string[]): string {
  if (!UUID.test(tenantId)) throw new Error('tenantId must be a UUID');
  const safe = parts.map((p) => {
    const cleaned = p.replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!cleaned || cleaned === '.' || cleaned === '..') throw new Error('invalid key segment');
    return cleaned;
  });
  return ['tenants', tenantId, area, ...safe].join('/');
}

export function tenantPrefix(tenantId: string): string {
  if (!UUID.test(tenantId)) throw new Error('tenantId must be a UUID');
  return `tenants/${tenantId}/`;
}
