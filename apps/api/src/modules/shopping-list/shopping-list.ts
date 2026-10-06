import { ShoppingCategory, type IngredientUnit, type ShoppingListSectionDto, type ShoppingUnit } from '@limon/types';

/** One ingredient of one planned meal, for the patient's portion (after swaps). */
export type ListIngredient = {
  food: { id: string; name: string; shoppingCategory: ShoppingCategory };
  grams: number;
  /** The household amount, null for a swapped ingredient. */
  quantity: number | null;
  unit: IngredientUnit | null;
};

/** What the patient checked for a food this week. */
export type ListCheck = { unit: ShoppingUnit; amount: number };

/** Spanish order: "Ñame" after "Nuez", accents ignored. */
const byName = new Intl.Collator('es-MX').compare;
const SECTION_ORDER = Object.values(ShoppingCategory);

/**
 * Rounded up to what you can buy: whole pieces; grams and millilitres to 10 up to 100,
 * to 50 up to 1,000, and to 100 above that ("1,100 g", shown as 1.1 kg).
 */
export function shoppableAmount(unit: ShoppingUnit, amount: number): number {
  // Tolerance for float sums like 2.0000001 pieces; portions move in 0.05 steps, so real amounts never differ this little.
  const up = (step: number) => Math.ceil(amount / step - 1e-6) * step;
  if (unit === 'PIECE') return Math.max(up(1), 1);
  return Math.max(up(amount <= 100 ? 10 : amount <= 1000 ? 50 : 100), 10);
}

/**
 * Counts a food the way the recipes write it: in pieces when every use is in pieces (eggs,
 * limes), in millilitres when every use is in millilitres (milk), otherwise in grams.
 */
function countFood(uses: ListIngredient[]): { unit: ShoppingUnit; amount: number } {
  for (const unit of ['PIECE', 'ML'] as const) {
    if (uses.every((u) => u.unit === unit && u.quantity !== null)) return { unit, amount: uses.reduce((s, u) => s + u.quantity!, 0) };
  }
  return { unit: 'G', amount: uses.reduce((s, u) => s + u.grams, 0) };
}

/**
 * The week's ingredients added up by food, rounded up to shoppable amounts and grouped by
 * store section. An item is checked when the patient checked it for at least that amount.
 */
export function buildShoppingList(ingredients: ListIngredient[], checks: ReadonlyMap<string, ListCheck>): ShoppingListSectionDto[] {
  const byFood = new Map<string, ListIngredient[]>();
  for (const i of ingredients) byFood.set(i.food.id, [...(byFood.get(i.food.id) ?? []), i]);

  const items = [...byFood.values()].map((uses) => {
    const { food } = uses[0]!;
    const counted = countFood(uses);
    const amount = shoppableAmount(counted.unit, counted.amount);
    const check = checks.get(food.id);
    return {
      category: food.shoppingCategory,
      item: { foodId: food.id, name: food.name, unit: counted.unit, amount, checked: !!check && check.unit === counted.unit && check.amount >= amount },
    };
  });

  return SECTION_ORDER.flatMap((category) => {
    const section = items.filter((i) => i.category === category).map((i) => i.item).sort((a, b) => byName(a.name, b.name));
    return section.length ? [{ category, items: section }] : [];
  });
}
