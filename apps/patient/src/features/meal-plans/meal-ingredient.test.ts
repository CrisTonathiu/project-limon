import type { PlannedMealIngredientDto } from '@limon/types';
import { describe, expect, it } from 'vitest';
import { mealIngredientParts } from './meal-ingredient';

const base: PlannedMealIngredientDto = {
  id: 'i',
  foodId: 'f',
  name: 'Chile poblano',
  grams: 324,
  quantity: 2.7,
  unit: 'PIECE',
  note: null,
  swappedFrom: null,
  swappable: true,
};

describe('mealIngredientParts', () => {
  it('gives the household amount with grams', () => {
    expect(mealIngredientParts(base)).toEqual({
      name: 'Chile poblano',
      amount: '2.7 piezas (324 g)',
    });
  });

  it('keeps grams once when the recipe is already in grams, and adds the note to the name', () => {
    expect(
      mealIngredientParts({
        ...base,
        name: 'Queso panela',
        grams: 101,
        quantity: 101,
        unit: 'G',
        note: 'en tiras',
      }),
    ).toEqual({
      name: 'Queso panela, en tiras',
      amount: '101 g',
    });
  });

  it('only has grams for a swapped ingredient', () => {
    expect(
      mealIngredientParts({
        ...base,
        name: 'Calabacita',
        grams: 150,
        swappedFrom: { foodId: 'x', name: 'Chile poblano' },
      }),
    ).toEqual({
      name: 'Calabacita',
      amount: '150 g',
    });
  });
});
