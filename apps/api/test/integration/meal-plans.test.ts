/**
 * Meal plan generation (service level, until the routes exist): real DB and RLS, fake FatSecret.
 * Requires: docker compose up -d && pnpm db:migrate && pnpm db:seed
 */
import { loadServerEnv } from '@limon/config';
import { DatabaseRouter } from '@limon/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createContainer } from '../../src/infrastructure/container.js';
import { FatSecretClient } from '../../src/infrastructure/fatsecret.js';
import { createMealPlansService } from '../../src/modules/meal-plans/meal-plans.service.js';
import { createTestFoods } from './test-foods.js';

const env = loadServerEnv({ ...process.env, AUTH_PROVIDER: 'dev', DEV_AUTH_SECRET: 'test', SQS_JOBS_QUEUE_URL: '' });

/** Every food: 150 kcal and 10 g protein per 100 g, whatever its id. */
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
const service = createMealPlansService(c);
const log = { warn: () => {} };
let app: Awaited<ReturnType<typeof buildApp>>;
let testFoods: Awaited<ReturnType<typeof createTestFoods>>;

const tenantId = '11111111-1111-4111-8111-111111111111';
const tag = `test-meal-plans-${Date.now()}`;
const weekStart = '2026-10-19';
const recipeIds: string[] = [];
let patientId = '';
let milkRecipeId = '';

/** A recipe of 300 g of one test food: 450 kcal for 2 servings, so 225 kcal per serving. */
async function addRecipe(title: string, mealTypes: ('BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK')[], foodId: string) {
  const db = owner.controlPlane();
  const recipe = await db.recipe.create({ data: { tenantId, title, mealTypes, servings: 2, tags: [tag], steps: ['Servir.'] } });
  await db.recipeIngredient.create({ data: { tenantId, recipeId: recipe.id, foodId, position: 1, quantity: 300, unit: 'G', grams: 300 } });
  recipeIds.push(recipe.id);
  return recipe.id;
}

async function signUp(email: string, profile: boolean) {
  const headers = { authorization: `Bearer ${await c.devVerifier!.issue(`dev|patient|${email}`)}`, 'x-app-key': 'maria-nutrition-ios' };
  const signup = await app.inject({
    method: 'POST', url: '/api/v1/auth/register/patient', remoteAddress: `10.0.10.${recipeIds.length + (profile ? 1 : 2)}`, headers,
    payload: {
      email, firstName: 'Ana', lastName: 'Plan', privacyNoticeVersion: 'aviso-privacidad-2026-09', termsVersion: 'terminos-2026-09',
      acceptPrivacyNotice: true, acceptSensitiveDataProcessing: true, acceptTerms: true,
    },
  });
  expect(signup.statusCode).toBe(201);
  if (profile) {
    const res = await app.inject({
      method: 'PUT', url: '/api/v1/patients/me/profile', headers,
      payload: { sex: 'FEMALE', dateOfBirth: '1990-05-20', heightCm: 162, weightKg: 68.4, activityLevel: 'LIGHT', mealsPerDay: 4, allergies: ['milk'], dislikedFoodIds: [] },
    });
    expect(res.statusCode).toBe(200);
  }
  return signup.json().patientId as string;
}

const savedMeals = () =>
  owner.controlPlane().mealPlanMeal.findMany({ where: { mealPlan: { tenantId, patientId, weekStart: new Date(weekStart) } } });

beforeAll(async () => {
  app = await buildApp(c);
  testFoods = await createTestFoods('test-meal-plans', ['Avena (prueba)', 'Queso (prueba)']);
  const [plain, milk] = testFoods.foods;
  await owner.controlPlane().food.update({ where: { id: milk!.id }, data: { allergens: ['milk'] } });
  // Enough recipes for every slot whatever else the tenant has, so no slot is left empty.
  for (const type of ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] as const) {
    for (let i = 0; i < 4; i++) await addRecipe(`${type} ${i} (prueba)`, [type], plain!.id);
  }
  milkRecipeId = await addRecipe('Con leche (prueba)', ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'], milk!.id);
  patientId = await signUp(`${tag}@test.mx`, true);
});

afterAll(async () => {
  const db = owner.controlPlane();
  // Plans first: a recipe used in a plan can't be deleted.
  await db.mealPlan.deleteMany({ where: { tenantId, patient: { email: { startsWith: tag } } } });
  await db.recipe.deleteMany({ where: { id: { in: recipeIds } } });
  await testFoods.cleanup();
  await app.close();
  await Promise.all([c.db.disconnect(), owner.disconnect()]);
});

const generate = (id = patientId, week = weekStart) =>
  service.generateWeek({ tenantId, patientId: id, weekStart: week, actorUserId: null, requestId: tag }, log);

describe('generateWeek', () => {
  it('saves a 7-day plan with one row per meal, and recipe ids and servings only', async () => {
    const result = await generate();
    if (result.status !== 'CREATED') throw new Error(result.status);
    expect(result.days.map((d) => d.date)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);

    const meals = await savedMeals();
    expect(meals).toHaveLength(7 * 4);
    expect(meals.every((m) => m.recipeId && m.servings! >= 0.5 && m.servings! <= 2.5)).toBe(true);
    expect(Object.keys(meals[0]!).sort()).toEqual(['date', 'id', 'mealPlanId', 'mealType', 'recipeId', 'servings', 'slot', 'tenantId']);
  });

  it('never plans a recipe with a declared allergen', async () => {
    await generate();
    expect((await savedMeals()).map((m) => m.recipeId)).not.toContain(milkRecipeId);
  });

  it('replaces the week when generated again, keeping the same plan', async () => {
    const first = await generate();
    const second = await generate();
    if (first.status !== 'CREATED' || second.status !== 'CREATED') throw new Error();
    expect(second.mealPlanId).toBe(first.mealPlanId);
    expect(await savedMeals()).toHaveLength(7 * 4);
  });

  it('writes an audit entry without health data', async () => {
    const result = await generate();
    if (result.status !== 'CREATED') throw new Error();
    const audit = await owner.controlPlane().auditLog.findFirst({ where: { tenantId, action: 'MealPlanCreated', resourceId: result.mealPlanId }, orderBy: { createdAt: 'desc' } });
    expect(audit).toMatchObject({ userId: null, metadata: { weekStart, unfilledSlots: 0 } });
  });

  it('generates nothing for a patient who hasn’t finished onboarding', async () => {
    expect(await generate(await signUp(`${tag}-new@test.mx`, false))).toEqual({ status: 'NO_PROFILE' });
  });

  it('refuses a week that doesn’t start on Monday', async () => {
    await expect(generate(patientId, '2026-10-20')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
