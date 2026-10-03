import { withTenant } from '@limon/database';
import type { TenantContext } from '@limon/tenant';
import type { MealType, RecipeDetailDto, RecipeListResponse } from '@limon/types';
import type { RecipeListQuery } from '@limon/validation';
import type { Container } from '../../infrastructure/container.js';
import { Errors } from '../../lib/errors.js';
import { createFoodsService } from '../foods/foods.service.js';
import { macrosPerServing } from './recipe-nutrition.js';
import { recipesRepository } from './recipes.repository.js';

type Logger = { warn: (obj: object, msg: string) => void };

/** Spanish order: "Ñame" after "Nuez", accents ignored. */
const byTitle = new Intl.Collator('es-MX').compare;

/** A recipe as the meal plan generator sees it. Macros are null when FatSecret can't provide them. */
export type PlanningRecipe = {
  id: string;
  title: string;
  mealTypes: MealType[];
  foodIds: string[];
  allergens: string[];
  perServing: { kcal: number; proteinG: number } | null;
};

export function createRecipesService(c: Container) {
  const foods = createFoodsService(c);
  const scoped = async <T>(ctx: TenantContext, fn: Parameters<typeof withTenant<T>>[2]) =>
    withTenant(c.db, await c.registry.getPlacement(ctx.tenantId), fn);

  /** FatSecret is called after the transaction, so a slow provider doesn't hold a connection. */
  const withMacros = async (tenantId: string, ids: string[] | undefined, log: Logger) => {
    const recipes = await withTenant(c.db, await c.registry.getPlacement(tenantId), (tx) => recipesRepository.listWithIngredients(tx, tenantId, ids));
    const fatsecret = await foods.getMany(recipes.flatMap((r) => r.ingredients.map((i) => i.food.fatsecretFoodId)), log);
    return recipes.map((r) => ({
      ...r,
      macrosPerServing: macrosPerServing(
        r.ingredients.map((i) => ({ grams: i.grams, fatsecretFoodId: i.food.fatsecretFoodId, fatsecretServingId: i.food.fatsecretServingId })),
        r.servings,
        fatsecret,
      ),
    }));
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

      const fatsecret = await foods.getMany(recipe.ingredients.map((i) => i.food.fatsecretFoodId), log);
      const { ingredients, ...rest } = recipe;
      return {
        ...rest,
        ingredients: ingredients.map((i) => ({ foodId: i.food.id, name: i.food.name, quantity: i.quantity, unit: i.unit, grams: i.grams, note: i.note })),
        macrosPerServing: macrosPerServing(
          ingredients.map((i) => ({ grams: i.grams, fatsecretFoodId: i.food.fatsecretFoodId, fatsecretServingId: i.food.fatsecretServingId })),
          recipe.servings,
          fatsecret,
        ),
      };
    },

    /**
     * The tenant's recipes with their macros per serving, for the meal plan generator.
     * Takes a tenant id rather than a TenantContext because the weekly job and the admin
     * command generate plans with no user signed in.
     */
    forPlanning: async (tenantId: string, log: Logger): Promise<PlanningRecipe[]> =>
      (await withMacros(tenantId, undefined, log)).map((r) => ({
        id: r.id,
        title: r.title,
        mealTypes: r.mealTypes,
        foodIds: [...new Set(r.ingredients.map((i) => i.food.id))],
        allergens: [...new Set(r.ingredients.flatMap((i) => i.food.allergens))],
        perServing: r.macrosPerServing && { kcal: r.macrosPerServing.calories, proteinG: r.macrosPerServing.protein },
      })),

    /** Title, time and macros per serving of these recipes, by id: for showing a meal plan. */
    summariesWithMacros: async (tenantId: string, ids: string[], log: Logger) =>
      new Map(
        (await withMacros(tenantId, ids, log)).map((r) => [
          r.id,
          { id: r.id, title: r.title, totalMinutes: r.totalMinutes, macrosPerServing: r.macrosPerServing },
        ]),
      ),
  };
}
