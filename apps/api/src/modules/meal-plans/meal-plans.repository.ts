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
};
