/**
 * End-to-end tenant isolation through the HTTP layer (real DB, dev auth).
 * Requires: docker compose up -d && pnpm db:migrate && pnpm db:seed
 */
import { loadServerEnv } from '@limon/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenant } from '@limon/database';
import { generateInviteCode } from '@limon/tenant';
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
    const res = await signup(sub, 'maria-nutrition-ios');
    expect(res.statusCode).toBe(201);
    expect(res.json().tenantId).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('refuses signup without a recognized app key', async () => {
    const res = await signup(`dev|patient|noapp|${Date.now()}`, undefined);
    expect(res.json().error.code).toBe('APP_NOT_RECOGNIZED');
  });

  it('requires express consent for sensitive health data', async () => {
    const res = await signup(`dev|patient|noconsent|${Date.now()}`, 'maria-nutrition-ios', {
      acceptSensitiveDataProcessing: false,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('new patients have no access to content until they pay', async () => {
    const sub = `dev|patient|unpaid|${Date.now()}`;
    await signup(sub, 'maria-nutrition-ios');
    const headers = { authorization: `Bearer ${await token(sub)}`, 'x-app-key': 'maria-nutrition-ios' };

    const profile = await app.inject({ url: '/api/v1/patients/me', headers });
    expect(profile.statusCode).toBe(200); // can sign in and see their profile

    const paywall = await app.inject({ url: '/api/v1/subscriptions/me', headers });
    expect(paywall.statusCode).toBe(200);
    expect(paywall.json().active).toBe(false); // …and reach the paywall
  });
});

describe('admission modes', () => {
  // Maria is OPEN, Carlos is INVITE ONLY (see prisma/seed.ts).
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
      remoteAddress: `10.0.6.${++ip}`,
      url: '/api/v1/auth/register/patient',
      headers: { authorization: `Bearer ${await token(sub)}`, 'x-app-key': appKey },
      payload: { email: `${sub.replace(/[|]/g, '-')}@test.mx`, firstName: 'Nueva', lastName: 'Paciente', ...consent, ...body },
    });
  const check = (code: string, appKey: string) =>
    app.inject({ url: `/api/v1/invites/${encodeURIComponent(code)}`, remoteAddress: `10.0.7.${++ip}`, headers: { 'x-app-key': appKey } });

  /** What `pnpm admin invite` does: a pre-registered patient plus their single-use code. */
  async function invitePatient(tenantId: string, opts: { expiresAt?: Date } = {}) {
    return withTenant(c.db, await c.registry.getPlacement(tenantId), async (tx) => {
      const patient = await tx.patient.create({ data: { tenantId, firstName: 'Pre', lastName: 'Registrada' } });
      const code = generateInviteCode();
      await tx.tenantInviteCode.create({ data: { tenantId, patientId: patient.id, code, expiresAt: opts.expiresAt ?? null } });
      return { patientId: patient.id, code };
    });
  }

  it('bootstrap tells the app whether sign-up needs an invite code', async () => {
    const open = await app.inject({ url: '/api/v1/apps/bootstrap', headers: { 'x-app-key': 'maria-nutrition-ios' } });
    expect(open.json()).toMatchObject({ tenantId: MARIA, requiresInviteCode: false });
    const inviteOnly = await app.inject({ url: '/api/v1/apps/bootstrap', headers: { 'x-app-key': 'carlos-nutrition-ios' } });
    expect(inviteOnly.json()).toMatchObject({ tenantId: CARLOS, requiresInviteCode: true });
  });

  it('OPEN: anyone can sign up without a code', async () => {
    const res = await signup(`dev|patient|open|${Date.now()}`, 'maria-nutrition-ios');
    expect(res.statusCode).toBe(201);
    expect(res.json().tenantId).toBe(MARIA);
  });

  it('INVITE ONLY: sign-up without a code is refused', async () => {
    const res = await signup(`dev|patient|nocode|${Date.now()}`, 'carlos-nutrition-ios');
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('INVITE_CODE_INVALID');
  });

  it('INVITE ONLY: a code activates exactly the patient it was issued to, once', async () => {
    const { patientId, code } = await invitePatient(CARLOS);
    expect((await check(code.toLowerCase(), 'carlos-nutrition-ios')).statusCode).toBe(204);

    const res = await signup(`dev|patient|invited|${Date.now()}`, 'carlos-nutrition-ios', { inviteCode: code });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ tenantId: CARLOS, patientId });

    // Single use: neither the check nor a second sign-up accepts it again.
    expect((await check(code, 'carlos-nutrition-ios')).json().error.code).toBe('INVITE_CODE_INVALID');
    const again = await signup(`dev|patient|reuse|${Date.now()}`, 'carlos-nutrition-ios', { inviteCode: code });
    expect(again.json().error.code).toBe('INVITE_CODE_INVALID');
  });

  it('OPEN: a code is optional but still links the pre-registered patient', async () => {
    const { patientId, code } = await invitePatient(MARIA);
    const res = await signup(`dev|patient|openinvite|${Date.now()}`, 'maria-nutrition-ios', { inviteCode: code });
    expect(res.statusCode).toBe(201);
    expect(res.json().patientId).toBe(patientId);
  });

  it('a code only works in its own nutritionist’s app', async () => {
    const { code } = await invitePatient(MARIA);
    expect((await check(code, 'carlos-nutrition-ios')).json().error.code).toBe('INVITE_CODE_INVALID');
    const res = await signup(`dev|patient|crossapp|${Date.now()}`, 'carlos-nutrition-ios', { inviteCode: code });
    expect(res.json().error.code).toBe('INVITE_CODE_INVALID');
  });

  it('expired, unknown and malformed codes are rejected the same way', async () => {
    const { code: expired } = await invitePatient(CARLOS, { expiresAt: new Date(Date.now() - 60_000) });
    for (const code of [expired, 'NOPE-NOPE', 'x', "'; DROP TABLE x"]) {
      const res = await check(code, 'carlos-nutrition-ios');
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('INVITE_CODE_INVALID');
    }
  });

  it('a failed sign-up leaves the code unused', async () => {
    const { code } = await invitePatient(CARLOS);
    // Email in the token differs from the body → rejected before anything is written.
    const sub = `dev|patient|mismatch|${Date.now()}`;
    const res = await app.inject({
      method: 'POST', remoteAddress: `10.0.6.${++ip}`, url: '/api/v1/auth/register/patient',
      headers: { authorization: `Bearer ${await c.devVerifier!.issue(sub, 'otra@test.mx')}`, 'x-app-key': 'carlos-nutrition-ios' },
      payload: { email: 'distinta@test.mx', firstName: 'X', lastName: 'Y', inviteCode: code, ...consent },
    });
    expect(res.statusCode).toBe(403);
    expect((await check(code, 'carlos-nutrition-ios')).statusCode).toBe(204);
  });
});
