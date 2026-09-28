/**
 * End-to-end tenant isolation through the HTTP layer (real DB, dev auth).
 * Requires: docker compose up -d && pnpm db:migrate && pnpm db:seed
 */
import { loadServerEnv } from '@limon/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createContainer } from '../../src/infrastructure/container.js';

const env = loadServerEnv({ ...process.env, AUTH_PROVIDER: 'dev', DEV_AUTH_SECRET: 'test', SQS_JOBS_QUEUE_URL: '' });
const c = createContainer(env);
let app: Awaited<ReturnType<typeof buildApp>>;
const token = (sub: string) => c.devVerifier!.issue(sub);

beforeAll(async () => {
  app = await buildApp(c);
});
afterAll(async () => {
  await app.close();
  await c.db.disconnect();
});

describe('API tenant isolation', () => {
  it('Tenant A nutritionist cannot read Tenant B patient', async () => {
    const carlos = await token('dev|nutritionist|carlos-nutrition');
    const bList = await app.inject({ url: '/api/v1/patients', headers: { authorization: `Bearer ${carlos}` } });
    const bPatientId = bList.json().items[0].id as string;

    const maria = await token('dev|nutritionist|maria-nutrition');
    const res = await app.inject({ url: `/api/v1/patients/${bPatientId}`, headers: { authorization: `Bearer ${maria}` } });
    expect(res.statusCode).toBe(404);

    const list = await app.inject({ url: '/api/v1/patients', headers: { authorization: `Bearer ${maria}` } });
    expect(list.json().items.map((p: { id: string }) => p.id)).not.toContain(bPatientId);
  });

  it('Maria patient cannot sign in through Carlos app', async () => {
    const patient = await token('dev|patient|maria-nutrition');
    const res = await app.inject({
      url: '/api/v1/patients/me',
      headers: { authorization: `Bearer ${patient}`, 'x-app-key': 'carlos-nutrition-ios' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('TENANT_MISMATCH');
  });

  it('Maria patient can use Maria app', async () => {
    const patient = await token('dev|patient|maria-nutrition');
    const res = await app.inject({
      url: '/api/v1/patients/me',
      headers: { authorization: `Bearer ${patient}`, 'x-app-key': 'maria-nutrition-ios' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('client-supplied tenantId in body is rejected', async () => {
    const maria = await token('dev|nutritionist|maria-nutrition');
    const res = await app.inject({
      method: 'POST', url: '/api/v1/patients',
      headers: { authorization: `Bearer ${maria}` },
      payload: { firstName: 'X', lastName: 'Y', tenantId: '22222222-2222-4222-8222-222222222222' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('patient self-signup', () => {
  const consent = {
    privacyNoticeVersion: 'aviso-privacidad-2026-09',
    termsVersion: 'terminos-2026-09',
    acceptPrivacyNotice: true,
    acceptSensitiveDataProcessing: true,
    acceptTerms: true,
  };
  const signup = async (sub: string, appKey: string | undefined, body: Record<string, unknown> = {}) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/auth/register/patient',
      headers: { authorization: `Bearer ${await token(sub)}`, ...(appKey ? { 'x-app-key': appKey } : {}) },
      payload: { email: `${sub.replace(/[|]/g, '-')}@test.mx`, firstName: 'Nueva', lastName: 'Paciente', ...consent, ...body },
    });

  it('creates the patient in the tenant of the app they downloaded', async () => {
    const sub = `dev|patient|self|${Date.now()}`;
    const res = await signup(sub, 'carlos-nutrition-ios');
    expect(res.statusCode).toBe(201);
    expect(res.json().tenantId).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('refuses signup without a recognized app key', async () => {
    const res = await signup(`dev|patient|noapp|${Date.now()}`, undefined);
    expect(res.json().error.code).toBe('APP_NOT_RECOGNIZED');
  });

  it('requires express consent for sensitive health data', async () => {
    const res = await signup(`dev|patient|noconsent|${Date.now()}`, 'carlos-nutrition-ios', {
      acceptSensitiveDataProcessing: false,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('new patients have no access to content until they pay', async () => {
    const sub = `dev|patient|unpaid|${Date.now()}`;
    await signup(sub, 'carlos-nutrition-ios');
    const headers = { authorization: `Bearer ${await token(sub)}`, 'x-app-key': 'carlos-nutrition-ios' };

    const profile = await app.inject({ url: '/api/v1/patients/me', headers });
    expect(profile.statusCode).toBe(200); // can sign in and see their profile

    const paywall = await app.inject({ url: '/api/v1/subscriptions/me', headers });
    expect(paywall.statusCode).toBe(200);
    expect(paywall.json().active).toBe(false); // …and reach the paywall
  });
});

describe('shared platform app', () => {
  const MARIA = '11111111-1111-4111-8111-111111111111';
  const CARLOS = '22222222-2222-4222-8222-222222222222';
  const consent = {
    privacyNoticeVersion: 'aviso-privacidad-2026-09',
    termsVersion: 'terminos-2026-09',
    acceptPrivacyNotice: true,
    acceptSensitiveDataProcessing: true,
    acceptTerms: true,
  };
  // Signup is rate-limited per client IP (5/min); give each call its own address.
  let ip = 0;
  const signup = async (sub: string, appKey: string, body: Record<string, unknown> = {}) =>
    app.inject({
      method: 'POST',
      remoteAddress: `10.0.5.${++ip}`,
      url: '/api/v1/auth/register/patient',
      headers: { authorization: `Bearer ${await token(sub)}`, 'x-app-key': appKey },
      payload: { email: `${sub.replace(/[|]/g, '-')}@test.mx`, firstName: 'Nueva', lastName: 'Paciente', ...consent, ...body },
    });

  it('bootstraps with platform branding and asks for an invite code', async () => {
    const res = await app.inject({ url: '/api/v1/apps/bootstrap', headers: { 'x-app-key': 'limon-ios' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ tenantId: null, requiresInviteCode: true, appName: 'Limon' });
  });

  it('resolves an invite code to its tenant branding, ignoring case', async () => {
    const res = await app.inject({ url: '/api/v1/invites/%20maria-dev1%20' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ tenantId: MARIA, requiresInviteCode: false, appName: 'Maria Nutrition' });
  });

  it('rejects unknown and malformed invite codes the same way', async () => {
    for (const code of ['NOPE-NOPE', 'x', "'; DROP TABLE x"]) {
      const res = await app.inject({ url: `/api/v1/invites/${encodeURIComponent(code)}` });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('INVITE_CODE_INVALID');
    }
  });

  it('creates the patient in the invite code’s tenant', async () => {
    const res = await signup(`dev|patient|shared|${Date.now()}`, 'limon-ios', { inviteCode: 'carlos-dev1' });
    expect(res.statusCode).toBe(201);
    expect(res.json().tenantId).toBe(CARLOS);
  });

  it('refuses signup through the shared app without a valid invite code', async () => {
    const missing = await signup(`dev|patient|nocode|${Date.now()}`, 'limon-ios');
    expect(missing.json().error.code).toBe('INVITE_CODE_INVALID');
    const wrong = await signup(`dev|patient|badcode|${Date.now()}`, 'limon-ios', { inviteCode: 'NOPE-NOPE' });
    expect(wrong.json().error.code).toBe('INVITE_CODE_INVALID');
  });

  it('refuses another tenant’s invite code in a tenant’s own app', async () => {
    const res = await signup(`dev|patient|crosscode|${Date.now()}`, 'maria-nutrition-ios', { inviteCode: 'CARLOS-DEV1' });
    expect(res.json().error.code).toBe('TENANT_MISMATCH');
  });

  it('serves patients of every tenant, each scoped to their own tenant', async () => {
    for (const [slug, tenantId] of [['maria-nutrition', MARIA], ['carlos-nutrition', CARLOS]] as const) {
      const headers = { authorization: `Bearer ${await token(`dev|patient|${slug}`)}`, 'x-app-key': 'limon-android' };
      const res = await app.inject({ url: '/api/v1/patients/me', headers });
      expect(res.statusCode).toBe(200);
      expect(res.json().tenantId).toBe(tenantId);
    }
  });
});
