import { DatabaseRouter } from '@limon/database';
import type { SmaeGroup } from '@limon/types';

/** A food's name, or its name with SMAE data and allergens for swaps and allergy filters. */
type TestFood = string | { name: string; smaeGroup?: SmaeGroup; gramsPerEquivalent?: number; allergens?: string[] };

/**
 * Catalog foods for a test file, written with the owner role (foods is read-only for the
 * app role). Keys start with the file's prefix, so files never share
 * rows. `cleanup` also removes the recipes, swaps and disliked-food rows that point at them.
 */
export async function createTestFoods(prefix: string, names: TestFood[]) {
  const owner = new DatabaseRouter({ url: process.env.DATABASE_MIGRATION_URL });
  const db = owner.controlPlane();
  const foods = [];
  for (const [i, food] of names.entries()) {
    const key = `${prefix}-${i}`;
    const { name, smaeGroup = null, gramsPerEquivalent = null, allergens = [] } = typeof food === 'string' ? { name: food } : food;
    const data = { name, smaeGroup, gramsPerEquivalent, allergens, fatsecretFoodId: `test-${key}`, fatsecretServingId: '1', shoppingCategory: 'GROCERY' as const };
    foods.push(await db.food.upsert({ where: { key }, create: { key, ...data }, update: data, select: { id: true, name: true } }));
  }
  const ids = foods.map((f) => f.id);
  return {
    foods,
    cleanup: async () => {
      // Every recipe made from these foods, with the plan meals and favourites using it, including
      // what an earlier run left behind when it crashed before its own cleanup.
      const usesFoods = { ingredients: { some: { foodId: { in: ids } } } };
      await db.mealPlanMealSwap.deleteMany({ where: { foodId: { in: ids } } });
      await db.mealPlanMeal.deleteMany({ where: { recipe: usesFoods } });
      await db.mealFeedback.deleteMany({ where: { recipe: usesFoods } });
      await db.recipe.deleteMany({ where: usesFoods });
      await db.patientDislikedFood.deleteMany({ where: { foodId: { in: ids } } });
      await db.food.deleteMany({ where: { id: { in: ids } } });
      await owner.disconnect();
    },
  };
}
