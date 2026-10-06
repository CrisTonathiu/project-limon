import { describe, expect, it } from 'vitest';
import { macroShares } from './macro-shares';

describe('macroShares', () => {
  it('weighs each macro by its calories', () => {
    const s = macroShares({ protein: 25, carbohydrate: 50, fat: 100 / 9 });
    expect(s.protein).toBeCloseTo(0.25);
    expect(s.carbohydrate).toBeCloseTo(0.5);
    expect(s.fat).toBeCloseTo(0.25);
  });

  it('is all zero without energy', () => {
    expect(macroShares({ protein: 0, carbohydrate: 0, fat: 0 })).toEqual({
      protein: 0,
      carbohydrate: 0,
      fat: 0,
    });
  });
});
