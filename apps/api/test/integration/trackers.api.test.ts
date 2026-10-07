/**
 * Weigh-ins, measurements and water through the HTTP layer (real DB and auth pipeline).
 * Requires: docker compose up -d && pnpm db:migrate && pnpm db:seed
 */
import { loadServerEnv } from '@limon/config';
import { DatabaseRouter } from '@limon/database';
import type { BodyLogListResponse, PatientProfileResponse, ProgressResponse, WaterResponse, WaterTodayDto } from '@limon/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createContainer } from '../../src/infrastructure/container.js';
import { localToday } from '../../src/modules/meal-plans/week.js';

const env = loadServerEnv({ ...process.env, AUTH_PROVIDER: 'dev', DEV_AUTH_SECRET: 'test', SQS_JOBS_QUEUE_URL: '' });
const c = createContainer(env);
const owner = new DatabaseRouter({ url: process.env.DATABASE_MIGRATION_URL });
let app: Awaited<ReturnType<typeof buildApp>>;

const tenantId = '11111111-1111-4111-8111-111111111111';
const tag = `test-trackers-api-${Date.now()}`;
const subscriptionIds: string[] = [];
let ip = 0;
const today = localToday(new Date());
const daysAgo = (n: number) => new Date(new Date(`${today}T00:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10);

async function signUp(name: string, opts: { subscribed: boolean }) {
  const headers = { authorization: `Bearer ${await c.devVerifier!.issue(`dev|patient|${tag}-${name}`)}`, 'x-app-key': 'maria-nutrition-ios' };
  const signup = await app.inject({
    method: 'POST', url: '/api/v1/auth/register/patient', remoteAddress: `10.0.16.${++ip}`, headers,
    payload: {
      email: `${tag}-${name}@test.mx`, firstName: 'Ana', lastName: 'Báscula', privacyNoticeVersion: 'aviso-privacidad-2026-09', termsVersion: 'terminos-2026-09',
      acceptPrivacyNotice: true, acceptSensitiveDataProcessing: true, acceptTerms: true,
    },
  });
  expect(signup.statusCode).toBe(201);
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

const profile = { sex: 'FEMALE', dateOfBirth: '1990-05-20', heightCm: 162, weightKg: 68.4, activityLevel: 'LIGHT', mealsPerDay: 4, allergies: [], dislikedFoodIds: [] };
const saveProfile = (headers: Record<string, string>, weightKg = profile.weightKg) =>
  app.inject({ method: 'PUT', url: '/api/v1/patients/me/profile', headers, payload: { ...profile, weightKg } });
const profileWeight = async (headers: Record<string, string>) =>
  ((await app.inject({ url: '/api/v1/patients/me/profile', headers })).json() as PatientProfileResponse).profile!.weightKg;
const logDay = (headers: Record<string, string>, date: string, payload: object) =>
  app.inject({ method: 'PUT', url: `/api/v1/patients/me/body-logs/${date}`, headers, payload });

beforeAll(async () => {
  app = await buildApp(c);
});

afterAll(async () => {
  const db = owner.controlPlane();
  const ours = { tenantId, patient: { email: { startsWith: tag } } };
  await db.bodyLog.deleteMany({ where: ours });
  await db.waterIntake.deleteMany({ where: ours });
  await db.waterSettings.deleteMany({ where: ours });
  await db.patientSubscription.deleteMany({ where: { id: { in: subscriptionIds } } });
  await app.close();
  await Promise.all([c.db.disconnect(), owner.disconnect()]);
});

describe('weigh-ins and measurements', () => {
  it('logs the onboarding weight as the first weigh-in', async () => {
    const headers = await signUp('onboarding', { subscribed: true });
    expect((await saveProfile(headers)).statusCode).toBe(200);
    const logs = (await app.inject({ url: '/api/v1/patients/me/body-logs', headers })).json() as BodyLogListResponse;
    expect(logs.items).toEqual([expect.objectContaining({ date: today, weightKg: 68.4, waistCm: null })]);
  });

  it('merges values into a day, and the latest weight becomes the profile weight', async () => {
    const headers = await signUp('merge', { subscribed: true });
    await saveProfile(headers);

    // An older weigh-in doesn't move the profile: today's onboarding weight is still the latest.
    expect((await logDay(headers, daysAgo(30), { weightKg: 71.2, waistCm: 86 })).statusCode).toBe(200);
    expect(await profileWeight(headers)).toBe(68.4);

    const res = await logDay(headers, today, { weightKg: 67.95, hipCm: 99 });
    expect(res.json().log).toMatchObject({ date: today, weightKg: 68, hipCm: 99 });
    expect(await profileWeight(headers)).toBe(68);

    await logDay(headers, today, { waistCm: 84.5 });
    const progress = (await app.inject({ url: '/api/v1/patients/me/progress?period=all', headers })).json() as ProgressResponse;
    expect(progress.currentWeightKg).toBe(68);
    expect(progress.weights).toEqual([{ date: daysAgo(30), weightKg: 71.2 }, { date: today, weightKg: 68 }]);
    expect(progress.measurements.waistCm).toEqual({ value: 84.5, date: today, change: -1.5 });
    expect(progress.measurements.hipCm).toEqual({ value: 99, date: today, change: null });

    // Deleting today falls back to the latest weight left.
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/patients/me/body-logs/${today}`, headers })).statusCode).toBe(204);
    expect(await profileWeight(headers)).toBe(71.2);
  });

  it('deletes a day once every value is cleared', async () => {
    const headers = await signUp('clear', { subscribed: true });
    await saveProfile(headers);
    await logDay(headers, daysAgo(3), { armCm: 30 });
    expect((await logDay(headers, daysAgo(3), { armCm: null })).json()).toEqual({ log: null });
    const logs = (await app.inject({ url: '/api/v1/patients/me/body-logs', headers })).json() as BodyLogListResponse;
    expect(logs.items.map((l) => l.date)).toEqual([today]);
  });

  it('refuses future days, empty bodies and values out of range', async () => {
    const headers = await signUp('invalid', { subscribed: true });
    await saveProfile(headers);
    const tomorrow = new Date(new Date(`${today}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
    for (const [date, payload] of [[tomorrow, { weightKg: 68 }], [today, {}], [today, { bodyFatPct: 90 }], ['2026-02-30', { weightKg: 68 }]] as const) {
      const res = await logDay(headers, date, payload);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('starts the goal from the current weight and shows its target', async () => {
    const headers = await signUp('goal', { subscribed: true });
    await saveProfile(headers);
    const goal = await app.inject({
      method: 'PUT', url: '/api/v1/patients/me/goal', headers,
      payload: { intention: 'LOSE_WEIGHT', pace: 'GENTLE', desiredChangeKg: 5, recentWeightChange: 'STABLE' },
    });
    expect(goal.statusCode).toBe(200);
    await logDay(headers, today, { weightKg: 67 });
    const progress = (await app.inject({ url: '/api/v1/patients/me/progress', headers })).json() as ProgressResponse;
    expect(progress.weightGoal).toEqual({ startWeightKg: 68.4, targetWeightKg: 63.4, startedOn: today });
  });

  it('needs a subscription', async () => {
    const headers = await signUp('unpaid', { subscribed: false });
    await saveProfile(headers);
    const res = await app.inject({ url: '/api/v1/patients/me/progress', headers });
    expect(res.statusCode).toBe(402);
  });
});

describe('water', () => {
  it('adds and removes glasses against the default target, and keeps a daily history', async () => {
    const headers = await signUp('water', { subscribed: true });
    await saveProfile(headers);

    const first = await app.inject({ method: 'POST', url: '/api/v1/water/intakes', headers, payload: { amountMl: 250 } });
    expect(first.statusCode).toBe(201);
    const second = (await app.inject({ method: 'POST', url: '/api/v1/water/intakes', headers, payload: { amountMl: 500 } })).json() as WaterTodayDto;
    expect(second).toMatchObject({ date: today, targetMl: 2400, defaultTargetMl: 2400, customTarget: false, totalMl: 750 });
    expect(second.intakes.map((i) => i.amountMl)).toEqual([500, 250]);

    const undone = (await app.inject({ method: 'DELETE', url: `/api/v1/water/intakes/${second.intakes[0]!.id}`, headers })).json() as WaterTodayDto;
    expect(undone.totalMl).toBe(250);

    const week = (await app.inject({ url: '/api/v1/water?days=7', headers })).json() as WaterResponse;
    expect(week.history).toHaveLength(7);
    expect(week.history.at(-1)).toEqual({ date: today, totalMl: 250 });
    expect(week.history[0]).toEqual({ date: daysAgo(6), totalMl: 0 });
  });

  it('uses the patient’s own target until they go back to the default', async () => {
    const headers = await signUp('target', { subscribed: true });
    await saveProfile(headers);
    const set = (await app.inject({ method: 'PUT', url: '/api/v1/water/target', headers, payload: { targetMl: 3000 } })).json() as WaterTodayDto;
    expect(set).toMatchObject({ targetMl: 3000, defaultTargetMl: 2400, customTarget: true });
    const reset = (await app.inject({ method: 'PUT', url: '/api/v1/water/target', headers, payload: { targetMl: null } })).json() as WaterTodayDto;
    expect(reset).toMatchObject({ targetMl: 2400, customTarget: false });
    const odd = await app.inject({ method: 'PUT', url: '/api/v1/water/target', headers, payload: { targetMl: 2420 } });
    expect(odd.statusCode).toBe(400);
  });

  it('can’t remove another patient’s glass', async () => {
    const ana = await signUp('water-ana', { subscribed: true });
    const bea = await signUp('water-bea', { subscribed: true });
    await saveProfile(ana);
    await saveProfile(bea);
    const glass = (await app.inject({ method: 'POST', url: '/api/v1/water/intakes', headers: ana, payload: { amountMl: 250 } })).json() as WaterTodayDto;
    const res = await app.inject({ method: 'DELETE', url: `/api/v1/water/intakes/${glass.intakes[0]!.id}`, headers: bea });
    expect(res.statusCode).toBe(404);
  });
});

describe('account deletion', () => {
  it('erases weigh-ins and water', async () => {
    const headers = await signUp('deleted', { subscribed: true });
    await saveProfile(headers);
    await app.inject({ method: 'POST', url: '/api/v1/water/intakes', headers, payload: { amountMl: 250 } });
    await app.inject({ method: 'PUT', url: '/api/v1/water/target', headers, payload: { targetMl: 2000 } });
    const patientId = (await app.inject({ url: '/api/v1/patients/me', headers })).json().id as string;

    expect((await app.inject({ method: 'DELETE', url: '/api/v1/patients/me', headers })).statusCode).toBe(204);
    const db = owner.controlPlane();
    expect(await db.bodyLog.count({ where: { tenantId, patientId } })).toBe(0);
    expect(await db.waterIntake.count({ where: { tenantId, patientId } })).toBe(0);
    expect(await db.waterSettings.count({ where: { tenantId, patientId } })).toBe(0);
  });
});
