import type { SmaeGroup } from '@limon/types';

/** A catalog food, with what swaps, filters and macros need. */
export type SwapFood = {
  id: string;
  name: string;
  smaeGroup: SmaeGroup | null;
  gramsPerEquivalent: number | null;
  allergens: string[];
  fatsecretFoodId: string;
  fatsecretServingId: string;
};

/** Both foods are in the same SMAE group and have their grams per equivalent. */
export function canSwap(from: SwapFood, to: SwapFood): boolean {
  return from.id !== to.id && from.smaeGroup !== null && from.smaeGroup === to.smaeGroup && !!from.gramsPerEquivalent && !!to.gramsPerEquivalent;
}

/** Same equivalents in the new food: `new grams = (old grams / old grams per equivalent) × new grams per equivalent`. */
export function equivalentGrams(grams: number, from: SwapFood, to: SwapFood): number {
  return (grams / from.gramsPerEquivalent!) * to.gramsPerEquivalent!;
}

/**
 * A meal's ingredients after its swaps (`swaps` maps a recipe ingredient id to the food eaten
 * instead). A swap that no longer holds, because the catalog moved a food to another group or
 * dropped its equivalent, is ignored and the recipe's food shows again.
 */
export function applySwaps<I extends { id: string; grams: number; food: SwapFood }>(
  ingredients: I[],
  swaps: ReadonlyMap<string, SwapFood>,
): (I & { swappedFrom: SwapFood | null })[] {
  return ingredients.map((i) => {
    const to = swaps.get(i.id);
    if (!to || !canSwap(i.food, to)) return { ...i, swappedFrom: null };
    return { ...i, food: to, grams: equivalentGrams(i.grams, i.food, to), swappedFrom: i.food };
  });
}

/**
 * Foods an ingredient can be swapped for: the recipe's own food (`original`) and the foods of
 * its SMAE group, without the patient's allergens and disliked foods. The food eaten now
 * (`current`, the original when not swapped) is left out.
 */
export function swapOptions(
  original: SwapFood,
  current: SwapFood,
  catalog: SwapFood[],
  patient: { allergies: string[]; dislikedFoodIds: string[] },
): SwapFood[] {
  const disliked = new Set(patient.dislikedFoodIds);
  return catalog.filter(
    (f) =>
      f.id !== current.id &&
      (f.id === original.id ||
        (canSwap(original, f) && !disliked.has(f.id) && !f.allergens.some((a) => patient.allergies.includes(a)))),
  );
}
