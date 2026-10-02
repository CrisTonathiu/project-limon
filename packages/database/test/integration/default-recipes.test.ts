/**
 * Copying the default recipe library into a tenant.
 *
 * Requires: docker compose up -d && pnpm db:migrate && pnpm db:seed
 * The library is written with the owner role (as curation does); the copy runs as
 * limon_app inside the tenant's transaction, like sign-up.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../generated/client/index.js';
import { copyDefaultRecipes, DatabaseRouter, SharedTenantRegistry, withTenant } from '../../src/index.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const owner = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_MIGRATION_URL } } });
const router = new DatabaseRouter({ url: process.env.DATABASE_URL });
const registry = new SharedTenantRegistry();
const inTenant = async <T>(tenantId: string, fn: Parameters<typeof withTenant<T>>[2]) =>
  withTenant(router, await registry.getPlacement(tenantId), fn);

const tag = `test-${Date.now()}`;
const defaultIds: string[] = [];
let foodId = '';

async function addDefaultRecipe(title: string) {
  const recipe = await owner.defaultRecipe.create({
    data: {
      title, mealTypes: ['BREAKFAST'], servings: 2, tags: [tag], steps: ['Mezclar.'],
      ingredients: {
        create: [
          { foodId, position: 1, quantity: 1, unit: 'CUP', grams: 80 },
          { foodId, position: 2, quantity: 10, unit: 'G', grams: 10, note: 'picado' },
        ],
      },
    },
  });
  defaultIds.push(recipe.id);
  return recipe;
}

beforeAll(async () => {
  const food = await owner.food.create({
    data: {
      key: tag, name: `Avena ${tag}`, fatsecretFoodId: tag, fatsecretServingId: '1',
      smaeGroup: 'CEREALS_FAT_FREE', gramsPerEquivalent: 20, shoppingCategory: 'GROCERY', allergens: ['gluten'],
    },
  });
  foodId = food.id;
});

afterAll(async () => {
  await owner.recipe.deleteMany({ where: { sourceDefaultRecipeId: { in: defaultIds } } });
  await owner.defaultRecipe.deleteMany({ where: { id: { in: defaultIds } } });
  await owner.food.deleteMany({ where: { id: foodId } });
  await Promise.all([owner.$disconnect(), router.disconnect()]);
});

describe('copyDefaultRecipes', () => {
  it('copies a default recipe and its ingredients into the tenant', async () => {
    const source = await addDefaultRecipe(`Avena ${tag}`);
    await inTenant(A, (tx) => copyDefaultRecipes(tx, A));

    const copy = await inTenant(A, (tx) =>
      tx.recipe.findFirstOrThrow({ where: { sourceDefaultRecipeId: source.id }, include: { ingredients: { orderBy: { position: 'asc' } } } }),
    );
    expect(copy).toMatchObject({ tenantId: A, title: source.title, mealTypes: ['BREAKFAST'], servings: 2, steps: ['Mezclar.'] });
    expect(copy.ingredients.map((i) => [i.tenantId, i.foodId, i.unit, i.grams, i.note])).toEqual([
      [A, foodId, 'CUP', 80, null],
      [A, foodId, 'G', 10, 'picado'],
    ]);
  });

  it('copies only new default recipes and keeps the tenant’s edits', async () => {
    const [first] = defaultIds;
    await inTenant(A, (tx) => tx.recipe.updateMany({ where: { sourceDefaultRecipeId: first }, data: { title: 'Mi avena' } }));
    const added = await addDefaultRecipe(`Avena 2 ${tag}`);

    const copied = await inTenant(A, (tx) => copyDefaultRecipes(tx, A));
    expect(copied).toBe(1);

    const titles = await inTenant(A, (tx) =>
      tx.recipe.findMany({ where: { sourceDefaultRecipeId: { in: [first!, added.id] } }, orderBy: { title: 'asc' }, select: { title: true } }),
    );
    expect(titles.map((r) => r.title)).toEqual([added.title, 'Mi avena']);
    expect(await inTenant(A, (tx) => copyDefaultRecipes(tx, A))).toBe(0);
  });

  it('another tenant doesn’t see the copies until it gets its own', async () => {
    const visible = await inTenant(B, (tx) => tx.recipe.count({ where: { sourceDefaultRecipeId: { in: defaultIds } } }));
    expect(visible).toBe(0);
  });

  it('can’t copy into another tenant from inside a tenant’s transaction', async () => {
    await expect(inTenant(A, (tx) => copyDefaultRecipes(tx, B))).rejects.toThrow(/row-level security/);
  });
});
