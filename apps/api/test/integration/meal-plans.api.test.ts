/**
 * /meal-plans endpoints through the HTTP layer (real DB and auth pipeline, fake FatSecret).
 * Requires: docker compose up -d && pnpm db:migrate && pnpm db:seed
 */
import { loadServerEnv } from '@limon/config';
import { DatabaseRouter } from '@limon/database';
import type { MealPlanResponse } from '@limon/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createContainer } from '../../src/infrastructure/container.js';
import { FatSecretClient } from '../../src/infrastructure/fatsecret.js';
import { localToday, weekDates, weekStartOf } from '../../src/modules/meal-plans/week.js';
import { createTestFoods } from './test-foods.js';

const env = loadServerEnv({ ...process.env, AUTH_PROVIDER: 'dev', DEV_AUTH_SECRET: 'test', SQS_JOBS_QUEUE_URL: '' });

/** Every food: 150 kcal, 10 g protein, 20 g carbs and 5 g fat per 100 g. */
const fakeFetch = (async (url: string) => {
  if (url.startsWith('https://oauth.fatsecret.com/')) return Response.json({ access_token: 't', expires_in: 86400 });
  const id = new URL(url).searchParams.get('food_id')!;
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

const tenantId = '11111111-1111-4111-8111-111111111111';
const tag = `test-meal-plans-api-${Date.now()}`;
const recipeIds: string[] = [];
const subscriptionIds: string[] = [];
let ip = 0;

const week = weekDates(weekStartOf(new Date()));
const today = localToday(new Date());

async function signUp(name: string, opts: { profile: boolean; subscribed: boolean }) {
  const headers = { authorization: `Bearer ${await c.devVerifier!.issue(`dev|patient|${tag}-${name}`)}`, 'x-app-key': 'maria-nutrition-ios' };
  const signup = await app.inject({
    method: 'POST', url: '/api/v1/auth/register/patient', remoteAddress: `10.0.11.${++ip}`, headers,
    payload: {
      email: `${tag}-${name}@test.mx`, firstName: 'Ana', lastName: 'Plan', privacyNoticeVersion: 'aviso-privacidad-2026-09', termsVersion: 'terminos-2026-09',
      acceptPrivacyNotice: true, acceptSensitiveDataProcessing: true, acceptTerms: true,
    },
  });
  expect(signup.statusCode).toBe(201);
  if (opts.profile) {
    const res = await app.inject({
      method: 'PUT', url: '/api/v1/patients/me/profile', headers,
      payload: { sex: 'FEMALE', dateOfBirth: '1990-05-20', heightCm: 162, weightKg: 68.4, activityLevel: 'LIGHT', mealsPerDay: 4, allergies: [], dislikedFoodIds: [] },
    });
    expect(res.statusCode).toBe(200);
  }
  if (opts.subscribed) {
    subscriptionIds.push((await owner.controlPlane().patientSubscription.create({
      data: {
        tenantId, patientId: signup.json().patientId, provider: 'STRIPE', providerSubscriptionId: `${tag}-${name}`, productId: 'test',
        status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 86_400_000),
      },
    })).id);
  }
  return headers;
}

beforeAll(async () => {
  app = await buildApp(c);
  testFoods = await createTestFoods('test-meal-plans-api', ['Arroz (prueba)']);
  // Enough recipes for every slot whatever else the tenant has: 300 g = 450 kcal for 2 servings.
  const db = owner.controlPlane();
  for (const type of ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] as const) {
    for (let i = 0; i < 6; i++) {
      const recipe = await db.recipe.create({ data: { tenantId, title: `${type} ${i} (prueba)`, mealTypes: [type], servings: 2, totalMinutes: 10, tags: [tag], steps: ['Servir.'] } });
      await db.recipeIngredient.create({ data: { tenantId, recipeId: recipe.id, foodId: testFoods.foods[0]!.id, position: 1, quantity: 300, unit: 'G', grams: 300 } });
      recipeIds.push(recipe.id);
    }
  }
});

afterAll(async () => {
  const db = owner.controlPlane();
  // Plans first: a recipe used in a plan can't be deleted.
  await db.mealPlan.deleteMany({ where: { tenantId, patient: { email: { startsWith: tag } } } });
  await db.recipe.deleteMany({ where: { id: { in: recipeIds } } });
  await db.patientSubscription.deleteMany({ where: { id: { in: subscriptionIds } } });
  await testFoods.cleanup();
  await app.close();
  await Promise.all([c.db.disconnect(), owner.disconnect()]);
});

