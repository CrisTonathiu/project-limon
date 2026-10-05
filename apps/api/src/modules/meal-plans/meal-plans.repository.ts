import type { TenantTx } from '@limon/database';
import type { MealType } from '@limon/types';

export type MealRow = { date: Date; slot: number; mealType: MealType; recipeId: string | null; servings: number | null };

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
        meals: { orderBy: [{ date: 'asc' }, { slot: 'asc' }], select: { id: true, date: true, slot: true, mealType: true, recipeId: true, servings: true } },
      },
    }),

  /** Replaces one date's meals. Touching the plan row first serializes concurrent regenerations of it. */
  replaceDay: async (tx: TenantTx, tenantId: string, mealPlanId: string, date: Date, meals: Omit<MealRow, 'date'>[]) => {
    await tx.mealPlan.update({ where: { tenantId_id: { tenantId, id: mealPlanId } }, data: { updatedAt: new Date() } });
    await tx.mealPlanMeal.deleteMany({ where: { tenantId, mealPlanId, date } });
    await tx.mealPlanMeal.createMany({ data: meals.map((m) => ({ tenantId, mealPlanId, date, ...m })) });
  },
};
