import { randomUUID } from 'node:crypto';
import { withTenant, writeAudit, type TenantTx } from '@limon/database';
import type { TenantContext } from '@limon/tenant';
import type {
  EnergyTargetHoldReason, FoodSwapOptionsResponse, MealLogDto, MealLogResponse, MealLogStatus, MealPlanDayDto, MealPlanResponse, MealProgressResponse,
  MealType, PlannedMealDetailDto, RecipeMacros,
} from '@limon/types';
import type { MealLogData } from '@limon/validation';
import type { Container } from '../../infrastructure/container.js';
import { Errors } from '../../lib/errors.js';
import { createFoodsService } from '../foods/foods.service.js';
import { createPatientsService } from '../patients/patients.service.js';
import { macrosPerServing } from '../recipes/recipe-nutrition.js';
import { createRecipesService } from '../recipes/recipes.service.js';
import { applySwaps, canSwap, equivalentGrams, swapOptions } from './food-swaps.js';
import { canLog, mealStreak, weekAdherence, type SlotState } from './meal-log-stats.js';
import { generateMealPlan, type GeneratorInput } from './meal-plan-generator.js';
import { mealPlansRepository, type MealLogSwap } from './meal-plans.repository.js';
import { addDays, isIsoDate, isMonday, localToday, weekDates, weekStartOf } from './week.js';

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

/** A saved meal slot, as the repository returns it. */
type SavedMeal = {
  id: string;
  date: Date;
  slot: number;
  mealType: MealType;
  recipeId: string | null;
  servings: number | null;
  swaps: { recipeIngredientId: string; foodId: string }[];
};

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const round = (n: number, decimals: number) => Math.round(n * 10 ** decimals) / 10 ** decimals;
const slotKey = (date: Date | string, slot: number) => `${typeof date === 'string' ? date : isoDate(date)}:${slot}`;

/** How far back the streak looks. A longer streak shows as this many days. */
const STREAK_LOOKBACK_DAYS = 365;

/** A check-off's snapshot of the meal's swaps, as stored (JSON). */
const logSwaps = (json: unknown): MealLogSwap[] =>
  Array.isArray(json)
    ? json.filter((s): s is MealLogSwap => typeof s?.recipeIngredientId === 'string' && typeof s?.foodId === 'string')
    : [];

const toLogDto = (log: { status: MealLogStatus; note: string | null; loggedAt: Date }): MealLogDto => ({
  status: log.status, note: log.note, loggedAt: log.loggedAt.toISOString(),
});

