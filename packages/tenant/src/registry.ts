import type { DatabaseMode } from '@limon/types';

/**
 * Tenant data-placement registry.
 * Every data access resolves "where does this tenant live?" through this
 * abstraction instead of assuming a single database. Today every tenant is
 * SHARED/MAIN; DEDICATED is modelled but intentionally not implemented.
 */
export type TenantPlacement = {
  tenantId: string;
  databaseMode: DatabaseMode;
  databaseIdentifier: string;
};

export interface TenantRegistry {
  getPlacement(tenantId: string): Promise<TenantPlacement>;
}

export const SHARED_DATABASE_IDENTIFIER = 'MAIN';
