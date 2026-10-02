/**
 * /recipes endpoints through the HTTP layer (real DB and auth pipeline, fake FatSecret).
 * Requires: docker compose up -d && pnpm db:migrate && pnpm db:seed
 */
import { loadServerEnv } from '@limon/config';
import { DatabaseRouter } from '@limon/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createContainer } from '../../src/infrastructure/container.js';
import { FatSecretClient } from '../../src/infrastructure/fatsecret.js';
import { createTestFoods } from './test-foods.js';

const env = loadServerEnv({ ...process.env, AUTH_PROVIDER: 'dev', DEV_AUTH_SECRET: 'test', SQS_JOBS_QUEUE_URL: '' });

/** Every test food: a 100 g serving "1" with these macros, except `failing`, to test an outage. */
let failing = '';
const fakeFetch = (async (url: string) => {
  if (url.startsWith('https://oauth.fatsecret.com/')) return Response.json({ access_token: 't', expires_in: 86400 });
  const id = new URL(url).searchParams.get('food_id')!;
  if (id === failing) return Response.json({ error: { code: 12, message: 'Temporarily unavailable' } });
  return Response.json({
    food: {
      food_id: id, food_name: id, food_type: 'Generic',
      servings: { serving: { serving_id: '1', serving_description: '100 g', metric_serving_amount: '100.000', metric_serving_unit: 'g', calories: '150', protein: '10', carbohydrate: '20', fat: '5' } },
    },
  });
}) as typeof fetch;

const c = createContainer(env, { fatsecret: new FatSecretClient({ clientId: 'id', clientSecret: 's', scopes: 'basic', fetchImpl: fakeFetch }) });
const owner = new DatabaseRouter({ url: process.env.DATABASE_MIGRATION_URL });
let app: Awaited<ReturnType<typeof buildApp>>;
let testFoods: Awaited<ReturnType<typeof createTestFoods>>;

const MARIA = '11111111-1111-4111-8111-111111111111';
const CARLOS = '22222222-2222-4222-8222-222222222222';
const tag = `test-recipes-${Date.now()}`;
const recipeIds: string[] = [];
let subscriptionId = '';
let subscribed: Record<string, string>;
const unsubscribed = async () => ({ authorization: `Bearer ${await c.devVerifier!.issue('dev|patient|maria-nutrition')}`, 'x-app-key': 'maria-nutrition-ios' });

async function addRecipe(tenantId: string, title: string, mealTypes: ('BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK')[], foods = testFoods.foods) {
  const db = owner.controlPlane();
  const recipe = await db.recipe.create({ data: { tenantId, title, mealTypes, servings: 2, totalMinutes: 15, tags: [tag], steps: ['Mezclar.', 'Servir.'] } });
  recipeIds.push(recipe.id);
  await db.recipeIngredient.createMany({
    data: foods.map((f, i) => ({ tenantId, recipeId: recipe.id, foodId: f.id, position: i + 1, quantity: i + 1, unit: 'PIECE' as const, grams: 100, note: i ? null : 'picado' })),
  });
  return recipe;
}

beforeAll(async () => {
  app = await buildApp(c);
  testFoods = await createTestFoods('test-recipes', ['Huevo (prueba)', 'Tortilla (prueba)']);

  // A patient with an active subscription: recipes are paywalled.
  const sub = `dev|patient|recipes|${Date.now()}`;
  subscribed = { authorization: `Bearer ${await c.devVerifier!.issue(sub)}`, 'x-app-key': 'maria-nutrition-ios' };
  const signup = await app.inject({
    method: 'POST', url: '/api/v1/auth/register/patient', remoteAddress: '10.0.9.1', headers: subscribed,
    payload: {
      email: `${tag}@test.mx`, firstName: 'Ana', lastName: 'Recetas', privacyNoticeVersion: 'aviso-privacidad-2026-09', termsVersion: 'terminos-2026-09',
      acceptPrivacyNotice: true, acceptSensitiveDataProcessing: true, acceptTerms: true,
    },
  });
  expect(signup.statusCode).toBe(201);
  subscriptionId = (await owner.controlPlane().patientSubscription.create({
    data: {
      tenantId: MARIA, patientId: signup.json().patientId, provider: 'STRIPE', providerSubscriptionId: tag, productId: 'test',
      status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 86_400_000),
    },
  })).id;
});

afterAll(async () => {
  await owner.controlPlane().recipe.deleteMany({ where: { id: { in: recipeIds } } });
  await owner.controlPlane().patientSubscription.deleteMany({ where: { id: subscriptionId } });
  await testFoods.cleanup();
  await app.close();
  await Promise.all([c.db.disconnect(), owner.disconnect()]);
});

