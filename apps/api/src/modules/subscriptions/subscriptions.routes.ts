import { Permission } from '@limon/auth';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../../infrastructure/container.js';
import { ctxOf, requireTenant } from '../../middleware/auth.js';
import { createEntitlementService } from './entitlement.service.js';

export async function subscriptionsRoutes(app: FastifyInstance, c: Container) {
  const entitlements = createEntitlementService(c);
  // Deliberately NOT entitlement-gated: an unpaid patient must be able to see the paywall.
  app.get('/subscriptions/me', { preHandler: requireTenant(c, Permission.SELF_SUBSCRIPTION_READ) }, async (req) => {
    const ctx = ctxOf(req);
    return entitlements.current(ctx.tenantId, { userId: ctx.userId });
  });
}
