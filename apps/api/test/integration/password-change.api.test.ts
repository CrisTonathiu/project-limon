/**
 * A nutritionist created by the platform team (`admin create-tenant`) must replace the
 * temporary password before anything else (real DB, dev auth, a fake IdentityAdmin).
 * Requires: docker compose up -d && pnpm db:migrate && pnpm db:seed
 */
import type { IdentityAdmin } from '@limon/auth';
import { loadServerEnv } from '@limon/config';
import { withTenant } from '@limon/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createContainer } from '../../src/infrastructure/container.js';

const env = loadServerEnv({ ...process.env, AUTH_PROVIDER: 'dev', DEV_AUTH_SECRET: 'test', PUBSUB_JOBS_TOPIC: '' });
const tenantId = '11111111-1111-4111-8111-111111111111';
const passwords: [string, string][] = [];
const identityAdmin: IdentityAdmin = {
  createTenant: async () => 'unused',
  deleteTenant: async () => undefined,
  deleteUser: async () => undefined,
  createLogin: async () => 'unused',
  deleteLogin: async () => undefined,
  setPassword: async (uid, password) => {
    passwords.push([uid, password]);
  },
};
const c = createContainer(env, { identityAdmin });
let app: Awaited<ReturnType<typeof buildApp>>;
let ip = 0;

const scoped = async <T>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(c.db, await c.registry.getPlacement(tenantId), fn);

// A second nutritionist in Maria's practice, holding a temporary password.
const sub = `dev|nutritionist|password|${Date.now()}`;
let userId: string;
let headers: Record<string, string>;

beforeAll(async () => {
  app = await buildApp(c);
  const user = await scoped((tx) =>
    tx.user.create({ data: { tenantId, authUserId: sub, email: `password-${Date.now()}@test.mx`, role: 'NUTRITIONIST', passwordChangeRequired: true } }),
  );
  userId = user.id;
  headers = { authorization: `Bearer ${await c.devVerifier!.issue(sub)}` };
});
afterAll(async () => {
  await scoped((tx) => tx.user.update({ where: { id: userId }, data: { status: 'DISABLED', deletedAt: new Date() } }));
  await app.close();
  await c.db.disconnect();
});

const changePassword = (password: string) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/password', remoteAddress: `10.0.20.${++ip}`, headers, payload: { password } });

describe('temporary password', () => {
  it('allows only /auth/me and the password change until it is replaced', async () => {
    const patients = await app.inject({ method: 'GET', url: '/api/v1/patients', headers });
    expect(patients.statusCode).toBe(403);
    expect(patients.json().error.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.passwordChangeRequired).toBe(true);
  });

  it('refuses a password below the policy without touching the login', async () => {
    const res = await changePassword('short1A');
    expect(res.statusCode).toBe(400);
    expect(passwords).toEqual([]);
  });

  it('sets the new password, clears the flag with an audit entry, and only once', async () => {
    expect((await changePassword('Limon2026nueva')).statusCode).toBe(204);
    expect(passwords).toEqual([[sub, 'Limon2026nueva']]);

    const { user, audit } = await scoped(async (tx) => ({
      user: await tx.user.findUniqueOrThrow({ where: { id: userId } }),
      audit: await tx.auditLog.findMany({ where: { tenantId, userId, action: 'PasswordChanged' } }),
    }));
    expect(user.passwordChangeRequired).toBe(false);
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit[0]!.metadata)).not.toContain('Limon2026nueva');

    expect((await app.inject({ method: 'GET', url: '/api/v1/patients', headers })).statusCode).toBe(200);
    expect((await changePassword('Limon2026otra')).statusCode).toBe(409);
    expect(passwords).toHaveLength(1);
  });
});