const ours = (items: { id: string }[]) => items.filter((r) => recipeIds.includes(r.id));

describe('GET /recipes', () => {
  it('lists the tenant’s recipes by title, in Spanish order', async () => {
    const noquis = await addRecipe(MARIA, `Ñoquis ${tag}`, ['LUNCH', 'DINNER']);
    const huevos = await addRecipe(MARIA, `Huevos ${tag}`, ['BREAKFAST']);
    await addRecipe(CARLOS, `Huevos de Carlos ${tag}`, ['BREAKFAST']);

    const res = await app.inject({ url: '/api/v1/recipes', headers: subscribed });
    expect(res.statusCode).toBe(200);
    expect(ours(res.json().items)).toEqual([
      { id: huevos.id, title: huevos.title, mealTypes: ['BREAKFAST'], servings: 2, totalMinutes: 15 },
      { id: noquis.id, title: noquis.title, mealTypes: ['LUNCH', 'DINNER'], servings: 2, totalMinutes: 15 },
    ]);
  });

  it('filters by meal type', async () => {
    const res = await app.inject({ url: '/api/v1/recipes?mealType=DINNER', headers: subscribed });
    expect(ours(res.json().items).map((r: { title: string }) => r.title)).toEqual([`Ñoquis ${tag}`]);
  });

  it('rejects an unknown meal type', async () => {
    const res = await app.inject({ url: '/api/v1/recipes?mealType=BRUNCH', headers: subscribed });
    expect(res.statusCode).toBe(400);
  });

  it('needs a subscription', async () => {
    const res = await app.inject({ url: '/api/v1/recipes', headers: await unsubscribed() });
    expect(res.statusCode).toBe(402);
  });
});

describe('GET /recipes/:id', () => {
  it('returns the ingredients in order, the steps and the macros per serving, not cacheable', async () => {
    const recipe = await addRecipe(MARIA, `Detalle ${tag}`, ['BREAKFAST']);
    const res = await app.inject({ url: `/api/v1/recipes/${recipe.id}`, headers: subscribed });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const [huevo, tortilla] = testFoods.foods;
    expect(res.json()).toEqual({
      id: recipe.id, title: recipe.title, description: null, mealTypes: ['BREAKFAST'], servings: 2, totalMinutes: 15,
      tags: [tag], steps: ['Mezclar.', 'Servir.'],
      ingredients: [
        { foodId: huevo!.id, name: huevo!.name, quantity: 1, unit: 'PIECE', grams: 100, note: 'picado' },
        { foodId: tortilla!.id, name: tortilla!.name, quantity: 2, unit: 'PIECE', grams: 100, note: null },
      ],
      // 2 × 100 g of 150 kcal / 10 P / 20 C / 5 F per 100 g, over 2 servings.
      macrosPerServing: { calories: 150, protein: 10, carbohydrate: 20, fat: 5 },
    });
  });

  it('still returns the recipe, without macros, when FatSecret fails for an ingredient', async () => {
    const recipe = await addRecipe(MARIA, `Sin FatSecret ${tag}`, ['SNACK'], [{ id: testFoods.foods[0]!.id, name: '' }]);
    // A food no other test fetched, so it isn't in the cache yet.
    const prefix = `test-recipes-outage-${Date.now()}`;
    const outage = await createTestFoods(prefix, ['Sin datos (prueba)']);
    failing = `test-${prefix}-0`; // createTestFoods' FatSecret id for the first food
    try {
      await owner.controlPlane().recipeIngredient.create({
        data: { tenantId: MARIA, recipeId: recipe.id, foodId: outage.foods[0]!.id, position: 2, quantity: 1, unit: 'G', grams: 10 },
      });
      const res = await app.inject({ url: `/api/v1/recipes/${recipe.id}`, headers: subscribed });
      expect(res.statusCode).toBe(200);
      expect(res.json().ingredients).toHaveLength(2);
      expect(res.json().macrosPerServing).toBeNull();
    } finally {
      await owner.controlPlane().recipeIngredient.deleteMany({ where: { recipeId: recipe.id } });
      await outage.cleanup();
    }
  });

  it('answers 404 for another tenant’s recipe and for an unknown id', async () => {
    const carlos = await addRecipe(CARLOS, `Privada ${tag}`, ['LUNCH']);
    expect((await app.inject({ url: `/api/v1/recipes/${carlos.id}`, headers: subscribed })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/v1/recipes/00000000-0000-4000-8000-000000000000', headers: subscribed })).statusCode).toBe(404);
  });

  it('rejects an id that isn’t a uuid', async () => {
    expect((await app.inject({ url: '/api/v1/recipes/huevos', headers: subscribed })).statusCode).toBe(400);
  });
});
