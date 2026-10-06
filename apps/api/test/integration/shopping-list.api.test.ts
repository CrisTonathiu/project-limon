/**
 * /shopping-list endpoints through the HTTP layer (real DB and auth pipeline, fake FatSecret).
 * Requires: docker compose up -d && pnpm db:migrate && pnpm db:seed
 */
import { loadServerEnv } from '@limon/config';
import { DatabaseRouter } from '@limon/database';
import type { MealPlanResponse, PlannedMealDetailDto, ShoppingListResponse } from '@limon/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createContainer } from '../../src/infrastructure/container.js';
import { FatSecretClient } from '../../src/infrastructure/fatsecret.js';
import { weekDates, weekStartOf } from '../../src/modules/meal-plans/week.js';
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
const tag = `test-shopping-list-api-${Date.now()}`;
const recipeIds: string[] = [];
const subscriptionIds: string[] = [];
let ip = 0;
const sunday = weekDates(weekStartOf(new Date()))[6]!;

async function signUp(name: string, opts: { subscribed: boolean }) {
  const headers = { authorization: `Bearer ${await c.devVerifier!.issue(`dev|patient|${tag}-${name}`)}`, 'x-app-key': 'maria-nutrition-ios' };
  const signup = await app.inject({
    method: 'POST', url: '/api/v1/auth/register/patient', remoteAddress: `10.0.12.${++ip}`, headers,
    payload: {
      email: `${tag}-${name}@test.mx`, firstName: 'Ana', lastName: 'Lista', privacyNoticeVersion: 'aviso-privacidad-2026-09', termsVersion: 'terminos-2026-09',
      acceptPrivacyNotice: true, acceptSensitiveDataProcessing: true, acceptTerms: true,
    },
  });
  expect(signup.statusCode).toBe(201);
  const profile = await app.inject({
    method: 'PUT', url: '/api/v1/patients/me/profile', headers,
    payload: { sex: 'FEMALE', dateOfBirth: '1990-05-20', heightCm: 162, weightKg: 68.4, activityLevel: 'LIGHT', mealsPerDay: 4, allergies: [], dislikedFoodIds: [] },
  });
  expect(profile.statusCode).toBe(200);
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

const recipe = async (title: string, servings: number, ingredients: { foodId: string; quantity: number; unit: 'G' | 'PIECE' | 'CUP'; grams: number }[]) => {
  const db = owner.controlPlane();
  const r = await db.recipe.create({ data: { tenantId, title, mealTypes: ['SNACK'], servings, tags: [tag], steps: ['Servir.'] } });
  for (const [i, ing] of ingredients.entries()) await db.recipeIngredient.create({ data: { tenantId, recipeId: r.id, position: i + 1, ...ing } });
  recipeIds.push(r.id);
  return r.id;
};

/**
 * The patient's week with only two meals left on Sunday, so the list is known:
 * eggs (2 pieces per serving) × `eggServings`, and half of a 300 g pulque recipe.
 */
async function plannedWeek(headers: Record<string, string>, eggServings: number) {
  const plan = (await app.inject({ url: '/api/v1/meal-plans/current', headers })).json() as MealPlanResponse;
  if (plan.status !== 'READY') throw new Error(plan.status);
  const db = owner.controlPlane();
  await db.mealPlanMeal.updateMany({ where: { mealPlanId: plan.plan.id }, data: { recipeId: null, servings: null } });
  const [eggMeal, drinkMeal] = plan.plan.days.find((d) => d.date === sunday)!.meals;
  await db.mealPlanMeal.update({ where: { id: eggMeal!.id }, data: { recipeId: eggRecipeId, servings: eggServings } });
  await db.mealPlanMeal.update({ where: { id: drinkMeal!.id }, data: { recipeId: drinkRecipeId, servings: 1 } });
  return { eggMealId: eggMeal!.id, drinkMealId: drinkMeal!.id };
}

const list = async (headers: Record<string, string>) => {
  const res = await app.inject({ url: '/api/v1/shopping-list/current', headers });
  expect(res.statusCode).toBe(200);
  const body = res.json() as ShoppingListResponse;
  if (body.status !== 'READY') throw new Error(body.status);
  return body;
};
const setChecked = (headers: Record<string, string>, foodId: string, checked: unknown) =>
  app.inject({ method: 'PUT', url: `/api/v1/shopping-list/current/items/${foodId}`, headers, payload: { checked } });

let eggRecipeId: string;
let drinkRecipeId: string;

beforeAll(async () => {
  app = await buildApp(c);
  testFoods = await createTestFoods('test-shopping-list-api', [
    { name: 'Huevo (prueba)', shoppingCategory: 'DAIRY_EGGS' },
    { name: 'Pulque (prueba)', smaeGroup: 'ALCOHOLIC_BEVERAGES', gramsPerEquivalent: 30 },
    { name: 'Cerveza (prueba)', smaeGroup: 'ALCOHOLIC_BEVERAGES', gramsPerEquivalent: 20 },
  ]);
  const [egg, pulque] = testFoods.foods;
  // Enough recipes for the generator to fill every slot before the test replaces them.
  for (const type of ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] as const) {
    for (let i = 0; i < 6; i++) {
      const r = await owner.controlPlane().recipe.create({ data: { tenantId, title: `${type} ${i} (prueba)`, mealTypes: [type], servings: 2, tags: [tag], steps: ['Servir.'] } });
      await owner.controlPlane().recipeIngredient.create({ data: { tenantId, recipeId: r.id, foodId: egg!.id, position: 1, quantity: 6, unit: 'PIECE', grams: 300 } });
      recipeIds.push(r.id);
    }
  }
  eggRecipeId = await recipe('Huevos (prueba)', 1, [{ foodId: egg!.id, quantity: 2, unit: 'PIECE', grams: 100 }]);
  drinkRecipeId = await recipe('Pulque (prueba)', 2, [{ foodId: pulque!.id, quantity: 1, unit: 'CUP', grams: 300 }]);
});

