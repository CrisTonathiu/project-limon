import { describe, expect, it } from 'vitest';
import type { ResolvedIdentity, ResolvedTenantApp } from '@limon/database';
import { resolveTenantContext, type ResolveDeps } from '../../src/middleware/tenant-context.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function deps(
  identity: Partial<ResolvedIdentity> | null,
  apps: Record<string, Partial<ResolvedTenantApp>> = {},
  entitled = true,
): ResolveDeps {
  return {
    hasActiveEntitlement: async () => entitled,
    resolveIdentity: async () =>
      identity && { userId: 'u1', tenantId: A, role: 'NUTRITIONIST', userStatus: 'ACTIVE', tenantStatus: 'ACTIVE', email: 'x@y.z', ...identity },
    resolveTenantApp: async (k) => (apps[k] ? ({ tenantStatus: 'ACTIVE', appStatus: 'PUBLISHED', ...apps[k] } as ResolvedTenantApp) : null),
  };
}
const principal = { subject: 'sub', email: null, clientId: null };
const base = { principal, requestId: 'req-1', appKey: undefined as string | undefined };

describe('resolveTenantContext', () => {
  it('builds context from the database identity, not the client', async () => {
    const ctx = await resolveTenantContext(deps({}), { ...base, permission: 'patients:read' });
    expect(ctx).toMatchObject({ tenantId: A, userId: 'u1', role: 'NUTRITIONIST' });
  });

  it('rejects unknown users', async () => {
    await expect(resolveTenantContext(deps(null), { ...base, permission: 'tenant:read' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects a patient using ANOTHER tenant’s app (Maria patient in Carlos app)', async () => {
    const d = deps({ role: 'PATIENT' }, { 'carlos-ios': { tenantId: B } });
    await expect(resolveTenantContext(d, { ...base, appKey: 'carlos-ios', permission: 'self:patient:read' })).rejects.toMatchObject({ code: 'TENANT_MISMATCH' });
  });

  it('requires patients to present an app key', async () => {
    await expect(resolveTenantContext(deps({ role: 'PATIENT' }), { ...base, permission: 'self:patient:read' })).rejects.toMatchObject({ code: 'APP_NOT_RECOGNIZED' });
  });

  it('locks patients out of a suspended tenant even though the app is still PUBLISHED', async () => {
    const d = deps({ role: 'PATIENT', tenantStatus: 'SUSPENDED' }, { 'maria-ios': { tenantId: A, appStatus: 'PUBLISHED' } });
    await expect(resolveTenantContext(d, { ...base, appKey: 'maria-ios', permission: 'self:patient:read' })).rejects.toMatchObject({ code: 'TENANT_SUSPENDED' });
  });

  it('gives a suspended nutritionist read-only access', async () => {
    const d = deps({ tenantStatus: 'SUSPENDED' });
    await expect(resolveTenantContext(d, { ...base, permission: 'patients:read' })).resolves.toBeTruthy();
    await expect(resolveTenantContext(d, { ...base, permission: 'patients:write' })).rejects.toMatchObject({ code: 'TENANT_SUSPENDED' });
  });

  it('blocks unpaid patients from paid content but still allows the paywall', async () => {
    const d = deps({ role: 'PATIENT' }, { 'maria-ios': { tenantId: A } }, false);
    await expect(
      resolveTenantContext(d, { principal, requestId: 'r', appKey: 'maria-ios', permission: 'self:meal-plans:read' }),
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
    await expect(
      resolveTenantContext(d, { principal, requestId: 'r', appKey: 'maria-ios', permission: 'self:subscription:read' }),
    ).resolves.toBeTruthy();
  });

  it('allows paid patients into content', async () => {
    const d = deps({ role: 'PATIENT' }, { 'maria-ios': { tenantId: A } }, true);
    await expect(
      resolveTenantContext(d, { principal, requestId: 'r', appKey: 'maria-ios', permission: 'self:meal-plans:read' }),
    ).resolves.toBeTruthy();
  });

  it('denies patients nutritionist permissions', async () => {
    const d = deps({ role: 'PATIENT' }, { 'maria-ios': { tenantId: A } });
    await expect(resolveTenantContext(d, { ...base, appKey: 'maria-ios', permission: 'patients:read' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
