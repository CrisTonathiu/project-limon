import { withTenant, writeAudit } from '@limon/database';
import type { EnergyTargetHoldReason, MealType } from '@limon/types';
import type { Container } from '../../infrastructure/container.js';
import { Errors } from '../../lib/errors.js';
import { createPatientsService } from '../patients/patients.service.js';
import { createRecipesService } from '../recipes/recipes.service.js';
import { generateMealPlan } from './meal-plan-generator.js';
import { mealPlansRepository } from './meal-plans.repository.js';
import { isMonday, weekDates } from './week.js';

type Logger = { warn: (obj: object, msg: string) => void };

export type GenerateWeekInput = {
  tenantId: string;
  patientId: string;
  /** The plan's Monday, YYYY-MM-DD. */
  weekStart: string;
  /** Null for system work: the weekly job and admin commands. */
  actorUserId: string | null;
  requestId: string;
};

export type PlannedDay = {
  date: string;
  /** Estimated from the FatSecret cache at generation time; never stored. */
  kcal: number;
  meals: { mealType: MealType; recipeId: string | null; title: string | null; servings: number | null; kcal: number | null }[];
};

export type GenerateWeekResult =
  | { status: 'CREATED'; mealPlanId: string; weekStart: string; targetKcal: number; days: PlannedDay[] }
  /** Not onboarded yet (or the patient doesn't exist). */
  | { status: 'NO_PROFILE' }
  /** The guardrails withhold an automatic target, so no plan is generated either. */
  | { status: 'CONSULT_NUTRITIONIST'; reason: EnergyTargetHoldReason };

export function createMealPlansService(c: Container) {
  const patients = createPatientsService(c);
  const recipes = createRecipesService(c);

  return {
    /**
     * Generates a patient's plan for one week, replacing any plan already saved for it.
     * Takes the tenant id explicitly (not a TenantContext) because the weekly job and the
     * admin command run with no user signed in; a patient route passes ctx.tenantId.
     */
    generateWeek: async (input: GenerateWeekInput, log: Logger): Promise<GenerateWeekResult> => {
      const { tenantId, patientId, weekStart } = input;
      if (!isMonday(weekStart)) throw Errors.validation('weekStart must be a Monday (YYYY-MM-DD)');

      const profile = await patients.planningProfile(tenantId, patientId);
      if (!profile) return { status: 'NO_PROFILE' };
      const target = profile.energyTarget;
      if (target.status !== 'READY') return { status: 'CONSULT_NUTRITIONIST', reason: target.reason };

      // FatSecret is called outside any transaction, so a slow provider doesn't hold a connection.
      const candidates = await recipes.forPlanning(tenantId, log);
      if (!candidates.some((r) => r.perServing)) throw Errors.nutritionProviderUnavailable();
      const titles = new Map(candidates.map((r) => [r.id, r.title]));

      return withTenant(c.db, await c.registry.getPlacement(tenantId), async (tx) => {
        const plan = generateMealPlan({
          target: { kcal: target.targetKcal, proteinG: target.proteinG },
          mealsPerDay: profile.mealsPerDay,
          recipes: candidates,
          allergies: profile.allergies,
          dislikedFoodIds: profile.dislikedFoodIds,
          favouriteRecipeIds: await mealPlansRepository.favouriteRecipeIds(tx, tenantId, patientId),
          seed: `${patientId}:${weekStart}`,
        });
        const dates = weekDates(weekStart);
        const saved = await mealPlansRepository.saveWeek(
          tx, tenantId, patientId, new Date(weekStart),
          plan.flatMap((day, d) =>
            day.map((m, slot) => ({
              date: new Date(dates[d]!), slot, mealType: m.mealType, recipeId: m.recipeId, servings: m.recipeId ? m.servings : null,
            })),
          ),
        );
        const unfilled = plan.flat().filter((m) => !m.recipeId).length;
        await writeAudit(tx, { tenantId, userId: input.actorUserId, requestId: input.requestId }, {
          action: 'MealPlanCreated', resourceType: 'MealPlan', resourceId: saved.id, metadata: { weekStart, unfilledSlots: unfilled },
        });

        return {
          status: 'CREATED',
          mealPlanId: saved.id,
          weekStart,
          targetKcal: target.targetKcal,
          days: plan.map((day, d) => ({
            date: dates[d]!,
            kcal: day.reduce((sum, m) => sum + (m.recipeId ? m.kcal : 0), 0),
            meals: day.map((m) =>
              m.recipeId
                ? { mealType: m.mealType, recipeId: m.recipeId, title: titles.get(m.recipeId) ?? null, servings: m.servings, kcal: m.kcal }
                : { mealType: m.mealType, recipeId: null, title: null, servings: null, kcal: null },
            ),
          })),
        };
      });
    },
  };
}
