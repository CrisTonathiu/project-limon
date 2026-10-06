import { describe, expect, it } from 'vitest';
import { applySwaps, canSwap, equivalentGrams, swapOptions, type SwapFood } from '../../src/modules/meal-plans/food-swaps.js';

const food = (id: string, smaeGroup: SwapFood['smaeGroup'], gramsPerEquivalent: number | null, allergens: string[] = []): SwapFood => ({
  id, name: id, smaeGroup, gramsPerEquivalent, allergens, fatsecretFoodId: `fs-${id}`, fatsecretServingId: '1',
});

// One cereal equivalent: 30 g tortilla, 20 g bread, 20 g oats. One animal equivalent: 30 g chicken.
const tortilla = food('tortilla', 'CEREALS_FAT_FREE', 30);
const bread = food('bread', 'CEREALS_FAT_FREE', 20, ['gluten']);
const oats = food('oats', 'CEREALS_FAT_FREE', 20);
const chicken = food('chicken', 'ANIMAL_VERY_LOW_FAT', 30);
const garlic = food('garlic', null, null);
const noEquivalent = food('no-equivalent', 'CEREALS_FAT_FREE', null);

describe('canSwap', () => {
  it('needs the same SMAE group and grams per equivalent on both foods', () => {
    expect(canSwap(tortilla, oats)).toBe(true);
    expect(canSwap(tortilla, chicken)).toBe(false);
    expect(canSwap(tortilla, noEquivalent)).toBe(false);
    expect(canSwap(garlic, garlic)).toBe(false);
    expect(canSwap(tortilla, tortilla)).toBe(false);
  });
});

describe('equivalentGrams', () => {
  it('keeps the number of equivalents', () => {
    // 90 g tortilla = 3 equivalents = 60 g oats.
    expect(equivalentGrams(90, tortilla, oats)).toBe(60);
    expect(equivalentGrams(60, oats, tortilla)).toBe(90);
  });
});

describe('applySwaps', () => {
  const ingredients = [
    { id: 'i1', grams: 90, food: tortilla },
    { id: 'i2', grams: 120, food: chicken },
  ];

  it('replaces the swapped ingredient with the equivalent grams of the new food', () => {
    const [first, second] = applySwaps(ingredients, new Map([['i1', oats]]));
    expect(first).toEqual({ id: 'i1', grams: 60, food: oats, swappedFrom: tortilla });
    expect(second).toEqual({ ...ingredients[1], swappedFrom: null });
  });

  it('ignores a swap that no longer holds', () => {
    expect(applySwaps(ingredients, new Map([['i2', oats]]))[1]).toEqual({ ...ingredients[1], swappedFrom: null });
  });
});

describe('swapOptions', () => {
  const catalog = [tortilla, bread, oats, chicken, noEquivalent];
  const none = { allergies: [], dislikedFoodIds: [] };

  it('lists the other foods of the group with an equivalent', () => {
    expect(swapOptions(tortilla, tortilla, catalog, none)).toEqual([bread, oats]);
  });

  it('leaves out the patient’s allergens and disliked foods', () => {
    expect(swapOptions(tortilla, tortilla, catalog, { allergies: ['gluten'], dislikedFoodIds: ['oats'] })).toEqual([]);
  });

  it('offers the recipe’s own food back once swapped, but not the current one', () => {
    expect(swapOptions(tortilla, oats, catalog, none)).toEqual([tortilla, bread]);
  });
});
