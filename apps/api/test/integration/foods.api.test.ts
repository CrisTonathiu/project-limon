/**
 * /foods endpoints through the HTTP layer (real DB and auth pipeline, fake FatSecret).
 * Requires: docker compose up -d && pnpm db:migrate && pnpm db:seed
 */
import { loadServerEnv } from '@limon/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createContainer } from '../../src/infrastructure/container.js';
import { FatSecretClient } from '../../src/infrastructure/fatsecret.js';
import { createTestFoods } from './test-foods.js';

const env = loadServerEnv({ ...process.env, AUTH_PROVIDER: 'dev', DEV_AUTH_SECRET: 'test', SQS_JOBS_QUEUE_URL: '' });

const fakeFetch = (async (url: string) => {
  if (url.startsWith('https://oauth.fatsecret.com/')) return Response.json({ access_token: 't', expires_in: 86400 });
  const u = new URL(url);
  if (u.pathname === '/rest/foods/search/v1') {
    return Response.json({
      foods: { total_results: '1', food: { food_id: '4412', food_name: 'Corn Tortilla', food_type: 'Generic', food_description: 'Per 100g - Calories: 218kcal | Fat: 2.85g | Carbs: 44.64g | Protein: 5.70g' } },
    });
  }
  if (u.searchParams.get('food_id') === '4412') {
    return Response.json({ food: { food_id: '4412', food_name: 'Corn Tortilla', food_type: 'Generic', servings: { serving: [{ serving_id: '1', serving_description: '100 g', calories: '218' }] } } });
  }
  if (u.searchParams.get('food_id') === '21') return Response.json({ error: { code: 21, message: 'Invalid IP address detected: 1.2.3.4' } });
  return Response.json({ error: { code: 106, message: 'Invalid ID' } });
}) as typeof fetch;

const c = createContainer(env, { fatsecret: new FatSecretClient({ clientId: 'id', clientSecret: 's', scopes: 'basic', fetchImpl: fakeFetch }) });
const unconfigured = createContainer(env, { fatsecret: null });
let app: Awaited<ReturnType<typeof buildApp>>;
let appWithout: Awaited<ReturnType<typeof buildApp>>;
const token = (sub: string) => c.devVerifier!.issue(sub);
let testFoods: Awaited<ReturnType<typeof createTestFoods>>;

beforeAll(async () => {
  app = await buildApp(c);
  appWithout = await buildApp(unconfigured);
  testFoods = await createTestFoods('test-catalog', ['Ñame (prueba)', 'Nuez (prueba)', 'Limonada (prueba)', 'Limón (prueba)']);
});
afterAll(async () => {
  await app.close();
  await appWithout.close();
  await testFoods.cleanup();
  await c.db.disconnect();
  await unconfigured.db.disconnect();
});

const asNutritionist = async () => ({ authorization: `Bearer ${await token('dev|nutritionist|maria-nutrition')}` });

describe('GET /foods/catalog', () => {
  const asPatient = async () => ({
    authorization: `Bearer ${await token('dev|patient|maria-nutrition')}`, 'x-app-key': 'maria-nutrition-ios',
  });

  it('gives a patient without a subscription ids and names, in Spanish order', async () => {
    const res = await app.inject({ url: '/api/v1/foods/catalog', headers: await asPatient() });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=3600');
    // Only this file's foods: other test files add their own in parallel.
    const ids = new Set(testFoods.foods.map((f) => f.id));
    const ours = res.json().items.filter((f: { id: string }) => ids.has(f.id));
    // Accents only break ties (code-point order would put "Limonada" first), Ñ after N.
    expect(ours.map((f: { name: string }) => f.name)).toEqual(['Limón (prueba)', 'Limonada (prueba)', 'Nuez (prueba)', 'Ñame (prueba)']);
    expect(Object.keys(ours[0]).sort()).toEqual(['id', 'name']);
  });

  it('is available to nutritionists too', async () => {
    const res = await app.inject({ url: '/api/v1/foods/catalog', headers: await asNutritionist() });
    expect(res.statusCode).toBe(200);
  });

  it('needs a signed-in user', async () => {
    const res = await app.inject({ url: '/api/v1/foods/catalog', headers: { 'x-app-key': 'maria-nutrition-ios' } });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /foods/search', () => {
  it('returns normalized FatSecret results to a nutritionist, not cacheable', async () => {
    const res = await app.inject({ url: '/api/v1/foods/search?q=corn%20tortilla', headers: await asNutritionist() });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json()).toMatchObject({ total: 1, page: 0, pageSize: 20, items: [{ fatsecretFoodId: '4412', summary: { calories: 218 } }] });
  });

  it('is not available to patients', async () => {
    const res = await app.inject({
      url: '/api/v1/foods/search?q=tortilla',
      headers: { authorization: `Bearer ${await token('dev|patient|maria-nutrition')}`, 'x-app-key': 'maria-nutrition-ios' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('validates the query', async () => {
    const res = await app.inject({ url: '/api/v1/foods/search?q=a', headers: await asNutritionist() });
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('answers NUTRITION_PROVIDER_UNAVAILABLE when FatSecret is not configured', async () => {
    const res = await appWithout.inject({ url: '/api/v1/foods/search?q=tortilla', headers: await asNutritionist() });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('NUTRITION_PROVIDER_UNAVAILABLE');
  });
});

describe('GET /foods/fatsecret/:id', () => {
  it('returns the food with its servings', async () => {
    const res = await app.inject({ url: '/api/v1/foods/fatsecret/4412', headers: await asNutritionist() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ fatsecretFoodId: '4412', servings: [{ fatsecretServingId: '1', nutrients: { calories: 218 } }] });
  });

  it('maps an unknown FatSecret id to 404', async () => {
    const res = await app.inject({ url: '/api/v1/foods/fatsecret/999', headers: await asNutritionist() });
    expect(res.statusCode).toBe(404);
  });

  it('hides FatSecret details (e.g. our IP) behind a 503', async () => {
    const res = await app.inject({ url: '/api/v1/foods/fatsecret/21', headers: await asNutritionist() });
    expect(res.statusCode).toBe(503);
    expect(res.body).not.toContain('1.2.3.4');
  });

  it('rejects ids that are not FatSecret ids', async () => {
    const res = await app.inject({ url: '/api/v1/foods/fatsecret/abc', headers: await asNutritionist() });
    expect(res.statusCode).toBe(400);
  });
});
