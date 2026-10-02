import { Permission } from '@limon/auth';
import { FatSecretFoodIdParamSchema, FoodSearchQuerySchema } from '@limon/validation';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../../infrastructure/container.js';
import { requireTenant } from '../../middleware/auth.js';
import { createFoodsService } from './foods.service.js';

/**
 * GET /foods/catalog: our food catalog, for patients too (FOODS_READ is not paywalled,
 * so onboarding can use it). It only changes when our team loads foods.csv.
 *
 * FatSecret lookups for recipe curation. Nutritionists only (FOODS_SEARCH): patients
 * never search the provider directly. Responses are `no-store` because FatSecret
 * data may not be cached for more than 24 h.
 */
export async function foodsRoutes(app: FastifyInstance, c: Container) {
  const service = createFoodsService(c);
  app.get('/foods/catalog', { preHandler: requireTenant(c, Permission.FOODS_READ) }, async (_req, reply) =>
    reply.header('Cache-Control', 'private, max-age=3600').send(await service.catalog()),
  );

  const opts = { preHandler: requireTenant(c, Permission.FOODS_SEARCH), config: { rateLimit: { max: 60, timeWindow: '1 minute' } } };

  app.get('/foods/search', opts, async (req, reply) => {
    const result = await service.search(FoodSearchQuerySchema.parse(req.query), req.log);
    return reply.header('Cache-Control', 'no-store').send(result);
  });

  app.get('/foods/fatsecret/:id', opts, async (req, reply) => {
    const food = await service.get(FatSecretFoodIdParamSchema.parse(req.params).id, req.log);
    return reply.header('Cache-Control', 'no-store').send(food);
  });
}