afterAll(async () => {
  const db = owner.controlPlane();
  await db.mealPlan.deleteMany({ where: { tenantId, patient: { email: { startsWith: tag } } } });
  await db.shoppingListCheck.deleteMany({ where: { tenantId, patient: { email: { startsWith: tag } } } });
  await db.recipe.deleteMany({ where: { id: { in: recipeIds } } });
  await db.patientSubscription.deleteMany({ where: { id: { in: subscriptionIds } } });
  await testFoods.cleanup();
  await app.close();
  await Promise.all([c.db.disconnect(), owner.disconnect()]);
});

describe('GET /shopping-list/current', () => {
  it('adds up the week’s meals by food and store section, following swaps', async () => {
    const headers = await signUp('read', { subscribed: true });
    const { drinkMealId } = await plannedWeek(headers, 1.5);
    const [egg, pulque, beer] = testFoods.foods;

    const before = await list(headers);
    expect(before.weekStart).toBe(weekStartOf(new Date()));
    expect(before.sections).toEqual([
      { category: 'DAIRY_EGGS', items: [{ foodId: egg!.id, name: 'Huevo (prueba)', unit: 'PIECE', amount: 3, checked: false }] },
      // Half of the recipe's cup: counted in grams.
      { category: 'GROCERY', items: [{ foodId: pulque!.id, name: 'Pulque (prueba)', unit: 'G', amount: 150, checked: false }] },
    ]);

    const meal = (await app.inject({ url: `/api/v1/meal-plans/current/meals/${drinkMealId}`, headers })).json() as PlannedMealDetailDto;
    const swap = await app.inject({
      method: 'PUT', url: `/api/v1/meal-plans/current/meals/${drinkMealId}/ingredients/${meal.ingredients[0]!.id}/swap`, headers, payload: { foodId: beer!.id },
    });
    expect(swap.statusCode).toBe(200);
    expect((await list(headers)).sections[1]).toEqual({
      category: 'GROCERY', items: [{ foodId: beer!.id, name: 'Cerveza (prueba)', unit: 'G', amount: 100, checked: false }],
    });
  });

  it('is paywalled', async () => {
    const headers = await signUp('unpaid', { subscribed: false });
    expect((await app.inject({ url: '/api/v1/shopping-list/current', headers })).statusCode).toBe(402);
  });
});

describe('PUT /shopping-list/current/items/:foodId', () => {
  it('checks and unchecks an item, and unchecks it when the plan asks for more', async () => {
    const headers = await signUp('check', { subscribed: true });
    const { eggMealId } = await plannedWeek(headers, 1.5);
    const egg = testFoods.foods[0]!.id;
    const eggItem = async () => (await list(headers)).sections[0]!.items[0]!;

    expect((await setChecked(headers, egg, true)).statusCode).toBe(204);
    expect(await eggItem()).toMatchObject({ amount: 3, checked: true });

    // 2 servings now: 4 eggs, more than the 3 that were bought.
    await owner.controlPlane().mealPlanMeal.update({ where: { id: eggMealId }, data: { servings: 2 } });
    expect(await eggItem()).toMatchObject({ amount: 4, checked: false });

    expect((await setChecked(headers, egg, true)).statusCode).toBe(204);
    expect((await eggItem()).checked).toBe(true);
    expect((await setChecked(headers, egg, false)).statusCode).toBe(204);
    expect((await setChecked(headers, egg, false)).statusCode).toBe(204);
    expect((await eggItem()).checked).toBe(false);
  });

  it('refuses foods that aren’t on the list and bad input, but lets them be unchecked', async () => {
    const headers = await signUp('check-bad', { subscribed: true });
    await plannedWeek(headers, 1);
    const beer = testFoods.foods[2]!.id;
    expect((await setChecked(headers, beer, true)).statusCode).toBe(404);
    expect((await setChecked(headers, beer, false)).statusCode).toBe(204);
    expect((await setChecked(headers, testFoods.foods[0]!.id, 'sí')).statusCode).toBe(400);
    expect((await setChecked(headers, 'huevo', true)).statusCode).toBe(400);
  });
});
