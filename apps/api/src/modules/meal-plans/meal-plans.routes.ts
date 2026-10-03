import { Permission } from '@limon/auth';
import { FeatureKey } from '@limon/types';
import { MealPlanDayParamSchema } from '@limon/validation';
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
}
