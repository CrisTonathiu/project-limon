/**
 * A patient deletes their own account (DELETE /patients/me) through the HTTP layer (real DB, dev auth).
 * Requires: docker compose up -d && pnpm db:migrate && pnpm db:seed
 */
import { loadServerEnv } from '@limon/config';
import { withTenant } from '@limon/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createContainer } from '../../src/infrastructure/container.js';
import { createTestFoods } from './test-foods.js';

const env = loadServerEnv({ ...process.env, AUTH_PROVIDER: 'dev', DEV_AUTH_SECRET: 'test', SQS_JOBS_QUEUE_URL: '' });
const c = createContainer(env);
let app: Awaited<ReturnType<typeof buildApp>>;
let ip = 0;
let testFoods: Awaited<ReturnType<typeof createTestFoods>>;

const appKey = 'maria-nutrition-ios';
const tenantId = '11111111-1111-4111-8111-111111111111';
const consent = {
  privacyNoticeVersion: 'aviso-privacidad-2026-09',
  termsVersion: 'terminos-2026-09',
  acceptPrivacyNotice: true,
  acceptSensitiveDataProcessing: true,
  acceptTerms: true,
};
const answers = {
  sex: 'FEMALE', dateOfBirth: '1990-05-20', heightCm: 162, weightKg: 68.4,
  activityLevel: 'LIGHT', mealsPerDay: 4, allergies: ['milk'],
};

/** A fresh patient with a profile, so each test deletes its own account. */
async function signUpPatient(sub: string, email: string) {
  const headers = { authorization: `Bearer ${await c.devVerifier!.issue(sub)}`, 'x-app-key': appKey };
  const signup = await app.inject({
    method: 'POST', url: '/api/v1/auth/register/patient', remoteAddress: `10.0.8.${++ip}`, headers,
    payload: { email, firstName: 'Ana', lastName: 'Borrar', ...consent },
  });
  expect(signup.statusCode).toBe(201);
  expect((await app.inject({ method: 'PUT', url: '/api/v1/patients/me/profile', headers, payload: { ...answers, dislikedFoodIds: testFoods.foods.map((f) => f.id) } })).statusCode).toBe(200);
  return { headers, patientId: signup.json().patientId as string };
}

const scoped = async <T>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(c.db, await c.registry.getPlacement(tenantId), fn);

beforeAll(async () => {
  app = await buildApp(c);
  testFoods = await createTestFoods('test-deletion', ['Hígado (prueba)']);
});
afterAll(async () => {
  await testFoods.cleanup();
  await app.close();
  await c.db.disconnect();
});

describe('account deletion', () => {
  it('erases the health data, anonymizes the patient and keeps the consent records', async () => {
    const sub = `dev|patient|delete|${Date.now()}`;
    const { headers, patientId } = await signUpPatient(sub, `delete-${Date.now()}@test.mx`);
    // Until the meal plan endpoints exist, the plan and a favourite are written directly.
    const weekStart = new Date('2026-10-19');
    // Its own recipe: the seed only has recipes when the private default library was loaded.
    const recipe = await scoped(async (tx) => {
      const recipe = await tx.recipe.create({ data: { tenantId, title: 'deletion test', mealTypes: ['BREAKFAST'], servings: 1 } });
      await tx.mealPlan.create({
        data: { tenantId, patientId, weekStart, meals: { create: [{ date: weekStart, slot: 0, mealType: 'BREAKFAST', recipeId: recipe.id, servings: 1.25 }] } },
      });
      await tx.mealFeedback.create({ data: { tenantId, patientId, recipeId: recipe.id, rating: 1, weekStart } });
      await tx.shoppingListCheck.create({ data: { tenantId, patientId, weekStart, foodId: testFoods.foods[0]!.id, unit: 'G', amount: 100 } });
      return recipe;
    });

    const res = await app.inject({ method: 'DELETE', url: '/api/v1/patients/me', headers });
    expect(res.statusCode).toBe(204);

    const { patient, profile, dislikedFoods, mealPlans, mealFeedback, shoppingListChecks, consents, user, audit } = await scoped(async (tx) => {
      const patient = await tx.patient.findUniqueOrThrow({ where: { id: patientId } });
      return {
        patient,
        profile: await tx.patientProfile.findFirst({ where: { tenantId, patientId } }),
        dislikedFoods: await tx.patientDislikedFood.findMany({ where: { tenantId, patientId } }),
        mealPlans: await tx.mealPlan.findMany({ where: { tenantId, patientId } }),
        mealFeedback: await tx.mealFeedback.findMany({ where: { tenantId, patientId } }),
        shoppingListChecks: await tx.shoppingListCheck.findMany({ where: { tenantId, patientId } }),
        consents: await tx.patientConsent.findMany({ where: { tenantId, patientId } }),
        user: await tx.user.findUniqueOrThrow({ where: { id: patient.userId! } }),
        audit: await tx.auditLog.findFirst({ where: { tenantId, action: 'PatientDeleted', resourceId: patientId } }),
      };
    });
    expect(profile).toBeNull();
    expect(dislikedFoods).toEqual([]);
    expect(mealPlans).toEqual([]);
    expect(mealFeedback).toEqual([]);
    expect(shoppingListChecks).toEqual([]);
    expect(patient).toMatchObject({ firstName: '', lastName: '', email: null, dateOfBirth: null });
    expect(patient.deletedAt).not.toBeNull();
    expect(user).toMatchObject({ status: 'DISABLED', email: `deleted+${user.id}@deleted.invalid` });
    expect(user.cognitoUserId).not.toBe(sub);
    expect(consents).toHaveLength(3);
    expect(consents.every((consent) => consent.revokedAt !== null)).toBe(true);
    expect(audit?.metadata).toEqual({});
    // Deletable again now that no plan or favourite uses it.
    await scoped((tx) => tx.recipe.delete({ where: { id: recipe.id } }));
  });

  it('signs the old login out of everything', async () => {
    const { headers } = await signUpPatient(`dev|patient|delete-login|${Date.now()}`, `delete-login-${Date.now()}@test.mx`);
    await app.inject({ method: 'DELETE', url: '/api/v1/patients/me', headers });

    for (const url of ['/api/v1/auth/me', '/api/v1/patients/me/profile']) {
      expect((await app.inject({ url, headers })).statusCode).toBe(403);
    }
    expect((await app.inject({ method: 'DELETE', url: '/api/v1/patients/me', headers })).statusCode).toBe(403);
  });

  it('frees the email for a new sign-up', async () => {
    const email = `delete-again-${Date.now()}@test.mx`;
    const first = await signUpPatient(`dev|patient|delete-a|${Date.now()}`, email);
    await app.inject({ method: 'DELETE', url: '/api/v1/patients/me', headers: first.headers });

    const second = await signUpPatient(`dev|patient|delete-b|${Date.now()}`, email);
    expect(second.patientId).not.toBe(first.patientId);
  });

  it('nutritionists have no "me" patient to delete', async () => {
    const nutritionist = { authorization: `Bearer ${await c.devVerifier!.issue('dev|nutritionist|maria-nutrition')}` };
    expect((await app.inject({ method: 'DELETE', url: '/api/v1/patients/me', headers: nutritionist })).statusCode).toBe(403);
  });
});
