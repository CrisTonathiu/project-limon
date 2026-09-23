import type { TenantTx } from '@limon/database';
import type { UpdateTenantBrandingInput } from '@limon/validation';

export const tenantsRepository = {
  findById: (tx: TenantTx, tenantId: string) =>
    tx.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, slug: true, status: true } }),

  updateBranding: (tx: TenantTx, tenantId: string, input: UpdateTenantBrandingInput) =>
    tx.tenantBranding.update({ where: { tenantId }, data: input }),
};
