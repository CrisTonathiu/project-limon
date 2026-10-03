import { randomUUID } from 'node:crypto';
import { withTenant, writeAudit, type TenantTx } from '@limon/database';
import type { TenantContext } from '@limon/tenant';
import type { EnergyTargetHoldReason, MealPlanDayDto, MealPlanResponse, MealType, RecipeMacros } from '@limon/types';
import type { Container } from '../../infrastructure/container.js';
import { Errors } from '../../lib/errors.js';
import { createPatientsService } from '../patients/patients.service.js';
import { createRecipesService } from '../recipes/recipes.service.js';
import { generateMealPlan, type GeneratorInput } from './meal-plan-generator.js';
import { mealPlansRepository } from './meal-plans.repository.js';
import { isIsoDate, isMonday, localToday, weekDates, weekStartOf } from './week.js';

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

const scale = (m: RecipeMacros, servings: number): RecipeMacros => ({
  calories: Math.round(m.calories * servings),
  protein: Math.round(m.protein * servings * 10) / 10,
  carbohydrate: Math.round(m.carbohydrate * servings * 10) / 10,
  fat: Math.round(m.fat * servings * 10) / 10,
});

const sum = (all: RecipeMacros[]): RecipeMacros => {
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    calories: all.reduce((s, m) => s + m.calories, 0),
    protein: round(all.reduce((s, m) => s + m.protein, 0)),
    carbohydrate: round(all.reduce((s, m) => s + m.carbohydrate, 0)),
    fat: round(all.reduce((s, m) => s + m.fat, 0)),
  };
};

