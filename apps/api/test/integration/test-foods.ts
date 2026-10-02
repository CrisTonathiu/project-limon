import { DatabaseRouter } from '@limon/database';

/**
 * Catalog foods for a test file, written with the owner role (foods is read-only for the
 * app role). Keys start with the file's prefix, so files running in parallel never share
 * rows. `cleanup` also removes the disliked-food rows that point at them.
 */
export async function createTestFoods(prefix: string, names: string[]) {
  const owner = new DatabaseRouter({ url: process.env.DATABASE_MIGRATION_URL });
  const db = owner.controlPlane();
  const foods = [];
  for (const [i, name] of names.entries()) {
    const key = `${prefix}-${i}`;
    const data = { name, fatsecretFoodId: `test-${key}`, fatsecretServingId: '1', shoppingCategory: 'GROCERY' as const };
    foods.push(await db.food.upsert({ where: { key }, create: { key, ...data }, update: data, select: { id: true, name: true } }));
  }
  const ids = foods.map((f) => f.id);
  return {
    foods,
    cleanup: async () => {
      await db.patientDislikedFood.deleteMany({ where: { foodId: { in: ids } } });
      await db.food.deleteMany({ where: { id: { in: ids } } });
      await owner.disconnect();
    },
  };
}
