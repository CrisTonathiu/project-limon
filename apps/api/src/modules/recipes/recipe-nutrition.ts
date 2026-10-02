import type { FoodDetail, RecipeMacros } from '@limon/types';

/**
 * Macros per serving of a recipe, from each ingredient's grams and its catalog serving
 * on FatSecret. Pure: the caller fetches the foods (through the 24 h cache).
 *
 * Returns null when any ingredient can't be counted (food not fetched, serving gone,
 * no metric size, or a missing value): a total that silently skips an ingredient would
 * understate the recipe. Servings measured in ml are counted as 1 g per ml, which is
 * close enough for the liquids in recipes (water, milk, broth).
 */
export type NutritionIngredient = { grams: number; fatsecretFoodId: string; fatsecretServingId: string };

const MACROS = ['calories', 'protein', 'carbohydrate', 'fat'] as const;

export function macrosPerServing(
  ingredients: NutritionIngredient[],
  servings: number,
  foods: ReadonlyMap<string, FoodDetail>,
): RecipeMacros | null {
  const total: RecipeMacros = { calories: 0, protein: 0, carbohydrate: 0, fat: 0 };
  for (const i of ingredients) {
    const serving = foods.get(i.fatsecretFoodId)?.servings.find((s) => s.fatsecretServingId === i.fatsecretServingId);
    const unit = serving?.metricUnit?.toLowerCase();
    if (!serving?.metricAmount || (unit !== 'g' && unit !== 'ml')) return null;
    const factor = i.grams / serving.metricAmount;
    for (const m of MACROS) {
      const value = serving.nutrients[m];
      if (value === null) return null;
      total[m] += value * factor;
    }
  }
  if (!ingredients.length || servings <= 0) return null;
  const round = (n: number) => Math.round((n / servings) * 10) / 10;
  return { calories: Math.round(total.calories / servings), protein: round(total.protein), carbohydrate: round(total.carbohydrate), fat: round(total.fat) };
}
