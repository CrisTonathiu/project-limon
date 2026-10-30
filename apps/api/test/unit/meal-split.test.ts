import { defaultMealTimes, inEatingOrder, mealSlotTypes } from '@limon/validation';
import { describe, expect, it } from 'vitest';
import { MEAL_SPLITS } from '../../src/modules/meal-plans/meal-split.js';

describe('MEAL_SPLITS', () => {
  it.each([3, 4, 5])('lays out %i meals as the app names them, with a default time each', (n) => {
    const slots = MEAL_SPLITS[n]!;
    expect(slots.map((s) => s.mealType)).toEqual(mealSlotTypes(n));
    expect(defaultMealTimes(n)).toHaveLength(slots.length);
    expect(inEatingOrder(defaultMealTimes(n))).toBe(true);
  });
});
