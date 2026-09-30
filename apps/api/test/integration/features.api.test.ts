/**
 * Per-tenant feature flags through the HTTP layer (real DB, dev auth): /auth/me and requireFeature.
 * Requires: docker compose up -d && pnpm db:migrate && pnpm db:seed
 */
import { Permission } from '@limon/auth';
import { loadServerEnv } from '@limon/config';
import { withTenant } from '@limon/database';
import { FeatureKey } from '@limon/types';
import Fastify from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createContainer } from '../../src/infrastructure/container.js';
import { requireFeature, requireTenant } from '../../src/middleware/auth.js';
import { errorHandler } from '../../src/middleware/error-handler.js';

const env = loadServerEnv({ ...process.env, AUTH_PROVIDER: 'dev', DEV_AUTH_SECRET: 'test', SQS_JOBS_QUEUE_URL: '' });
const c = createContainer(env);
let app: Awaited<ReturnType<typeof buildApp>>;
// A bare app with one gated route, standing in for the modules that will use the guard.
const gated = Fastify();
let tenantId: string;
let headers: Record<string, string>;

async function setFeature(featureKey: FeatureKey, enabled: boolean) {
  await withTenant(c.db, await c.registry.getPlacement(tenantId), (tx) =>
    tx.tenantFeature.upsert({
      where: { tenantId_featureKey: { tenantId, featureKey } },
      update: { enabled },
      create: { tenantId, featureKey, enabled },
    }),
  );
}

beforeAll(async () => {
  app = await buildApp(c);
  gated.setErrorHandler(errorHandler);
  gated.get('/meal-plan', { preHandler: [requireTenant(c, Permission.TENANT_READ), requireFeature(c, FeatureKey.MEAL_PLAN)] }, async () => ({ ok: true }));
  await gated.ready();

  headers = { authorization: `Bearer ${await c.devVerifier!.issue('dev|patient|maria-nutrition')}`, 'x-app-key': 'maria-nutrition-ios' };
  tenantId = (await app.inject({ url: '/api/v1/auth/me', headers })).json().tenant.id;
});
afterEach(async () => {
  await setFeature(FeatureKey.MEAL_PLAN, true); // back to the seeded state
});
afterAll(async () => {
  await gated.close();
  await app.close();
  await c.db.disconnect();
});

describe('feature flags', () => {
  it('/auth/me lists the tenant’s enabled modules', async () => {
    const me = (await app.inject({ url: '/api/v1/auth/me', headers })).json();
    expect(me.features).toEqual(expect.arrayContaining([FeatureKey.MEAL_PLAN, FeatureKey.SHOPPING_LIST, FeatureKey.RECIPES]));
    expect(me.features).not.toContain(FeatureKey.AI_ASSISTANT);
  });

  it('turning a module off hides it and its dependants, without a release', async () => {
    await setFeature(FeatureKey.MEAL_PLAN, false);
    const me = (await app.inject({ url: '/api/v1/auth/me', headers })).json();
    expect(me.features).not.toContain(FeatureKey.MEAL_PLAN);
    expect(me.features).not.toContain(FeatureKey.SHOPPING_LIST); // needs meal_plan
    expect(me.features).toContain(FeatureKey.RECIPES);
  });

  it('requireFeature lets an enabled module through', async () => {
    const res = await gated.inject({ url: '/meal-plan', headers });
    expect(res.statusCode).toBe(200);
  });

  it('requireFeature answers FEATURE_DISABLED when the module is off', async () => {
    await setFeature(FeatureKey.MEAL_PLAN, false);
    const res = await gated.inject({ url: '/meal-plan', headers });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FEATURE_DISABLED');
  });
});
