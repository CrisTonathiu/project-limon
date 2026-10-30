/**
 * Patient profile (onboarding answers) through the HTTP layer (real DB, dev auth).
 * Requires: docker compose up -d && pnpm db:migrate && pnpm db:seed
 */
import { loadServerEnv } from '@limon/config';
import { withTenant } from '@limon/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createContainer } from '../../src/infrastructure/container.js';
import { createTestFoods } from './test-foods.js';

const env = loadServerEnv({ ...process.env, AUTH_PROVIDER: 'dev', DEV_AUTH_SECRET: 'test', PUBSUB_JOBS_TOPIC: '' });
const c = createContainer(env);
let app: Awaited<ReturnType<typeof buildApp>>;
let tenantId: string;
let headers: Record<string, string>;
let testFoods: Awaited<ReturnType<typeof createTestFoods>>;

const url = '/api/v1/patients/me/profile';
const answers = {
  sex: 'FEMALE',
  dateOfBirth: '1990-05-20',
  heightCm: 162,
  weightKg: 68.4,
  activityLevel: 'LIGHT',
  mealsPerDay: 4,
  allergies: ['milk'],
};
/** The PUT body: `answers` plus disliked foods picked from the catalog. */
let payload: typeof answers & { dislikedFoodIds: string[] };

/** Back to the seeded state: no profile, no birth date. */
async function resetProfile() {
  await withTenant(c.db, await c.registry.getPlacement(tenantId), async (tx) => {
    const patient = await tx.patient.findFirstOrThrow({ where: { tenantId, user: { authUserId: 'dev|patient|maria-nutrition' } } });
    await tx.patientProfile.deleteMany({ where: { tenantId, patientId: patient.id } });
    await tx.patient.update({ where: { id: patient.id }, data: { dateOfBirth: null } });
  });
}

beforeAll(async () => {
  app = await buildApp(c);
  headers = { authorization: `Bearer ${await c.devVerifier!.issue('dev|patient|maria-nutrition')}`, 'x-app-key': 'maria-nutrition-ios' };
  tenantId = (await app.inject({ url: '/api/v1/auth/me', headers })).json().tenant.id;
  await resetProfile();
  // Listed in the opposite order to how they sort by name.
  testFoods = await createTestFoods('test-profile', ['Hígado (prueba)', 'Brócoli (prueba)']);
  payload = { ...answers, dislikedFoodIds: testFoods.foods.map((f) => f.id) };
});
afterAll(async () => {
  await resetProfile();
  await testFoods.cleanup();
  await app.close();
  await c.db.disconnect();
});

describe('patient profile', () => {
  it('is null before onboarding', async () => {
    const res = await app.inject({ url, headers });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ profile: null });
  });

  it('saves the questionnaire and reads it back, birth date included', async () => {
    const [higado, brocoli] = testFoods.foods;
    const put = await app.inject({ method: 'PUT', url, headers, payload });
    expect(put.statusCode).toBe(200);
    // Disliked foods come back with their names, sorted by name.
    expect(put.json().profile).toMatchObject({ ...answers, pregnantOrBreastfeeding: false, dislikedFoods: [brocoli, higado] });

    const get = await app.inject({ url, headers });
    expect(get.json().profile).toMatchObject({ ...answers, dislikedFoods: [brocoli, higado] });
  });

  it('a second save replaces the whole profile, disliked foods included', async () => {
    const [higado] = testFoods.foods;
    const res = await app.inject({ method: 'PUT', url, headers, payload: { ...payload, weightKg: 66, allergies: [], dislikedFoodIds: [higado!.id] } });
    expect(res.json().profile).toMatchObject({ weightKg: 66, allergies: [], dislikedFoods: [higado] });

    const cleared = await app.inject({ method: 'PUT', url, headers, payload: { ...payload, dislikedFoodIds: [] } });
    expect(cleared.json().profile.dislikedFoods).toEqual([]);
  });

  it('saves meal times, and keeps them when a save sends none (an older app)', async () => {
    const mealTimes = ['07:30', '13:30', '17:00', '21:00'];
    const put = await app.inject({ method: 'PUT', url, headers, payload: { ...payload, mealTimes } });
    expect(put.json().profile.mealTimes).toEqual(mealTimes);

    const without = await app.inject({ method: 'PUT', url, headers, payload });
    expect(without.json().profile.mealTimes).toEqual(mealTimes);
  });

  it('uses the default meal times when the number of meals changes without new times', async () => {
    const res = await app.inject({ method: 'PUT', url, headers, payload: { ...payload, mealsPerDay: 3 } });
    expect(res.json().profile.mealTimes).toEqual(['08:00', '14:00', '20:00']);
    await app.inject({ method: 'PUT', url, headers, payload });
  });

  it('rejects meal times that do not match the meals or are out of order', async () => {
    for (const mealTimes of [['08:00', '14:00', '20:00'], ['08:00', '17:00', '14:00', '20:00']]) {
      const res = await app.inject({ method: 'PUT', url, headers, payload: { ...payload, mealTimes } });
      expect(res.statusCode).toBe(400);
    }
  });

  it('rejects a disliked food that is not in the catalog, keeping the saved profile', async () => {
    const before = (await app.inject({ url, headers })).json().profile;
    const unknown = '99999999-9999-4999-8999-999999999999';
    const res = await app.inject({ method: 'PUT', url, headers, payload: { ...payload, weightKg: 70, dislikedFoodIds: [testFoods.foods[0]!.id, unknown] } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect((await app.inject({ url, headers })).json().profile).toEqual(before);
  });

  it('includes the energy target: maintenance until the patient sets a goal', async () => {
    const { energyTarget } = (await app.inject({ url, headers })).json().profile;
    expect(energyTarget).toMatchObject({ status: 'READY' });
    expect(energyTarget.targetKcal).toBe(energyTarget.maintenanceKcal);
  });

  it('holds the target during pregnancy', async () => {
    const res = await app.inject({ method: 'PUT', url, headers, payload: { ...payload, pregnantOrBreastfeeding: true } });
    expect(res.json().profile.energyTarget).toEqual({ status: 'CONSULT_NUTRITIONIST', reason: 'PREGNANT_OR_BREASTFEEDING' });
  });

  it('rejects invalid answers and ids sent by the client', async () => {
    for (const invalid of [{ ...payload, mealsPerDay: 7 }, { ...payload, tenantId }, { ...answers, dislikedFoods: ['Hígado'] }]) {
      const res = await app.inject({ method: 'PUT', url, headers, payload: invalid });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('records the change in the audit log without health data', async () => {
    const entries = await withTenant(c.db, await c.registry.getPlacement(tenantId), (tx) =>
      tx.auditLog.findMany({ where: { tenantId, action: 'PatientProfileSaved' }, orderBy: { createdAt: 'desc' }, take: 1 }),
    );
    expect(entries[0]?.metadata).toEqual({});
  });

  it('nutritionists have no "me" profile to edit', async () => {
    const nutritionist = { authorization: `Bearer ${await c.devVerifier!.issue('dev|nutritionist|maria-nutrition')}` };
    const res = await app.inject({ method: 'PUT', url, headers: nutritionist, payload });
    expect(res.statusCode).toBe(403);
  });
});
