import type { FoodDetail, FoodSearchResponse } from '@limon/types';
import type { FoodSearchQuery } from '@limon/validation';
import { FatSecretError, type FatSecretClient } from '../../infrastructure/fatsecret.js';
import type { Container } from '../../infrastructure/container.js';
import { Errors } from '../../lib/errors.js';

/**
 * Nutrition data lookups (FatSecret). Nothing here touches the database: FatSecret's
 * terms only allow storing ids, so values live in the client's < 24 h memory cache.
 * Tenant-independent — every tenant sees the same FatSecret data.
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

  return {
    search: (query: FoodSearchQuery, log: Logger): Promise<FoodSearchResponse> =>
      provider('search', () => client().searchFoods(query.q, query.page, query.pageSize), log),

    get: (fatsecretFoodId: string, log: Logger): Promise<FoodDetail> =>
      provider('food.get', () => client().getFood(fatsecretFoodId), log),
  };
}
