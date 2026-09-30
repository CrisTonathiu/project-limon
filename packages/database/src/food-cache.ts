import type { FoodDetail } from '@limon/types';
import type { DatabaseRouter } from './client.js';

/**
 * Shared cache of FatSecret food data (table fatsecret_food_cache, 0007).
 *
 * FatSecret's terms allow caching for at most 24 h, so every row carries
 * `expiresAt = fetchedAt + 24 h`: expired rows are never returned and `purgeExpired`
 * deletes them. Not tenant data — one row per food serves every tenant.
 */
export type FoodCacheKey = { fatsecretFoodId: string; region: string; language: string };

export const FOOD_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** last_used_at is bumped at most this often, so reads don't turn into a write each time. */
const TOUCH_EVERY_MS = 60 * 60 * 1000;

export interface FoodCacheStore {
  /** The cached food if it hasn't expired; marks it as recently used. */
  get(key: FoodCacheKey, now: Date): Promise<FoodDetail | null>;
  /** Saves a freshly fetched food. Expires 24 h after `fetchedAt`. */
  put(key: FoodCacheKey, food: FoodDetail, fetchedAt: Date): Promise<void>;
  delete(key: FoodCacheKey): Promise<void>;
  /** Foods to refetch: fetched before `fetchedBefore` and used since `usedSince`, oldest first. */
  listDue(filter: { region: string; language: string; fetchedBefore: Date; usedSince: Date; limit: number }): Promise<string[]>;
  /** Deletes every row past its 24 h limit. Returns how many were deleted. */
  purgeExpired(now: Date): Promise<number>;
}

export function createFoodCacheStore(router: DatabaseRouter): FoodCacheStore {
  const db = () => router.controlPlane();
  const id = (k: FoodCacheKey) => ({ fatsecretFoodId_region_language: k });

  return {
    async get(key, now) {
      const row = await db().fatSecretFoodCache.findFirst({
        where: { ...key, expiresAt: { gt: now } },
        select: { food: true, lastUsedAt: true },
      });
      if (!row) return null;
      if (now.getTime() - row.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
        await db().fatSecretFoodCache.updateMany({ where: key, data: { lastUsedAt: now } });
      }
      return row.food as unknown as FoodDetail;
    },

    async put(key, food, fetchedAt) {
      const data = {
        food: food as unknown as object,
        fetchedAt,
        expiresAt: new Date(fetchedAt.getTime() + FOOD_CACHE_MAX_AGE_MS),
      };
      // A refresh keeps last_used_at; only real reads (get) move it.
      await db().fatSecretFoodCache.upsert({
        where: id(key),
        update: data,
        create: { ...key, ...data, lastUsedAt: fetchedAt },
      });
    },

    async delete(key) {
      await db().fatSecretFoodCache.deleteMany({ where: key });
    },

    async listDue({ region, language, fetchedBefore, usedSince, limit }) {
      const rows = await db().fatSecretFoodCache.findMany({
        where: { region, language, fetchedAt: { lt: fetchedBefore }, lastUsedAt: { gte: usedSince } },
        orderBy: { fetchedAt: 'asc' },
        take: limit,
        select: { fatsecretFoodId: true },
      });
      return rows.map((r) => r.fatsecretFoodId);
    },

    async purgeExpired(now) {
      return (await db().fatSecretFoodCache.deleteMany({ where: { expiresAt: { lte: now } } })).count;
    },
  };
}
