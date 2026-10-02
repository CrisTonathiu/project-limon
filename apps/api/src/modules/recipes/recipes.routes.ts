import { Permission } from '@limon/auth';
import { FeatureKey } from '@limon/types';
import { RecipeListQuerySchema, UuidParamSchema } from '@limon/validation';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../../infrastructure/container.js';
import { ctxOf, requireFeature, requireTenant } from '../../middleware/auth.js';
import { createRecipesService } from './recipes.service.js';

/**
 * The tenant's recipes, for patients (paywalled: RECIPES_READ needs a subscription) and
 * nutritionists, when the tenant has the recipes module on. The detail is `no-store`:
 * its macros come from FatSecret, which may not be cached for more than 24 h.
 */
export async function recipesRoutes(app: FastifyInstance, c: Container) {
  const service = createRecipesService(c);
  const opts = { preHandler: [requireTenant(c, Permission.RECIPES_READ), requireFeature(c, FeatureKey.RECIPES)] };

  app.get('/recipes', opts, async (req) => service.list(ctxOf(req), RecipeListQuerySchema.parse(req.query)));

  app.get('/recipes/:id', opts, async (req, reply) => {
    const recipe = await service.get(ctxOf(req), UuidParamSchema.parse(req.params).id, req.log);
    return reply.header('Cache-Control', 'no-store').send(recipe);
  });
}
