import type { TenantTx } from '@limon/database';
import type { MealType } from '@limon/types';

const summarySelect = { id: true, title: true, mealTypes: true, servings: true, totalMinutes: true } as const;

/**
 * Every query filters by tenantId explicitly (defence in depth on top of RLS).
 */
export const recipesRepository = {
  list: (tx: TenantTx, tenantId: string, mealType?: MealType) =>
    tx.recipe.findMany({ where: { tenantId, ...(mealType ? { mealTypes: { has: mealType } } : {}) }, select: summarySelect }),

  /** With ingredients in recipe order, and the food ids FatSecret needs for the macros. */
  findById: (tx: TenantTx, tenantId: string, id: string) =>
    tx.recipe.findFirst({
      where: { id, tenantId },
      select: {
        ...summarySelect, description: true, tags: true, steps: true,
        ingredients: {
          orderBy: { position: 'asc' },
          select: {
            quantity: true, unit: true, grams: true, note: true,
            food: { select: { id: true, name: true, fatsecretFoodId: true, fatsecretServingId: true } },
          },
        },
      },
    }),

  /** Recipes (all, or these ids) with what macros, filters and portions need. */
  listWithIngredients: (tx: TenantTx, tenantId: string, ids?: string[]) =>
    tx.recipe.findMany({
      where: { tenantId, ...(ids ? { id: { in: ids } } : {}) },
      select: {
        id: true, title: true, mealTypes: true, servings: true, totalMinutes: true,
        ingredients: {
          select: { grams: true, food: { select: { id: true, allergens: true, fatsecretFoodId: true, fatsecretServingId: true } } },
        },
      },
    }),
};
