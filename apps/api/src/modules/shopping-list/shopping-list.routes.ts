import { Permission } from '@limon/auth';
import { FeatureKey } from '@limon/types';
import { ShoppingListCheckSchema, ShoppingListItemParamSchema } from '@limon/validation';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../../infrastructure/container.js';
import { ctxOf, requireFeature, requireTenant } from '../../middleware/auth.js';
import { createShoppingListService } from './shopping-list.service.js';

/**
 * The patient's shopping list for the current week (paywalled, behind the shopping_list
 * module, which depends on meal_plan). It is worked out from the plan on every read.
 */
export async function shoppingListRoutes(app: FastifyInstance, c: Container) {
  const service = createShoppingListService(c);
  const feature = requireFeature(c, FeatureKey.SHOPPING_LIST);

  app.get('/shopping-list/current', { preHandler: [requireTenant(c, Permission.SELF_MEAL_PLANS_READ), feature] }, async (req, reply) =>
    reply.header('Cache-Control', 'no-store').send(await service.current(ctxOf(req), req.log)),
  );

  app.put(
    '/shopping-list/current/items/:foodId',
    { preHandler: [requireTenant(c, Permission.SELF_MEAL_PLANS_WRITE), feature] },
    async (req, reply) => {
      const { foodId } = ShoppingListItemParamSchema.parse(req.params);
      const { checked } = ShoppingListCheckSchema.parse(req.body);
      await service.setChecked(ctxOf(req), foodId, checked, req.log);
      return reply.status(204).send();
    },
  );
}
