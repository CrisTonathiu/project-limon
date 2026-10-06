import { Permission } from '@limon/auth';
import { FeatureKey } from '@limon/types';
import {
  FoodSwapSchema, MealPlanDayParamSchema, MealPlanFavouriteParamSchema, MealPlanIngredientParamSchema, MealPlanMealParamSchema,
} from '@limon/validation';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../../infrastructure/container.js';
import { ctxOf, requireFeature, requireTenant } from '../../middleware/auth.js';
import { createMealPlansService } from './meal-plans.service.js';

/**
 * The patient's own weekly plan (paywalled, behind the meal_plan module). Responses are
 * `no-store`: their macros come from FatSecret, which may not be cached for more than 24 h.
 */
export async function mealPlansRoutes(app: FastifyInstance, c: Container) {
  const service = createMealPlansService(c);
  const feature = requireFeature(c, FeatureKey.MEAL_PLAN);

  app.get('/meal-plans/current', { preHandler: [requireTenant(c, Permission.SELF_MEAL_PLANS_READ), feature] }, async (req, reply) =>
    reply.header('Cache-Control', 'no-store').send(await service.current(ctxOf(req), req.log)),
  );

  app.post(
    '/meal-plans/current/days/:date/regenerate',
    // Each call runs the generator and reads FatSecret (through the cache), so it has a tighter limit.
    { preHandler: [requireTenant(c, Permission.SELF_MEAL_PLANS_WRITE), feature], config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { date } = MealPlanDayParamSchema.parse(req.params);
      return reply.header('Cache-Control', 'no-store').send(await service.regenerateDay(ctxOf(req), date, req.log));
    },
  );

  const writeOwn = [requireTenant(c, Permission.SELF_MEAL_PLANS_WRITE), feature];

  app.put('/meal-plans/favourites/:recipeId', { preHandler: writeOwn }, async (req, reply) => {
    const { recipeId } = MealPlanFavouriteParamSchema.parse(req.params);
    await service.addFavourite(ctxOf(req), recipeId);
    return reply.status(204).send();
  });

  app.delete('/meal-plans/favourites/:recipeId', { preHandler: writeOwn }, async (req, reply) => {
    const { recipeId } = MealPlanFavouriteParamSchema.parse(req.params);
    await service.removeFavourite(ctxOf(req), recipeId);
    return reply.status(204).send();
  });

  app.get('/meal-plans/current/meals/:mealId', { preHandler: [requireTenant(c, Permission.SELF_MEAL_PLANS_READ), feature] }, async (req, reply) => {
    const { mealId } = MealPlanMealParamSchema.parse(req.params);
    return reply.header('Cache-Control', 'no-store').send(await service.meal(ctxOf(req), mealId, req.log));
  });

  // SMAE swaps are their own module on top of the meal plan.
  const swaps = requireFeature(c, FeatureKey.FOOD_SWAPS);

  app.get(
    '/meal-plans/current/meals/:mealId/ingredients/:ingredientId/swaps',
    { preHandler: [requireTenant(c, Permission.SELF_MEAL_PLANS_READ), feature, swaps] },
    async (req, reply) => {
      const { mealId, ingredientId } = MealPlanIngredientParamSchema.parse(req.params);
      return reply.send(await service.swapOptions(ctxOf(req), mealId, ingredientId));
    },
  );

  app.put(
    '/meal-plans/current/meals/:mealId/ingredients/:ingredientId/swap',
    { preHandler: [...writeOwn, swaps] },
    async (req, reply) => {
      const { mealId, ingredientId } = MealPlanIngredientParamSchema.parse(req.params);
      const { foodId } = FoodSwapSchema.parse(req.body);
      return reply.header('Cache-Control', 'no-store').send(await service.swap(ctxOf(req), mealId, ingredientId, foodId, req.log));
    },
  );
}
