import { describe, expect, it } from 'vitest';
import { goalProgress } from './goal';

describe('goalProgress', () => {
  it('measures a loss goal from the start weight', () => {
    expect(goalProgress({ startKg: 78, targetKg: 71, currentKg: 73.8 })).toBeCloseTo(0.6);
  });

  it('works for a gain goal', () => {
    expect(goalProgress({ startKg: 52, targetKg: 56, currentKg: 54.5 })).toBeCloseTo(0.625);
  });

  it('stays between 0 and 1', () => {
    expect(goalProgress({ startKg: 78, targetKg: 71, currentKg: 79 })).toBe(0);
    expect(goalProgress({ startKg: 78, targetKg: 71, currentKg: 70 })).toBe(1);
  });
});
