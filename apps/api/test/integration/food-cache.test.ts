/**
 * Shared FatSecret cache against the real local Postgres (fake FatSecret).
 * Requires: docker compose up -d && pnpm db:migrate
 * Each test uses its own `region` so rows from different tests never mix.
 */
import { randomUUID } from 'node:crypto';
import { createFoodCacheStore, DatabaseRouter } from '@limon/database';
import { afterAll, describe, expect, it } from 'vitest';
import { FatSecretClient } from '../../src/infrastructure/fatsecret.js';
import { maintainFoodCache } from '../../src/jobs/food-cache-maintenance.js';

const db = new DatabaseRouter({ url: process.env.DATABASE_URL });
const store = createFoodCacheStore(db);
const regions: string[] = [];
afterAll(async () => {
  await db.controlPlane().fatSecretFoodCache.deleteMany({ where: { region: { in: regions } } });
  await db.disconnect();
});

const HOUR = 3_600_000;
const T0 = new Date('2026-10-01T08:00:00Z');
const at = (hours: number) => new Date(T0.getTime() + hours * HOUR);
const region = () => {
  const r = `T${randomUUID().slice(0, 8)}`;
  regions.push(r);
  return r;
};

/** Fake FatSecret whose availability and answers the test controls. */
function fakeFatSecret() {
  const state = { up: true, calls: 0, calories: 218, invalid: new Set<string>() };
  const fetchImpl = (async (url: string) => {
    if (!state.up) throw new TypeError('fetch failed');
    if (url.startsWith('https://oauth.fatsecret.com/')) return Response.json({ access_token: 't', expires_in: 86400 });
    state.calls++;
    const id = new URL(url).searchParams.get('food_id')!;
    if (state.invalid.has(id)) return Response.json({ error: { code: 106, message: 'Invalid ID' } });
    return Response.json({
      food: { food_id: id, food_name: `Food ${id}`, food_type: 'Generic', servings: { serving: [{ serving_id: '1', serving_description: '100 g', calories: String(state.calories) }] } },
    });
  }) as typeof fetch;
  return { state, fetchImpl };
}

function client(r: string, fs: ReturnType<typeof fakeFatSecret>, clock: { now: Date }) {
  return new FatSecretClient({
    clientId: 'i', clientSecret: 's', scopes: 'basic', region: r, language: 'es', store, fetchImpl: fs.fetchImpl, now: () => clock.now.getTime(),
  });
}
const calories = (food: { servings: { nutrients: { calories: number | null } }[] }) => food.servings[0]!.nutrients.calories;

describe('shared FatSecret cache', () => {
  it('survives a restart while FatSecret is down (the reason it exists)', async () => {
    const r = region();
    const fs = fakeFatSecret();
    const clock = { now: at(0) };
    await client(r, fs, clock).getFood('3741');

    fs.state.up = false;
    clock.now = at(20); // new process, 20 h later, FatSecret unreachable
    expect(calories(await client(r, fs, clock).getFood('3741'))).toBe(218);
  });

  it('never serves data older than 24 h, and purge deletes it', async () => {
    const r = region();
    const fs = fakeFatSecret();
    const clock = { now: at(0) };
    await client(r, fs, clock).getFood('3741');

    expect(await store.get({ fatsecretFoodId: '3741', region: r, language: 'es' }, at(24))).toBeNull();
    await maintainFoodCache({ db, fatsecret: null }, { now: at(24), store });
    const left = await db.controlPlane().fatSecretFoodCache.count({ where: { region: r } });
    expect(left).toBe(0);
  });

  it('refreshes foods older than 6 h and leaves fresh ones alone', async () => {
    const r = region();
    const fs = fakeFatSecret();
    const clock = { now: at(0) };
    const c = client(r, fs, clock);
    await c.getFood('1');
    clock.now = at(5);
    await c.getFood('2');

    fs.state.calories = 230; // FatSecret updated its data
    const result = await maintainFoodCache({ db, fatsecret: c }, { now: at(7), store });
    expect(result).toMatchObject({ refreshed: 1, failed: 0, stopped: null });
    expect(calories((await store.get({ fatsecretFoodId: '1', region: r, language: 'es' }, at(7)))!)).toBe(230);
    expect(calories((await store.get({ fatsecretFoodId: '2', region: r, language: 'es' }, at(7)))!)).toBe(218);
  });

  it('keeps current rows when FatSecret is down, and stops after a few failures', async () => {
    const r = region();
    const fs = fakeFatSecret();
    const clock = { now: at(0) };
    const c = client(r, fs, clock);
    for (const id of ['1', '2', '3', '4', '5']) await c.getFood(id);

    fs.state.up = false;
    const result = await maintainFoodCache({ db, fatsecret: c }, { now: at(7), store });
    expect(result).toMatchObject({ refreshed: 0, failed: 3, stopped: 'provider_down' });
    expect(await store.get({ fatsecretFoodId: '5', region: r, language: 'es' }, at(7))).not.toBeNull();
  });

  it('removes foods FatSecret no longer knows', async () => {
    const r = region();
    const fs = fakeFatSecret();
    const clock = { now: at(0) };
    const c = client(r, fs, clock);
    await c.getFood('77');
    fs.state.invalid.add('77');
    const result = await maintainFoodCache({ db, fatsecret: c }, { now: at(7), store });
    expect(result.removed).toBe(1);
    expect(await store.get({ fatsecretFoodId: '77', region: r, language: 'es' }, at(7))).toBeNull();
  });

  it('stops refreshing foods nobody has used in a week', async () => {
    const r = region();
    const fs = fakeFatSecret();
    const clock = { now: at(0) };
    const c = client(r, fs, clock);
    await c.getFood('9');
    // Simulate a row last used 8 days ago (still unexpired for the purpose of this check).
    await db.controlPlane().fatSecretFoodCache.updateMany({ where: { region: r }, data: { lastUsedAt: at(-8 * 24) } });
    const result = await maintainFoodCache({ db, fatsecret: c }, { now: at(7), store });
    expect(result.refreshed).toBe(0);
  });
});
