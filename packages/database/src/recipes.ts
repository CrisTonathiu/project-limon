import { randomUUID } from 'node:crypto';
import type { TenantTx } from './tenant-client.js';

/**
 * Copies the default recipe library into a tenant's own recipes, with their ingredients.
 * Runs when a tenant is created, and again from `pnpm admin recipes <slug>` when the
 * library has grown since. Default recipes the tenant already has a copy of are skipped,
 * so their edits are never overwritten (the copy is matched by source_default_recipe_id).
 * A copy the tenant deleted is copied again on the next run.
 *
 * Call it inside the tenant's transaction (withTenant): RLS then rejects any row tagged
 * with another tenant. Returns the number of recipes copied.
 */
export async function copyDefaultRecipes(tx: TenantTx, tenantId: string): Promise<number> {
  const copied = await tx.recipe.findMany({
    where: { tenantId, sourceDefaultRecipeId: { not: null } },
    select: { sourceDefaultRecipeId: true },
  });
  const defaults = await tx.defaultRecipe.findMany({
    where: { id: { notIn: copied.map((r) => r.sourceDefaultRecipeId!) } },
    include: { ingredients: true },
  });
  if (defaults.length === 0) return 0;

  // Ids generated here so recipes and ingredients go in two bulk inserts, not one per recipe.
  const recipes = defaults.map((d) => ({ id: randomUUID(), source: d }));
  await tx.recipe.createMany({
    data: recipes.map(({ id, source: d }) => ({
      id,
      tenantId,
      sourceDefaultRecipeId: d.id,
      title: d.title,
      description: d.description,
      mealTypes: d.mealTypes,
      servings: d.servings,
      totalMinutes: d.totalMinutes,
      imageKey: d.imageKey,
      tags: d.tags,
      steps: d.steps,
    })),
  });
  await tx.recipeIngredient.createMany({
    data: recipes.flatMap(({ id, source: d }) =>
      d.ingredients.map((i) => ({
        tenantId,
        recipeId: id,
        foodId: i.foodId,
        position: i.position,
        quantity: i.quantity,
        unit: i.unit,
        grams: i.grams,
        note: i.note,
      })),
    ),
  });
  return recipes.length;
}