describe('GET /meal-plans/current', () => {
  it('generates the current week on first read, with macros per meal and per day', async () => {
    const headers = await signUp('read', { profile: true, subscribed: true });
    const res = await app.inject({ url: '/api/v1/meal-plans/current', headers });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');

    const body = res.json() as MealPlanResponse;
    if (body.status !== 'READY') throw new Error(body.status);
    expect(body.plan.weekStart).toBe(week[0]);
    expect(body.plan.days.map((d) => d.date)).toEqual(week);
    expect(body.target.kcal).toBeGreaterThan(0);

    // The plan may use any recipe of the tenant, not only this file's: the expected kcal per
    // serving comes from each recipe's own grams (every food is 150 kcal per 100 g here).
    const planned = await owner.controlPlane().recipe.findMany({
      where: { id: { in: body.plan.days.flatMap((d) => d.meals.map((m) => m.recipe!.id)) } },
      select: { id: true, servings: true, ingredients: { select: { grams: true } } },
    });
    const kcalPerServing = new Map(planned.map((r) => [r.id, Math.round((r.ingredients.reduce((s, i) => s + i.grams, 0) * 1.5) / r.servings)]));

    for (const day of body.plan.days) {
      expect(day.meals.map((m) => m.mealType)).toEqual(['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER']);
      for (const meal of day.meals) {
        expect(meal.macros?.calories).toBe(Math.round(kcalPerServing.get(meal.recipe!.id)! * meal.servings!));
      }
      expect(day.totals?.calories).toBe(day.meals.reduce((s, m) => s + m.macros!.calories, 0));
      expect(Math.abs(day.totals!.calories - body.target.kcal) / body.target.kcal).toBeLessThanOrEqual(0.1);
    }

    // The second read returns the saved plan instead of a new one.
    const again = (await app.inject({ url: '/api/v1/meal-plans/current', headers })).json() as MealPlanResponse;
    expect(again).toEqual(body);
  });

  it('is paywalled', async () => {
    const headers = await signUp('unpaid', { profile: true, subscribed: false });
    expect((await app.inject({ url: '/api/v1/meal-plans/current', headers })).statusCode).toBe(402);
  });

  it('asks for the questionnaire first', async () => {
    const headers = await signUp('no-profile', { profile: false, subscribed: true });
    const res = await app.inject({ url: '/api/v1/meal-plans/current', headers });
    expect(res.statusCode).toBe(409);
  });
});

describe('POST /meal-plans/current/days/:date/regenerate', () => {
  const regenerate = (headers: Record<string, string>, date: string) =>
    app.inject({ method: 'POST', url: `/api/v1/meal-plans/current/days/${date}/regenerate`, headers });

  it('replaces only that day', async () => {
    const headers = await signUp('regen', { profile: true, subscribed: true });
    const before = (await app.inject({ url: '/api/v1/meal-plans/current', headers })).json() as MealPlanResponse;
    if (before.status !== 'READY') throw new Error(before.status);
    const day = week.indexOf(today);

    const res = await regenerate(headers, today);
    expect(res.statusCode).toBe(200);
    const after = res.json() as MealPlanResponse;
    if (after.status !== 'READY') throw new Error(after.status);

    const recipesOf = (r: typeof before, i: number) => r.plan.days[i]!.meals.map((m) => m.recipe?.id);
    expect(recipesOf(after, day)).not.toEqual(recipesOf(before, day));
    week.forEach((_, i) => {
      if (i !== day) expect(after.plan.days[i]).toEqual(before.plan.days[i]);
    });
    const audit = await owner.controlPlane().auditLog.findFirst({ where: { tenantId, action: 'MealPlanDayRegenerated', resourceId: after.plan.id } });
    expect(audit?.metadata).toEqual({ date: today });
  });

  it('refuses dates outside the current week, past days and bad dates', async () => {
    const headers = await signUp('regen-bad', { profile: true, subscribed: true });
    expect((await regenerate(headers, '2020-01-06')).statusCode).toBe(400);
    expect((await regenerate(headers, 'mañana')).statusCode).toBe(400);
    if (today !== week[0]) expect((await regenerate(headers, week[0]!)).statusCode).toBe(400);
  });
});
