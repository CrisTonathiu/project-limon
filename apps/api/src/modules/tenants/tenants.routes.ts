import { Permission } from '@limon/auth';
import { UpdateTenantBrandingSchema } from '@limon/validation';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../../infrastructure/container.js';
import { ctxOf, requireTenant } from '../../middleware/auth.js';
import { createTenantsService } from './tenants.service.js';

export async function tenantsRoutes(app: FastifyInstance, c: Container) {
  const service = createTenantsService(c);
  // "current" = the caller's tenant from TenantContext. There is deliberately no /tenants/:id for tenant users.
  app.get('/tenants/current', { preHandler: requireTenant(c, Permission.TENANT_READ) }, async (req) => service.current(ctxOf(req)));
  app.patch('/tenants/current/branding', { preHandler: requireTenant(c, Permission.BRANDING_MANAGE) }, async (req) =>
    service.updateBranding(ctxOf(req), UpdateTenantBrandingSchema.parse(req.body)),
  );
}
