import { withTenant } from '@limon/database';
import type { TenantContext } from '@limon/tenant';
import type { FoodDetail, RecipeDetailDto, RecipeListResponse } from '@limon/types';
import type { RecipeListQuery } from '@limon/validation';
import type { Container } from '../../infrastructure/container.js';
import { Errors } from '../../lib/errors.js';
import { macrosPerServing } from './recipe-nutrition.js';
import { recipesRepository } from './recipes.repository.js';

type Logger = { warn: (obj: object, msg: string) => void };

/** Spanish order: "Ñame" after "Nuez", accents ignored. */
const byTitle = new Intl.Collator('es-MX').compare;

export function createRecipesService(c: Container) {
  const scoped = async <T>(ctx: TenantContext, fn: Parameters<typeof withTenant<T>>[2]) =>
    withTenant(c.db, await c.registry.getPlacement(ctx.tenantId), fn);

  /**
   * The foods' FatSecret data, through the 24 h cache. A food that can't be fetched is
   * left out, so the recipe still loads (without macros) while FatSecret is down.
   */
  const fetchFoods = async (fatsecretFoodIds: string[], log: Logger) => {
    const foods = new Map<string, FoodDetail>();
    if (!c.fatsecret) return foods;
    await Promise.all(
      [...new Set(fatsecretFoodIds)].map(async (id) => {
        try {
          foods.set(id, await c.fatsecret!.getFood(id));
        } catch (err) {
          log.warn({ fatsecretFoodId: id, reason: (err as { reason?: string }).reason }, 'FatSecret food.get failed; recipe shown without macros');
        }
      }),
    );
    return foods;
  };

  return {
    list: (ctx: TenantContext, query: RecipeListQuery): Promise<RecipeListResponse> =>
      scoped(ctx, async (tx) => ({
        items: (await recipesRepository.list(tx, ctx.tenantId, query.mealType)).sort((a, b) => byTitle(a.title, b.title)),
      })),

    get: async (ctx: TenantContext, id: string, log: Logger): Promise<RecipeDetailDto> => {
      // FatSecret is called after the transaction, so a slow provider doesn't hold a connection.
      const recipe = await scoped(ctx, (tx) => recipesRepository.findById(tx, ctx.tenantId, id));
      // Another tenant's recipe is indistinguishable from a non-existent one (no enumeration).
      if (!recipe) throw Errors.notFound('Recipe');

      const foods = await fetchFoods(recipe.ingredients.map((i) => i.food.fatsecretFoodId), log);
      const { ingredients, ...rest } = recipe;
      return {
        ...rest,
        ingredients: ingredients.map((i) => ({ foodId: i.food.id, name: i.food.name, quantity: i.quantity, unit: i.unit, grams: i.grams, note: i.note })),
        macrosPerServing: macrosPerServing(
          ingredients.map((i) => ({ grams: i.grams, fatsecretFoodId: i.food.fatsecretFoodId, fatsecretServingId: i.food.fatsecretServingId })),
          recipe.servings,
          foods,
        ),
      };
    },
  };
}
