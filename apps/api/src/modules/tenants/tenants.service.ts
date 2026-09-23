import { withTenant, writeAudit } from '@limon/database';
import type { TenantContext } from '@limon/tenant';
import type { TenantAppConfig } from '@limon/types';
import type { UpdateTenantBrandingInput } from '@limon/validation';
import type { Container } from '../../infrastructure/container.js';
import { tenantsRepository } from './tenants.repository.js';

export function createTenantsService(c: Container) {
  return {
    async current(ctx: TenantContext) {
      return withTenant(c.db, await c.registry.getPlacement(ctx.tenantId), (tx) => tenantsRepository.findById(tx, ctx.tenantId));
    },

    async updateBranding(ctx: TenantContext, input: UpdateTenantBrandingInput): Promise<TenantAppConfig> {
      return withTenant(c.db, await c.registry.getPlacement(ctx.tenantId), async (tx) => {
        const b = await tenantsRepository.updateBranding(tx, ctx.tenantId, input);
        await writeAudit(tx, ctx, { action: 'BrandingUpdated', resourceType: 'TenantBranding', resourceId: ctx.tenantId, metadata: { fields: Object.keys(input) } });
        return { tenantId: b.tenantId, appName: b.appName, logoUrl: null, primaryColor: b.primaryColor, secondaryColor: b.secondaryColor, supportEmail: b.supportEmail };
      });
    },
  };
}