export function createMealPlansService(c: Container) {
  const patients = createPatientsService(c);
  const recipes = createRecipesService(c);
  const foods = createFoodsService(c);
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

  /**
   * Loads what these meals need (recipes, swapped-in foods and, with `log`, their FatSecret
   * data) and returns a function that views one of them: its ingredients after swaps, the
   * share of the recipe the patient eats, and the meal's macros (null without `log`, or when
   * FatSecret can't give them). Undefined for an empty slot.
   */
  const mealViews = async (tenantId: string, meals: SavedMeal[], log: Logger | null) => {
    const recipeById = await recipes.forMeals(tenantId, [...new Set(meals.flatMap((m) => (m.recipeId ? [m.recipeId] : [])))]);
    const swapFoods = await foods.byIds([...new Set(meals.flatMap((m) => m.swaps.map((s) => s.foodId)))]);
    const fatsecret = log
      ? await foods.getMany(
          [...[...recipeById.values()].flatMap((r) => r.ingredients.map((i) => i.food.fatsecretFoodId)), ...[...swapFoods.values()].map((f) => f.fatsecretFoodId)],
          log,
        )
      : null;

    return (meal: SavedMeal) => {
      const recipe = meal.recipeId ? recipeById.get(meal.recipeId) : undefined;
      if (!recipe || !meal.servings) return undefined;
      const swaps = new Map(meal.swaps.flatMap((s) => (swapFoods.has(s.foodId) ? [[s.recipeIngredientId, swapFoods.get(s.foodId)!] as const] : [])));
      const ingredients = applySwaps(recipe.ingredients, swaps);
      const perServing =
        fatsecret &&
        macrosPerServing(
          ingredients.map((i) => ({ grams: i.grams, fatsecretFoodId: i.food.fatsecretFoodId, fatsecretServingId: i.food.fatsecretServingId })),
          recipe.servings,
          fatsecret,
        );
      return { recipe, ingredients, portion: meal.servings / recipe.servings, macros: perServing ? scale(perServing, meal.servings) : null };
    };
  };

  /** One meal of the patient's current week with its view (without macros unless `log` is given), or 404. */
  const findMeal = async (ctx: TenantContext, mealId: string, log: Logger | null) => {
    const { patientId, weekStart } = await me(ctx);
    const meal = await scoped(ctx.tenantId, (tx) => mealPlansRepository.findMeal(tx, ctx.tenantId, patientId, new Date(weekStart), mealId));
    // An empty slot has nothing to show or swap.
    const view = meal && (await mealViews(ctx.tenantId, [meal], log))(meal);
    if (!meal || !view) throw Errors.notFound('Meal');
    return { patientId, weekStart, meal, view };
  };

  const toDetail = (
    meal: SavedMeal,
    { recipe, ingredients, portion, macros }: NonNullable<ReturnType<Awaited<ReturnType<typeof mealViews>>>>,
    favourite: boolean,
  ): PlannedMealDetailDto => ({
    id: meal.id,
    date: isoDate(meal.date),
    mealType: meal.mealType,
    recipe: { id: recipe.id, title: recipe.title, totalMinutes: recipe.totalMinutes, description: recipe.description, steps: recipe.steps },
    servings: meal.servings!,
    macros,
    favourite,
    ingredients: ingredients.map((i) => {
      const original = i.swappedFrom ?? i.food;
      return {
        id: i.id,
        foodId: i.food.id,
        name: i.food.name,
        grams: round(i.grams * portion, 1),
        // A household amount ("2 piezas") only describes the recipe's own food.
        quantity: i.swappedFrom ? null : round(i.quantity * portion, 2),
        unit: i.swappedFrom ? null : i.unit,
        note: i.note,
        swappedFrom: i.swappedFrom && { foodId: i.swappedFrom.id, name: i.swappedFrom.name },
        swappable: original.smaeGroup !== null && !!original.gramsPerEquivalent,
      };
    }),
  });

  /** The patient's allergies and disliked foods, which swaps must respect like the generator does. */
  const swapFilters = async (tenantId: string, patientId: string) => {
    const profile = await patients.planningProfile(tenantId, patientId);
    if (!profile) throw Errors.conflict('Finish the onboarding questionnaire first.');
    return { allergies: profile.allergies, dislikedFoodIds: profile.dislikedFoodIds };
  };

  const isFavourite = async (tenantId: string, patientId: string, recipeId: string) =>
    (await scoped(tenantId, (tx) => mealPlansRepository.favouriteRecipeIds(tx, tenantId, patientId))).includes(recipeId);

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

  /** The patient's energy target, which decides whether they have a plan at all. */
  const weekTarget = async (tenantId: string, patientId: string) => {
    const profile = await patients.planningProfile(tenantId, patientId);
    // The app only shows the plan after onboarding, so this is a client bug or a race with account deletion.
    if (!profile) throw Errors.conflict('Finish the onboarding questionnaire first.');
    return profile.energyTarget;
  };

  /**
   * The saved week with each meal's macros, recomputed from the FatSecret cache on every
   * read (nothing nutritional is stored). Generates the week first if it doesn't exist yet:
   * a patient who joins mid-week, or a week the weekly job hasn't reached, still gets a plan.
   */
  const readWeek = async (ctx: TenantContext, patientId: string, weekStart: string, log: Logger): Promise<MealPlanResponse> => {
    const target = await weekTarget(ctx.tenantId, patientId);
    if (target.status !== 'READY') return { status: 'CONSULT_NUTRITIONIST', reason: target.reason };

    const plan = await ensureWeek(ctx, patientId, weekStart, log);
    const { favourites, logs } = await scoped(ctx.tenantId, async (tx) => ({
      favourites: new Set(await mealPlansRepository.favouriteRecipeIds(tx, ctx.tenantId, patientId)),
      logs: await mealPlansRepository.logsBetween(tx, ctx.tenantId, patientId, new Date(weekStart), new Date(addDays(weekStart, 6))),
    }));
    const logBySlot = new Map(logs.map((l) => [slotKey(l.date, l.slot), toLogDto(l)]));

    const view = await mealViews(ctx.tenantId, plan.meals, log);
    const days: MealPlanDayDto[] = weekDates(weekStart).map((date) => {
      const meals = plan.meals
        .filter((m) => isoDate(m.date) === date)
        .map((m) => {
          const v = view(m);
          return {
            id: m.id,
            mealType: m.mealType,
            recipe: v ? { id: v.recipe.id, title: v.recipe.title, totalMinutes: v.recipe.totalMinutes } : null,
            servings: v ? m.servings : null,
            macros: v?.macros ?? null,
            favourite: v ? favourites.has(v.recipe.id) : false,
            log: logBySlot.get(slotKey(m.date, m.slot)) ?? null,
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

  /**
   * Today's check-offs, the week's adherence and the streak, from the plans and the logs
   * (nothing of it is stored). Generates the week first if needed, like `current`.
   */
  const progressOf = async (ctx: TenantContext, patientId: string, log: Logger): Promise<MealProgressResponse> => {
    const target = await weekTarget(ctx.tenantId, patientId);
    if (target.status !== 'READY') return { status: 'CONSULT_NUTRITIONIST', reason: target.reason };
    const now = new Date();
    const today = localToday(now);
    const weekStart = weekStartOf(now);
    await ensureWeek(ctx, patientId, weekStart, log);

    const from = new Date(addDays(today, -STREAK_LOOKBACK_DAYS));
    const { slots, logs } = await scoped(ctx.tenantId, async (tx) => ({
      slots: await mealPlansRepository.slotsBetween(tx, ctx.tenantId, patientId, from, new Date(today)),
      logs: await mealPlansRepository.logsBetween(tx, ctx.tenantId, patientId, from, new Date(today)),
    }));
    const logBySlot = new Map(logs.map((l) => [slotKey(l.date, l.slot), l]));
    const states: SlotState[] = slots.map((s) => ({
      date: isoDate(s.date), planned: s.recipeId !== null, status: logBySlot.get(slotKey(s.date, s.slot))?.status ?? null,
    }));
    const todays = states.filter((s) => s.date === today);

    // Kcal of what was eaten, from each check-off's snapshot of the meal (after swaps).
    const eaten = logs.filter((l) => isoDate(l.date) === today && l.status === 'EATEN');
    const view = await mealViews(ctx.tenantId, eaten.map((l) => ({ ...l, swaps: logSwaps(l.swaps) })), log);
    const kcal = eaten.map((l) => view({ ...l, swaps: logSwaps(l.swaps) })?.macros?.calories ?? null);

    return {
      status: 'READY',
      today: {
        date: today,
        meals: todays.length,
        answered: todays.filter((s) => s.status).length,
        eaten: todays.filter((s) => s.status === 'EATEN').length,
        // Like the plan's totals: no partial sum when a meal's kcal is unknown.
        kcal: kcal.every((k) => k !== null) ? kcal.reduce((sum, k) => sum + k!, 0) : null,
        targetKcal: target.targetKcal,
      },
      week: weekAdherence(states.filter((s) => s.date >= weekStart), today),
      streak: mealStreak(states, today),
    };
  };

  /** A meal of the patient's that can still be checked off (today or yesterday), or an error. */
  const loggableMeal = async (tx: TenantTx, tenantId: string, patientId: string, mealId: string) => {
    const meal = await mealPlansRepository.findPatientMeal(tx, tenantId, patientId, mealId);
    if (!meal) throw Errors.notFound('Meal');
    if (!canLog(isoDate(meal.date), localToday(new Date()))) throw Errors.validation('Only meals of today and yesterday can be checked off');
    return meal;
  };

  return {
    generateWeek,

    /** GET /meal-plans/current */
    current: async (ctx: TenantContext, log: Logger): Promise<MealPlanResponse> => {
      const { patientId, weekStart } = await me(ctx);
      return readWeek(ctx, patientId, weekStart, log);
    },

    /**
     * Every ingredient of the current week's meals for the patient's portions, after swaps:
     * what the shopping list adds up. Generates the week first if needed, like `current`.
     * A swapped ingredient has no household amount, only grams.
     */
    currentWeekIngredients: async (ctx: TenantContext, log: Logger) => {
      const { patientId, weekStart } = await me(ctx);
      const target = await weekTarget(ctx.tenantId, patientId);
      if (target.status !== 'READY') return { status: 'CONSULT_NUTRITIONIST' as const, reason: target.reason };

      const plan = await ensureWeek(ctx, patientId, weekStart, log);
      const view = await mealViews(ctx.tenantId, plan.meals, null);
      const ingredients = plan.meals.flatMap((m) => {
        const v = view(m);
        if (!v) return [];
        return v.ingredients.map((i) => ({
          food: { id: i.food.id, name: i.food.name, shoppingCategory: i.food.shoppingCategory },
          grams: i.grams * v.portion,
          quantity: i.swappedFrom ? null : i.quantity * v.portion,
          unit: i.swappedFrom ? null : i.unit,
        }));
      });
      return { status: 'READY' as const, patientId, weekStart, ingredients };
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
      const recipeIdsOn = (d: string) => plan.meals.filter((m) => m.recipeId && isoDate(m.date) === d).map((m) => m.recipeId!);

      // Meals already checked off stay: only the rest of the day gets new recipes.
      const loggedSlots = async (tx: TenantTx) =>
        new Set((await mealPlansRepository.logsBetween(tx, ctx.tenantId, patientId, new Date(date), new Date(date))).map((l) => l.slot));
      const dayMeals = plan.meals.filter((m) => isoDate(m.date) === date);
      const logged = await scoped(ctx.tenantId, loggedSlots);
      const kept = dayMeals.filter((m) => logged.has(m.slot));
      if (dayMeals.length > 0 && kept.length === dayMeals.length) throw Errors.conflict('Every meal of this day is already checked off');

      const [meals] = generateMealPlan({
        ...planning.input,
        // A fresh seed each time, so pressing it again gives yet another day.
        seed: randomUUID(),
        days: 1,
        startDay: day,
        alreadyPlanned: dates.flatMap((d, i) =>
          i === day ? [{ day: i, recipeIds: kept.flatMap((m) => (m.recipeId ? [m.recipeId] : [])) }] : [{ day: i, recipeIds: recipeIdsOn(d) }],
        ),
        avoidRecipeIds: dayMeals.filter((m) => !logged.has(m.slot) && m.recipeId).map((m) => m.recipeId!),
      });

      await scoped(ctx.tenantId, async (tx) => {
        // Read again inside the transaction: a meal checked off meanwhile is kept too.
        const now = await loggedSlots(tx);
        const keepSlots = dayMeals.filter((m) => now.has(m.slot)).map((m) => m.slot);
        await mealPlansRepository.replaceDay(
          tx, ctx.tenantId, plan.id, new Date(date),
          meals!.map((m, slot) => ({ slot, mealType: m.mealType, recipeId: m.recipeId, servings: m.recipeId ? m.servings : null })),
          keepSlots,
        );
        await writeAudit(tx, ctx, {
          action: 'MealPlanDayRegenerated', resourceType: 'MealPlan', resourceId: plan.id, metadata: { date, keptSlots: keepSlots.length },
        });
      });
      return readWeek(ctx, patientId, weekStart, log);
    },

    /**
     * PUT /meal-plans/favourites/:recipeId: ♥ a recipe, recorded against the current week
     * (training data for a future preference model). The generator prefers it from then on.
     */
    addFavourite: async (ctx: TenantContext, recipeId: string): Promise<void> => {
      const { patientId, weekStart } = await me(ctx);
      await scoped(ctx.tenantId, async (tx) => {
        if (!(await mealPlansRepository.recipeExists(tx, ctx.tenantId, recipeId))) throw Errors.notFound('Recipe');
        await mealPlansRepository.addFavourite(tx, ctx.tenantId, patientId, recipeId, new Date(weekStart));
      });
    },

    /** DELETE /meal-plans/favourites/:recipeId: un-♥ a recipe. Idempotent. */
    removeFavourite: async (ctx: TenantContext, recipeId: string): Promise<void> => {
      const { patientId } = await me(ctx);
      await scoped(ctx.tenantId, (tx) => mealPlansRepository.removeFavourite(tx, ctx.tenantId, patientId, recipeId));
    },

    /** GET /meal-plans/current/meals/:mealId: one meal of this week, its ingredients for the patient's portion, after swaps. */
    meal: async (ctx: TenantContext, mealId: string, log: Logger): Promise<PlannedMealDetailDto> => {
      const { patientId, meal, view } = await findMeal(ctx, mealId, log);
      return toDetail(meal, view, await isFavourite(ctx.tenantId, patientId, view.recipe.id));
    },

    /**
     * GET …/meals/:mealId/ingredients/:ingredientId/swaps: the foods of the ingredient's SMAE
     * group the patient can eat instead, with the grams that keep the same equivalents.
     * Empty when the food has no SMAE data.
     */
    swapOptions: async (ctx: TenantContext, mealId: string, ingredientId: string): Promise<FoodSwapOptionsResponse> => {
      const { patientId, view } = await findMeal(ctx, mealId, null);
      const ingredient = view.ingredients.find((i) => i.id === ingredientId);
      if (!ingredient) throw Errors.notFound('Ingredient');
      const original = ingredient.swappedFrom ?? ingredient.food;
      if (!original.smaeGroup || !original.gramsPerEquivalent) return { items: [] };

      // The recipe's grams for the patient's portion; each option keeps their equivalents.
      const grams = view.recipe.ingredients.find((i) => i.id === ingredientId)!.grams * view.portion;
      const options = swapOptions(original, ingredient.food, await foods.inSmaeGroup(original.smaeGroup), await swapFilters(ctx.tenantId, patientId));
      return {
        items: options.map((f) => ({
          foodId: f.id,
          name: f.name,
          grams: round(f.id === original.id ? grams : equivalentGrams(grams, original, f), 1),
          original: f.id === original.id,
        })),
      };
    },

    /**
     * PUT …/meals/:mealId/ingredients/:ingredientId/swap: eat `foodId` instead of the recipe's
     * food in this meal only (today or later). The recipe's own food undoes the swap. Returns
     * the updated meal.
     */
    swap: async (ctx: TenantContext, mealId: string, ingredientId: string, foodId: string, log: Logger): Promise<PlannedMealDetailDto> => {
      const { patientId, weekStart, meal, view } = await findMeal(ctx, mealId, null);
      if (isoDate(meal.date) < localToday(new Date())) throw Errors.validation('Past meals can’t be changed');
      const ingredient = view.ingredients.find((i) => i.id === ingredientId);
      if (!ingredient) throw Errors.notFound('Ingredient');
      const original = ingredient.swappedFrom ?? ingredient.food;

      if (foodId !== original.id && foodId !== ingredient.food.id) {
        const food = (await foods.byIds([foodId])).get(foodId);
        if (!food) throw Errors.notFound('Food');
        if (!canSwap(original, food)) throw Errors.validation('The food isn’t an SMAE equivalent of this ingredient');
        if (!swapOptions(original, ingredient.food, [food], await swapFilters(ctx.tenantId, patientId)).length) {
          throw Errors.validation('The food conflicts with the patient’s allergies or disliked foods');
        }
      }

      if (foodId !== ingredient.food.id) {
        await scoped(ctx.tenantId, async (tx) => {
          // Regenerating the day in between removes the meal (and would fail the insert).
          if (!(await mealPlansRepository.findMeal(tx, ctx.tenantId, patientId, new Date(weekStart), mealId))) throw Errors.notFound('Meal');
          if (foodId === original.id) await mealPlansRepository.removeSwap(tx, ctx.tenantId, mealId, ingredientId);
          else await mealPlansRepository.setSwap(tx, ctx.tenantId, mealId, ingredientId, foodId);
          // A meal already checked off as eaten was eaten with this swap.
          const swapped = (await mealPlansRepository.findMeal(tx, ctx.tenantId, patientId, new Date(weekStart), mealId))!.swaps;
          await mealPlansRepository.updateLogSwaps(tx, ctx.tenantId, patientId, meal.date, meal.slot, swapped);
          await writeAudit(tx, ctx, {
            action: 'MealIngredientSwapped', resourceType: 'MealPlanMeal', resourceId: mealId,
            metadata: { recipeIngredientId: ingredientId, fromFoodId: ingredient.food.id, toFoodId: foodId },
          });
        });
      }

      const updated = await findMeal(ctx, mealId, log);
      return toDetail(updated.meal, updated.view, await isFavourite(ctx.tenantId, patientId, updated.view.recipe.id));
    },

    /** GET /meal-plans/progress */
    progress: async (ctx: TenantContext, log: Logger): Promise<MealProgressResponse> => progressOf(ctx, (await me(ctx)).patientId, log),

    /**
     * PUT /meal-plans/meals/:mealId/log: check off a meal of today or yesterday (which may be
     * last week's). Keeps what the meal held (recipe, servings, swaps), so the answer survives
     * a regenerated day. Replaces an earlier answer. Not audited, like water: it's the patient's own diary.
     */
    logMeal: async (ctx: TenantContext, mealId: string, input: MealLogData, log: Logger): Promise<MealLogResponse> => {
      const { patientId } = await me(ctx);
      const saved = await scoped(ctx.tenantId, async (tx) => {
        const meal = await loggableMeal(tx, ctx.tenantId, patientId, mealId);
        if (!meal.recipeId && input.status !== 'OTHER') throw Errors.validation('A meal with no recipe can only be logged as something else');
        return mealPlansRepository.saveLog(tx, ctx.tenantId, patientId, {
          date: meal.date, slot: meal.slot, mealType: meal.mealType, status: input.status, note: input.note,
          recipeId: meal.recipeId, servings: meal.recipeId ? meal.servings : null, swaps: meal.swaps, source: input.source,
        });
      });
      return { log: toLogDto(saved), progress: await progressOf(ctx, patientId, log) };
    },

    /** DELETE /meal-plans/meals/:mealId/log: undo a check-off of today or yesterday. Idempotent. */
    unlogMeal: async (ctx: TenantContext, mealId: string, log: Logger): Promise<MealProgressResponse> => {
      const { patientId } = await me(ctx);
      await scoped(ctx.tenantId, async (tx) => {
        const meal = await loggableMeal(tx, ctx.tenantId, patientId, mealId);
        await mealPlansRepository.removeLog(tx, ctx.tenantId, patientId, meal.date, meal.slot);
      });
      return progressOf(ctx, patientId, log);
    },
  };
}
