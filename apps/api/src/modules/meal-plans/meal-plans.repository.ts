import type { TenantTx } from '@limon/database';
import type { MealLogSource, MealLogStatus, MealType } from '@limon/types';

export type MealRow = { date: Date; slot: number; mealType: MealType; recipeId: string | null; servings: number | null };

const mealSelect = {
  id: true, date: true, slot: true, mealType: true, recipeId: true, servings: true,
  swaps: { select: { recipeIngredientId: true, foodId: true } },
} as const;

/**
 * Every query filters by tenantId explicitly (defence in depth on top of RLS).
 */
export const mealPlansRepository = {
  /** Recipes the patient marked ♥ in any week. */
  favouriteRecipeIds: async (tx: TenantTx, tenantId: string, patientId: string) =>
    (
      await tx.mealFeedback.findMany({ where: { tenantId, patientId, rating: 1 }, select: { recipeId: true }, distinct: ['recipeId'] })
    ).map((f) => f.recipeId),

  recipeExists: async (tx: TenantTx, tenantId: string, recipeId: string) =>
    (await tx.recipe.count({ where: { tenantId, id: recipeId } })) > 0,

  /** ♥ from this week's plan. Favouriting the same recipe again in the same week is a no-op. */
  addFavourite: (tx: TenantTx, tenantId: string, patientId: string, recipeId: string, weekStart: Date) =>
    tx.mealFeedback.upsert({
      where: { tenantId_patientId_recipeId_weekStart: { tenantId, patientId, recipeId, weekStart } },
      create: { tenantId, patientId, recipeId, weekStart, rating: 1 },
      update: { rating: 1 },
      select: { id: true },
    }),

  /** Un-♥ removes the favourite from every week, so the generator stops preferring the recipe. */
  removeFavourite: (tx: TenantTx, tenantId: string, patientId: string, recipeId: string) =>
    tx.mealFeedback.deleteMany({ where: { tenantId, patientId, recipeId, rating: 1 } }),

  /** Creates the week's plan, or replaces all its meals if it exists. */
  saveWeek: async (tx: TenantTx, tenantId: string, patientId: string, weekStart: Date, meals: MealRow[]) => {
    const plan = await tx.mealPlan.upsert({
      where: { tenantId_patientId_weekStart: { tenantId, patientId, weekStart } },
      create: { tenantId, patientId, weekStart },
      update: { updatedAt: new Date() },
      select: { id: true },
    });
    await tx.mealPlanMeal.deleteMany({ where: { tenantId, mealPlanId: plan.id } });
    await tx.mealPlanMeal.createMany({ data: meals.map((m) => ({ tenantId, mealPlanId: plan.id, ...m })) });
    return plan;
  },

  findWeek: (tx: TenantTx, tenantId: string, patientId: string, weekStart: Date) =>
    tx.mealPlan.findUnique({
      where: { tenantId_patientId_weekStart: { tenantId, patientId, weekStart } },
      select: {
        id: true,
        meals: { orderBy: [{ date: 'asc' }, { slot: 'asc' }], select: mealSelect },
      },
    }),

  /** One meal of the patient's plan for that week, or null (another patient's meal looks the same as a missing one). */
  findMeal: (tx: TenantTx, tenantId: string, patientId: string, weekStart: Date, mealId: string) =>
    tx.mealPlanMeal.findFirst({ where: { tenantId, id: mealId, mealPlan: { patientId, weekStart } }, select: mealSelect }),

  /** The meal eats `foodId` instead of the recipe ingredient's food. Replaces an earlier swap of that ingredient. */
  setSwap: (tx: TenantTx, tenantId: string, mealPlanMealId: string, recipeIngredientId: string, foodId: string) =>
    tx.mealPlanMealSwap.upsert({
      where: { tenantId_mealPlanMealId_recipeIngredientId: { tenantId, mealPlanMealId, recipeIngredientId } },
      create: { tenantId, mealPlanMealId, recipeIngredientId, foodId },
      update: { foodId },
      select: { id: true },
    }),

  /** Back to the recipe's food. Idempotent. */
  removeSwap: (tx: TenantTx, tenantId: string, mealPlanMealId: string, recipeIngredientId: string) =>
    tx.mealPlanMealSwap.deleteMany({ where: { tenantId, mealPlanMealId, recipeIngredientId } }),

  /**
   * Replaces one date's meals, except the slots in `keepSlots` (already checked off). Touching
   * the plan row first serializes concurrent regenerations of it.
   */
  replaceDay: async (tx: TenantTx, tenantId: string, mealPlanId: string, date: Date, meals: Omit<MealRow, 'date'>[], keepSlots: number[] = []) => {
    await tx.mealPlan.update({ where: { tenantId_id: { tenantId, id: mealPlanId } }, data: { updatedAt: new Date() } });
    await tx.mealPlanMeal.deleteMany({ where: { tenantId, mealPlanId, date, slot: { notIn: keepSlots } } });
    await tx.mealPlanMeal.createMany({ data: meals.filter((m) => !keepSlots.includes(m.slot)).map((m) => ({ tenantId, mealPlanId, date, ...m })) });
  },

  /** One meal of any of the patient's plans, or null. Check-offs reach back to yesterday, which may be last week. */
  findPatientMeal: (tx: TenantTx, tenantId: string, patientId: string, mealId: string) =>
    tx.mealPlanMeal.findFirst({ where: { tenantId, id: mealId, mealPlan: { patientId } }, select: mealSelect }),

  /** Every meal slot of the patient's plans between two dates (inclusive). */
  slotsBetween: (tx: TenantTx, tenantId: string, patientId: string, from: Date, to: Date) =>
    tx.mealPlanMeal.findMany({
      where: { tenantId, mealPlan: { patientId }, date: { gte: from, lte: to } },
      select: { date: true, slot: true, recipeId: true },
    }),

  logsBetween: (tx: TenantTx, tenantId: string, patientId: string, from: Date, to: Date) =>
    tx.mealLog.findMany({
      where: { tenantId, patientId, date: { gte: from, lte: to } },
      select: { id: true, date: true, slot: true, mealType: true, status: true, note: true, recipeId: true, servings: true, swaps: true, loggedAt: true },
    }),

  /** Answers the slot, replacing an earlier answer and its snapshot of the meal. */
  saveLog: (tx: TenantTx, tenantId: string, patientId: string, log: MealLogRow) =>
    tx.mealLog.upsert({
      where: { tenantId_patientId_date_slot: { tenantId, patientId, date: log.date, slot: log.slot } },
      create: { tenantId, patientId, ...log },
      update: { ...log, loggedAt: new Date() },
      select: { status: true, note: true, loggedAt: true },
    }),

  /** Undo a check-off. Idempotent. */
  removeLog: (tx: TenantTx, tenantId: string, patientId: string, date: Date, slot: number) =>
    tx.mealLog.deleteMany({ where: { tenantId, patientId, date, slot } }),

  /** A swap on a meal already checked off updates what the check-off says was eaten. */
  updateLogSwaps: (tx: TenantTx, tenantId: string, patientId: string, date: Date, slot: number, swaps: MealLogSwap[]) =>
    tx.mealLog.updateMany({ where: { tenantId, patientId, date, slot }, data: { swaps } }),
};

export type MealLogSwap = { recipeIngredientId: string; foodId: string };

export type MealLogRow = {
  date: Date;
  slot: number;
  mealType: MealType;
  status: MealLogStatus;
  note: string | null;
  recipeId: string | null;
  servings: number | null;
  swaps: MealLogSwap[];
  source: MealLogSource;
};
