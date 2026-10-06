/**
 * /meal-plans endpoints through the HTTP layer (real DB and auth pipeline, fake FatSecret).
 * Requires: docker compose up -d && pnpm db:migrate && pnpm db:seed
 */
import { loadServerEnv } from '@limon/config';
import { DatabaseRouter } from '@limon/database';
import type { FoodSwapOptionsResponse, MealPlanResponse, PlannedMealDetailDto } from '@limon/types';
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

async function signUp(name: string, opts: { profile: boolean; subscribed: boolean; allergies?: string[] }) {
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
      payload: { sex: 'FEMALE', dateOfBirth: '1990-05-20', heightCm: 162, weightKg: 68.4, activityLevel: 'LIGHT', mealsPerDay: 4, allergies: opts.allergies ?? [], dislikedFoodIds: [] },
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
  testFoods = await createTestFoods('test-meal-plans-api', [
    'Arroz (prueba)',
    // For swaps: a group no real catalog food uses, so the options are only these.
    { name: 'Pulque (prueba)', smaeGroup: 'ALCOHOLIC_BEVERAGES', gramsPerEquivalent: 30 },
    { name: 'Cerveza (prueba)', smaeGroup: 'ALCOHOLIC_BEVERAGES', gramsPerEquivalent: 20 },
    { name: 'Rompope (prueba)', smaeGroup: 'ALCOHOLIC_BEVERAGES', gramsPerEquivalent: 20, allergens: ['milk'] },
  ]);
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
  // Plans and favourites first: a recipe they use can't be deleted.
  await db.mealPlan.deleteMany({ where: { tenantId, patient: { email: { startsWith: tag } } } });
  await db.mealFeedback.deleteMany({ where: { tenantId, patient: { email: { startsWith: tag } } } });
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

describe('PUT and DELETE /meal-plans/favourites/:recipeId', () => {
  const favourite = (method: 'PUT' | 'DELETE', headers: Record<string, string>, recipeId: string) =>
    app.inject({ method, url: `/api/v1/meal-plans/favourites/${recipeId}`, headers });
  const read = async (headers: Record<string, string>) => {
    const body = (await app.inject({ url: '/api/v1/meal-plans/current', headers })).json() as MealPlanResponse;
    if (body.status !== 'READY') throw new Error(body.status);
    return body.plan.days.flatMap((d) => d.meals);
  };

  it('marks every meal with the recipe, records the week, and unmarks it again', async () => {
    const headers = await signUp('fav', { profile: true, subscribed: true });
    const meals = await read(headers);
    expect(meals.every((m) => !m.favourite)).toBe(true);
    const recipeId = meals[0]!.recipe!.id;

    expect((await favourite('PUT', headers, recipeId)).statusCode).toBe(204);
    // Again is a no-op, not a duplicate row.
    expect((await favourite('PUT', headers, recipeId)).statusCode).toBe(204);
    for (const m of await read(headers)) expect(m.favourite).toBe(m.recipe?.id === recipeId);
    const rows = await owner.controlPlane().mealFeedback.findMany({ where: { tenantId, recipeId, patient: { email: `${tag}-fav@test.mx` } } });
    expect(rows.map((r) => [r.rating, r.weekStart.toISOString().slice(0, 10)])).toEqual([[1, week[0]]]);

    expect((await favourite('DELETE', headers, recipeId)).statusCode).toBe(204);
    expect((await favourite('DELETE', headers, recipeId)).statusCode).toBe(204);
    expect((await read(headers)).every((m) => !m.favourite)).toBe(true);
  });

  it('refuses unknown recipes and bad ids, and is paywalled', async () => {
    const headers = await signUp('fav-bad', { profile: true, subscribed: true });
    expect((await favourite('PUT', headers, '00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
    expect((await favourite('PUT', headers, 'tacos')).statusCode).toBe(400);
    const unpaid = await signUp('fav-unpaid', { profile: true, subscribed: false });
    expect((await favourite('PUT', unpaid, recipeIds[0]!)).statusCode).toBe(402);
  });
});

describe('meal detail and SMAE swaps', () => {
  let swapRecipeId: string;
  const [, pulque, cerveza, rompope] = [0, 1, 2, 3].map((i) => () => testFoods.foods[i]!);
  const meal = (headers: Record<string, string>, mealId: string) => app.inject({ url: `/api/v1/meal-plans/current/meals/${mealId}`, headers });
  const options = (headers: Record<string, string>, mealId: string, ingredientId: string) =>
    app.inject({ url: `/api/v1/meal-plans/current/meals/${mealId}/ingredients/${ingredientId}/swaps`, headers });
  const swap = (headers: Record<string, string>, mealId: string, ingredientId: string, foodId: string) =>
    app.inject({ method: 'PUT', url: `/api/v1/meal-plans/current/meals/${mealId}/ingredients/${ingredientId}/swap`, headers, payload: { foodId } });

  /** The patient's plan, with the first meal of `date` set to the swap recipe at 1 serving (half the recipe). */
  async function planWithSwapMeal(headers: Record<string, string>, date: string) {
    const body = (await app.inject({ url: '/api/v1/meal-plans/current', headers })).json() as MealPlanResponse;
    if (body.status !== 'READY') throw new Error(body.status);
    const mealId = body.plan.days.find((d) => d.date === date)!.meals[0]!.id;
    await owner.controlPlane().mealPlanMeal.update({ where: { id: mealId }, data: { recipeId: swapRecipeId, servings: 1 } });
    return mealId;
  }

  beforeAll(async () => {
    // 300 g pulque (10 equivalents) and 10 g rice (no SMAE data) for 2 servings.
    const db = owner.controlPlane();
    const recipe = await db.recipe.create({ data: { tenantId, title: 'Pulque con arroz (prueba)', mealTypes: ['SNACK'], servings: 2, tags: [tag], steps: ['Servir.'] } });
    await db.recipeIngredient.create({ data: { tenantId, recipeId: recipe.id, foodId: pulque().id, position: 1, quantity: 1, unit: 'CUP', grams: 300, note: 'frío' } });
    await db.recipeIngredient.create({ data: { tenantId, recipeId: recipe.id, foodId: testFoods.foods[0]!.id, position: 2, quantity: 10, unit: 'G', grams: 10 } });
    recipeIds.push(recipe.id);
    swapRecipeId = recipe.id;
  });

  it('shows the meal for the patient’s portion, swaps an ingredient for its equivalent, and undoes it', async () => {
    const headers = await signUp('swap', { profile: true, subscribed: true, allergies: ['milk'] });
    const sunday = week[6]!;
    const mealId = await planWithSwapMeal(headers, sunday);

    const before = await meal(headers, mealId);
    expect(before.statusCode).toBe(200);
    const detail = before.json() as PlannedMealDetailDto;
    expect(detail).toMatchObject({ id: mealId, date: sunday, servings: 1, recipe: { id: swapRecipeId, steps: ['Servir.'] }, macros: { calories: 233 } });
    const [drink, rice] = detail.ingredients;
    expect(drink).toEqual({
      id: expect.any(String), foodId: pulque().id, name: 'Pulque (prueba)', grams: 150, quantity: 0.5, unit: 'CUP', note: 'frío', swappedFrom: null, swappable: true,
    });
    expect(rice).toMatchObject({ foodId: testFoods.foods[0]!.id, grams: 5, swappable: false });

    // Same equivalents in beer: 150 g / 30 × 20 = 100 g. Rompope has milk, which the patient is allergic to.
    const testFoodIds = new Set(testFoods.foods.map((f) => f.id));
    const offered = (await options(headers, mealId, drink!.id)).json() as FoodSwapOptionsResponse;
    expect(offered.items.filter((o) => testFoodIds.has(o.foodId))).toEqual([{ foodId: cerveza().id, name: 'Cerveza (prueba)', grams: 100, original: false }]);
    expect(((await options(headers, mealId, rice!.id)).json() as FoodSwapOptionsResponse).items).toEqual([]);

    const swapped = await swap(headers, mealId, drink!.id, cerveza().id);
    expect(swapped.statusCode).toBe(200);
    const after = swapped.json() as PlannedMealDetailDto;
    expect(after.ingredients[0]).toMatchObject({
      foodId: cerveza().id, grams: 100, quantity: null, unit: null, swappedFrom: { foodId: pulque().id, name: 'Pulque (prueba)' }, swappable: true,
    });
    // (200 g beer + 10 g rice) × 1.5 kcal/g / 2 servings.
    expect(after.macros?.calories).toBe(158);

    // The week view and its day total follow the swap.
    const plan = (await app.inject({ url: '/api/v1/meal-plans/current', headers })).json() as MealPlanResponse;
    if (plan.status !== 'READY') throw new Error(plan.status);
    const day = plan.plan.days.find((d) => d.date === sunday)!;
    expect(day.meals.find((m) => m.id === mealId)?.macros?.calories).toBe(158);
    expect(day.totals?.calories).toBe(day.meals.reduce((s, m) => s + m.macros!.calories, 0));

    // Once swapped, the recipe's own food is offered back.
    const back = (await options(headers, mealId, drink!.id)).json() as FoodSwapOptionsResponse;
    expect(back.items.filter((o) => testFoodIds.has(o.foodId))).toEqual([{ foodId: pulque().id, name: 'Pulque (prueba)', grams: 150, original: true }]);

    const undone = (await swap(headers, mealId, drink!.id, pulque().id)).json() as PlannedMealDetailDto;
    expect(undone.ingredients[0]).toEqual(drink);
    expect(undone.macros?.calories).toBe(233);
    expect(await owner.controlPlane().mealPlanMealSwap.count({ where: { mealPlanMealId: mealId } })).toBe(0);
    const audits = await owner.controlPlane().auditLog.findMany({ where: { tenantId, action: 'MealIngredientSwapped', resourceId: mealId } });
    expect(audits).toHaveLength(2);
  });

  it('refuses foods that aren’t equivalents or that the patient can’t eat, past meals and other patients’ meals', async () => {
    const headers = await signUp('swap-bad', { profile: true, subscribed: true, allergies: ['milk'] });
    const mealId = await planWithSwapMeal(headers, week[6]!);
    const [drink, rice] = ((await meal(headers, mealId)).json() as PlannedMealDetailDto).ingredients;

    expect((await swap(headers, mealId, drink!.id, rompope().id)).statusCode).toBe(400);
    expect((await swap(headers, mealId, drink!.id, testFoods.foods[0]!.id)).statusCode).toBe(400);
    expect((await swap(headers, mealId, rice!.id, cerveza().id)).statusCode).toBe(400);
    expect((await swap(headers, mealId, drink!.id, '00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
    expect((await swap(headers, mealId, '00000000-0000-4000-8000-000000000000', cerveza().id)).statusCode).toBe(404);

    const other = await signUp('swap-other', { profile: true, subscribed: true });
    expect((await meal(other, mealId)).statusCode).toBe(404);
    expect((await swap(other, mealId, drink!.id, cerveza().id)).statusCode).toBe(404);

    if (today !== week[0]) {
      const pastMealId = await planWithSwapMeal(headers, week[0]!);
      expect((await swap(headers, pastMealId, drink!.id, cerveza().id)).statusCode).toBe(400);
    }
  });

  it('removes the swaps of a regenerated day', async () => {
    const headers = await signUp('swap-regen', { profile: true, subscribed: true });
    const sunday = week[6]!;
    const mealId = await planWithSwapMeal(headers, sunday);
    const [drink] = ((await meal(headers, mealId)).json() as PlannedMealDetailDto).ingredients;
    expect((await swap(headers, mealId, drink!.id, cerveza().id)).statusCode).toBe(200);

    expect((await app.inject({ method: 'POST', url: `/api/v1/meal-plans/current/days/${sunday}/regenerate`, headers })).statusCode).toBe(200);
    expect((await meal(headers, mealId)).statusCode).toBe(404);
    expect(await owner.controlPlane().mealPlanMealSwap.count({ where: { mealPlanMealId: mealId } })).toBe(0);
  });
});
