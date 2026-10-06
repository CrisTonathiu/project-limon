import type { FoodCatalogResponse, FoodDetail, FoodSearchResponse, SmaeGroup } from '@limon/types';
import type { FoodSearchQuery } from '@limon/validation';
import { FatSecretError, type FatSecretClient } from '../../infrastructure/fatsecret.js';
import type { Container } from '../../infrastructure/container.js';
import { Errors } from '../../lib/errors.js';

/**
 * Food lookups, tenant-independent: our food catalog (global table, no RLS), and
 * FatSecret data, whose terms only allow storing ids, so values live in the
 * client's < 24 h memory cache.
 */
type Logger = { warn: (obj: object, msg: string) => void };

const swapFoodSelect = {
  id: true, name: true, smaeGroup: true, gramsPerEquivalent: true, allergens: true, shoppingCategory: true, fatsecretFoodId: true, fatsecretServingId: true,
} as const;

export function createFoodsService(c: Container) {
  const client = (): FatSecretClient => {
    if (!c.fatsecret) throw Errors.nutritionProviderUnavailable();
    return c.fatsecret;
  };

  /** FatSecret failures become our error codes; details (which may include our IP) stay in the logs. */
  const provider = async <T>(what: string, fn: () => Promise<T>, log: Logger): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof FatSecretError)) throw err;
      if (err.reason === 'invalid_id') throw Errors.notFound('Food');
      log.warn({ reason: err.reason, fatsecretCode: err.fatsecretCode, detail: err.message }, `FatSecret ${what} failed`);
      throw Errors.nutritionProviderUnavailable();
    }
  };

  /** Spanish order: "Ñame" after "Nuez", accents ignored. */
  const byName = new Intl.Collator('es-MX').compare;

  return {
    /** Ids and our Spanish names only, never FatSecret data. */
    catalog: async (): Promise<FoodCatalogResponse> => {
      const foods = await c.db.controlPlane().food.findMany({ select: { id: true, name: true } });
      return { items: foods.sort((a, b) => byName(a.name, b.name)) };
    },

    /** Catalog foods with their SMAE data, by id (global table, no tenant). */
    byIds: async (ids: string[]) =>
      new Map((await c.db.controlPlane().food.findMany({ where: { id: { in: ids } }, select: swapFoodSelect })).map((f) => [f.id, f])),

    /** Every catalog food of an SMAE group, for swaps. */
    inSmaeGroup: async (group: SmaeGroup) =>
      (await c.db.controlPlane().food.findMany({ where: { smaeGroup: group }, select: swapFoodSelect })).sort((a, b) => byName(a.name, b.name)),

    search: (query: FoodSearchQuery, log: Logger): Promise<FoodSearchResponse> =>
      provider('search', () => client().searchFoods(query.q, query.page, query.pageSize), log),

    get: (fatsecretFoodId: string, log: Logger): Promise<FoodDetail> =>
      provider('food.get', () => client().getFood(fatsecretFoodId), log),

    /**
     * Several foods' FatSecret data, through the 24 h cache. A food that can't be fetched is
     * left out instead of failing the call, so callers can still answer without its macros.
     */
    getMany: async (fatsecretFoodIds: string[], log: Logger): Promise<Map<string, FoodDetail>> => {
      const foods = new Map<string, FoodDetail>();
      if (!c.fatsecret) return foods;
      const failures: Record<string, string[]> = {};
      await Promise.all(
        [...new Set(fatsecretFoodIds)].map(async (id) => {
          try {
            foods.set(id, await c.fatsecret!.getFood(id));
          } catch (err) {
            (failures[(err as { reason?: string }).reason ?? 'unknown'] ??= []).push(id);
          }
        }),
      );
      // One line per call, not per food: an outage would otherwise log every food in the catalog.
      if (Object.keys(failures).length) {
        const failed = Object.fromEntries(Object.entries(failures).map(([reason, ids]) => [reason, ids.length]));
        log.warn({ failed, fatsecretFoodIds: Object.values(failures).flat().slice(0, 10) }, 'FatSecret food.get failed; foods left out');
      }
      return foods;
    },
  };
}