export function createMealPlansService(c: Container) {
  const patients = createPatientsService(c);
  const recipes = createRecipesService(c);
  const scoped = async <T>(tenantId: string, fn: (tx: TenantTx) => Promise<T>) =>
    withTenant(c.db, await c.registry.getPlacement(tenantId), fn);

  /**
   * Everything the generator needs about a patient, or why there's no plan for them.
   * FatSecret is called outside any transaction, so a slow provider doesn't hold a connection.
   */
  const planningInputs = async (tenantId: string, patientId: string, log: Logger) => {
    const profile = await patients.planningProfile(tenantId, patientId);
    if (!profile) return { status: 'NO_PROFILE' as const };
    const target = profile.energyTarget;
    if (target.status !== 'READY') return { status: 'CONSULT_NUTRITIONIST' as const, reason: target.reason };

    const candidates = await recipes.forPlanning(tenantId, log);
    if (!candidates.some((r) => r.perServing)) throw Errors.nutritionProviderUnavailable();
    const favouriteRecipeIds = await scoped(tenantId, (tx) => mealPlansRepository.favouriteRecipeIds(tx, tenantId, patientId));
    return {
      status: 'READY' as const,
      target,
      candidates,
      input: {
        target: { kcal: target.targetKcal, proteinG: target.proteinG },
        mealsPerDay: profile.mealsPerDay,
        recipes: candidates,
        allergies: profile.allergies,
        dislikedFoodIds: profile.dislikedFoodIds,
        favouriteRecipeIds,
      } satisfies Omit<GeneratorInput, 'seed'>,
    };
  };

  const generateWeek = async (input: GenerateWeekInput, log: Logger): Promise<GenerateWeekResult> => {
    const { tenantId, patientId, weekStart } = input;
    if (!isMonday(weekStart)) throw Errors.validation('weekStart must be a Monday (YYYY-MM-DD)');

    const planning = await planningInputs(tenantId, patientId, log);
    if (planning.status !== 'READY') return planning;
    const titles = new Map(planning.candidates.map((r) => [r.id, r.title]));
    const plan = generateMealPlan({ ...planning.input, seed: `${patientId}:${weekStart}` });
    const dates = weekDates(weekStart);

    const saved = await scoped(tenantId, async (tx) => {
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
      return saved;
    });

    return {
      status: 'CREATED',
      mealPlanId: saved.id,
      weekStart,
      targetKcal: planning.target.targetKcal,
      days: plan.map((day, d) => ({
        date: dates[d]!,
        kcal: day.reduce((total, m) => total + (m.recipeId ? m.kcal : 0), 0),
        meals: day.map((m) =>
          m.recipeId
            ? { mealType: m.mealType, recipeId: m.recipeId, title: titles.get(m.recipeId) ?? null, servings: m.servings, kcal: m.kcal }
            : { mealType: m.mealType, recipeId: null, title: null, servings: null, kcal: null },
        ),
      })),
    };
  };

  /** The patient behind the signed-in user, and the current week (Mexico City calendar). */
  const me = async (ctx: TenantContext) => ({ patientId: (await patients.me(ctx)).id, weekStart: weekStartOf(new Date()) });

  /** The saved week's rows, generating the week first if it doesn't exist yet. */
  const ensureWeek = async (ctx: TenantContext, patientId: string, weekStart: string, log: Logger) => {
    const find = () => scoped(ctx.tenantId, (tx) => mealPlansRepository.findWeek(tx, ctx.tenantId, patientId, new Date(weekStart)));
    const existing = await find();
    if (existing) return existing;
    await generateWeek({ tenantId: ctx.tenantId, patientId, weekStart, actorUserId: ctx.userId, requestId: ctx.requestId }, log);
    const plan = await find();
    // Callers check the target first, so generation can't have been withheld.
    if (!plan) throw new Error('Meal plan missing right after it was generated');
    return plan;
  };

  /**
   * The saved week with each meal's macros, recomputed from the FatSecret cache on every
   * read (nothing nutritional is stored). Generates the week first if it doesn't exist yet:
   * a patient who joins mid-week, or a week the weekly job hasn't reached, still gets a plan.
   */
  const readWeek = async (ctx: TenantContext, patientId: string, weekStart: string, log: Logger): Promise<MealPlanResponse> => {
    const profile = await patients.planningProfile(ctx.tenantId, patientId);
    // The app only shows the plan after onboarding, so this is a client bug or a race with account deletion.
    if (!profile) throw Errors.conflict('Finish the onboarding questionnaire first.');
    const target = profile.energyTarget;
    if (target.status !== 'READY') return { status: 'CONSULT_NUTRITIONIST', reason: target.reason };

    const plan = await ensureWeek(ctx, patientId, weekStart, log);

    const summaries = await recipes.summariesWithMacros(ctx.tenantId, [...new Set(plan.meals.flatMap((m) => (m.recipeId ? [m.recipeId] : [])))], log);
    const days: MealPlanDayDto[] = weekDates(weekStart).map((date) => {
      const meals = plan.meals
        .filter((m) => m.date.toISOString().slice(0, 10) === date)
        .map((m) => {
          const recipe = m.recipeId ? summaries.get(m.recipeId) : undefined;
          return {
            id: m.id,
            mealType: m.mealType,
            recipe: recipe ? { id: recipe.id, title: recipe.title, totalMinutes: recipe.totalMinutes } : null,
            servings: recipe ? m.servings : null,
            macros: recipe?.macrosPerServing && m.servings ? scale(recipe.macrosPerServing, m.servings) : null,
          };
        });
      const planned = meals.filter((m) => m.recipe);
      // Like a recipe's macros: no partial total when any planned meal's macros are unknown.
      const totals = planned.every((m) => m.macros) ? sum(planned.map((m) => m.macros!)) : null;
      return { date, totals, meals };
    });

    return {
      status: 'READY',
      plan: { id: plan.id, weekStart, days },
      target: { kcal: target.targetKcal, proteinG: target.proteinG, carbsG: target.carbsG, fatG: target.fatG },
    };
  };

  return {
    generateWeek,

    /** GET /meal-plans/current */
    current: async (ctx: TenantContext, log: Logger): Promise<MealPlanResponse> => {
      const { patientId, weekStart } = await me(ctx);
      return readWeek(ctx, patientId, weekStart, log);
    },

    /**
     * POST /meal-plans/current/days/:date/regenerate: new recipes for one day of the current
     * week, from today on. Avoids the recipes of the days around it and the day's own, so the
     * patient sees a different day. Returns the whole week, like `current`.
     */
    regenerateDay: async (ctx: TenantContext, date: string, log: Logger): Promise<MealPlanResponse> => {
      const { patientId, weekStart } = await me(ctx);
      const dates = weekDates(weekStart);
      const day = dates.indexOf(date);
      if (!isIsoDate(date) || day === -1) throw Errors.validation('date must be a day of the current week');
      if (date < localToday(new Date())) throw Errors.validation('Past days can’t be regenerated');

      const planning = await planningInputs(ctx.tenantId, patientId, log);
      if (planning.status === 'NO_PROFILE') throw Errors.conflict('Finish the onboarding questionnaire first.');
      if (planning.status === 'CONSULT_NUTRITIONIST') return planning;
      const plan = await ensureWeek(ctx, patientId, weekStart, log);
      const recipeIdsOn = (d: string) => plan.meals.filter((m) => m.recipeId && m.date.toISOString().slice(0, 10) === d).map((m) => m.recipeId!);

      const [meals] = generateMealPlan({
        ...planning.input,
        // A fresh seed each time, so pressing it again gives yet another day.
        seed: randomUUID(),
        days: 1,
        startDay: day,
        alreadyPlanned: dates.flatMap((d, i) => (i === day ? [] : [{ day: i, recipeIds: recipeIdsOn(d) }])),
        avoidRecipeIds: recipeIdsOn(date),
      });

      await scoped(ctx.tenantId, async (tx) => {
        await mealPlansRepository.replaceDay(
          tx, ctx.tenantId, plan.id, new Date(date),
          meals!.map((m, slot) => ({ slot, mealType: m.mealType, recipeId: m.recipeId, servings: m.recipeId ? m.servings : null })),
        );
        await writeAudit(tx, ctx, { action: 'MealPlanDayRegenerated', resourceType: 'MealPlan', resourceId: plan.id, metadata: { date } });
      });
      return readWeek(ctx, patientId, weekStart, log);
    },
  };
}
