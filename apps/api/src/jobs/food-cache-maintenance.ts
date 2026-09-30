import { createFoodCacheStore, type FoodCacheStore } from '@limon/database';
import type { Container } from '../infrastructure/container.js';
import { FatSecretError } from '../infrastructure/fatsecret.js';

/**
 * Keeps the shared FatSecret cache (fatsecret_food_cache) fresh and compliant.
 * Runs in the worker every MAINTENANCE_INTERVAL_MS (see worker.ts), or once with
 * `pnpm --filter @limon/api fatsecret refresh`.
 *
 * 1. Purge: delete every row past FatSecret's 24 h limit. Always runs, even when
 *    FatSecret is down or not configured.
 * 2. Refresh: refetch foods older than REFRESH_AFTER_MS that were used recently, so
 *    values are rarely more than ~6 h old and a FatSecret outage of up to ~18 h
 *    goes unnoticed. If FatSecret fails, the current rows stay valid until they expire.
 *
 * One worker process is assumed; two would only duplicate FatSecret calls.
 */
export const MAINTENANCE_INTERVAL_MS = 15 * 60 * 1000;
export const REFRESH_AFTER_MS = 6 * 60 * 60 * 1000;
/** Foods nobody asked for in this long stop being refreshed, then expire. */
export const KEEP_REFRESHING_FOR_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PER_RUN = 500;
/** Stop the run after this many provider failures in a row: FatSecret is likely down. */
const MAX_CONSECUTIVE_FAILURES = 3;

export type FoodCacheMaintenanceResult = {
  purged: number;
  refreshed: number;
  failed: number;
  /** Foods FatSecret no longer knows (invalid id): removed from the cache. */
  removed: number;
  stopped: null | 'not_configured' | 'provider_down';
};

export async function maintainFoodCache(
  c: Pick<Container, 'db' | 'fatsecret'>,
  opts: { now?: Date; store?: FoodCacheStore } = {},
): Promise<FoodCacheMaintenanceResult> {
  const now = opts.now ?? new Date();
  const store = opts.store ?? createFoodCacheStore(c.db);
  const result: FoodCacheMaintenanceResult = { purged: await store.purgeExpired(now), refreshed: 0, failed: 0, removed: 0, stopped: null };

  const client = c.fatsecret;
  if (!client) return { ...result, stopped: 'not_configured' };

  const due = await store.listDue({
    region: client.region,
    language: client.language,
    fetchedBefore: new Date(now.getTime() - REFRESH_AFTER_MS),
    usedSince: new Date(now.getTime() - KEEP_REFRESHING_FOR_MS),
    limit: MAX_PER_RUN,
  });

  let consecutiveFailures = 0;
  for (const fatsecretFoodId of due) {
    try {
      await client.refreshFood(fatsecretFoodId);
      result.refreshed++;
      consecutiveFailures = 0;
    } catch (err) {
      if (err instanceof FatSecretError && err.reason === 'invalid_id') {
        await store.delete({ fatsecretFoodId, region: client.region, language: client.language });
        result.removed++;
        continue;
      }
      result.failed++;
      if (++consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) return { ...result, stopped: 'provider_down' };
    }
  }
  return result;
}
