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
        tx.recipe.create({ data: { tenantId: B, title: 'smuggled', mealTypes: ['LUNCH'], servings: 1 } }),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('tenant A cannot insert meal plans or meal feedback tagged with tenant B', async () => {
    // Its own tenant B recipe: the seed only has recipes when the private default library was loaded.
    const [bPatient, bRecipe] = await withTenant(router, await registry.getPlacement(B), (tx) =>
      Promise.all([
        tx.patient.findFirstOrThrow(),
        tx.recipe.create({ data: { tenantId: B, title: 'isolation test', mealTypes: ['LUNCH'], servings: 1 } }),
      ]),
    );
    try {
      const weekStart = new Date('2026-10-19');
      await expect(
        withTenant(router, await registry.getPlacement(A), (tx) => tx.mealPlan.create({ data: { tenantId: B, patientId: bPatient.id, weekStart } })),
      ).rejects.toThrow(/row-level security/);
      await expect(
        withTenant(router, await registry.getPlacement(A), (tx) =>
          tx.mealFeedback.create({ data: { tenantId: B, patientId: bPatient.id, recipeId: bRecipe.id, rating: 1, weekStart } }),
        ),
      ).rejects.toThrow(/row-level security/);
    } finally {
      await withTenant(router, await registry.getPlacement(B), (tx) => tx.recipe.delete({ where: { id: bRecipe.id } }));
    }
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

  it('the shared food catalog and default recipes are read-only for the app role', async () => {
    const tx = router.controlPlane();
    await expect(tx.food.findMany()).resolves.toBeDefined();
    await expect(
      tx.food.create({
        data: { key: 'x', name: 'x', fatsecretFoodId: 'x', fatsecretServingId: 'x', shoppingCategory: 'GROCERY' },
      }),
    ).rejects.toThrow(/permission denied/);
    await expect(tx.defaultRecipe.deleteMany({})).rejects.toThrow(/permission denied/);
    await expect(tx.defaultRecipeIngredient.deleteMany({})).rejects.toThrow(/permission denied/);
  });

  it('audit logs are append-only for the app role', async () => {
    await expect(
      withTenant(router, await registry.getPlacement(A), (tx) => tx.auditLog.deleteMany({})),
    ).rejects.toThrow(/permission denied/);
  });
});
