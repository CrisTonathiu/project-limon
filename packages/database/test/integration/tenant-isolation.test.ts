/**
 * THE most important security test: Tenant A cannot read or write Tenant B data,
 * enforced by the DATABASE even if application code forgets a tenant filter.
 *
 * Requires: docker compose up -d && pnpm db:migrate && pnpm db:seed
 * Connects as limon_app (RLS enforced).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { DatabaseRouter, SharedTenantRegistry, withTenant } from '../../src/index.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const router = new DatabaseRouter({ url: process.env.DATABASE_URL });
const registry = new SharedTenantRegistry();
afterAll(() => router.disconnect());

describe('RLS tenant isolation', () => {
  it('an unscoped query inside tenant A only returns tenant A rows', async () => {
    const patients = await withTenant(router, await registry.getPlacement(A), (tx) => tx.patient.findMany());
    expect(patients.length).toBeGreaterThan(0);
    expect(patients.every((p) => p.tenantId === A)).toBe(true);
  });

  it('tenant A cannot fetch a tenant B record by id', async () => {
    const bPatient = await withTenant(router, await registry.getPlacement(B), (tx) => tx.patient.findFirstOrThrow());
    const leaked = await withTenant(router, await registry.getPlacement(A), (tx) =>
      tx.patient.findUnique({ where: { id: bPatient.id } }),
    );
    expect(leaked).toBeNull();
  });

  it('tenant A cannot insert rows tagged with tenant B', async () => {
    await expect(
      withTenant(router, await registry.getPlacement(A), (tx) =>
        tx.recipe.create({ data: { tenantId: B, title: 'smuggled' } }),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('tenant A cannot update tenant B rows', async () => {
    const count = await withTenant(router, await registry.getPlacement(A), (tx) =>
      tx.patient.updateMany({ where: { tenantId: B }, data: { firstName: 'pwned' } }),
    );
    expect(count.count).toBe(0);
  });

  it('with no tenant set, tenant-owned tables return nothing', async () => {
    const rows = await router.controlPlane().patient.findMany();
    expect(rows).toHaveLength(0);
  });

  it('audit logs are append-only for the app role', async () => {
    await expect(
      withTenant(router, await registry.getPlacement(A), (tx) => tx.auditLog.deleteMany({})),
    ).rejects.toThrow(/permission denied/);
  });
});
