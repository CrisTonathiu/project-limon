import { SHARED_DATABASE_IDENTIFIER, type TenantPlacement, type TenantRegistry } from '@limon/tenant';

/**
 * Stage-1 registry: every tenant is on the shared cluster.
 * Stage-3 will read tenants.database_mode/database_identifier (cached) — the column
 * already exists so the switch requires no schema change.
 */
export class SharedTenantRegistry implements TenantRegistry {
  async getPlacement(tenantId: string): Promise<TenantPlacement> {
    return { tenantId, databaseMode: 'SHARED', databaseIdentifier: SHARED_DATABASE_IDENTIFIER };
  }
}
