import type { FoodCatalogResponse, FoodDetail, FoodSearchResponse } from '@limon/types';
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

    search: (query: FoodSearchQuery, log: Logger): Promise<FoodSearchResponse> =>
      provider('search', () => client().searchFoods(query.q, query.page, query.pageSize), log),

    get: (fatsecretFoodId: string, log: Logger): Promise<FoodDetail> =>
      provider('food.get', () => client().getFood(fatsecretFoodId), log),
  };
}
