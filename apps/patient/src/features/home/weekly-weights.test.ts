import type { ProgressResponse } from '@limon/types';
import { describe, expect, it } from 'vitest';
import { goalRing, weeklyWeights } from './weekly-weights';

describe('weeklyWeights', () => {
  it('keeps the last weigh-in of each week, counted back from today', () => {
    const weights = [
      { date: '2026-09-20', weightKg: 76 },
      { date: '2026-09-22', weightKg: 75.6 },
      { date: '2026-09-29', weightKg: 75 },
      { date: '2026-10-05', weightKg: 74.4 },
      { date: '2026-10-06', weightKg: 74.2 },
    ];
    expect(weeklyWeights(weights, '2026-10-06')).toEqual([75.6, 75, 74.2]);
  });
});

describe('goalRing', () => {
  const base: ProgressResponse = {
    currentWeightKg: 73.8,
    weights: [],
    measurements: { waistCm: null, hipCm: null, chestCm: null, armCm: null, thighCm: null, bodyFatPct: null },
    weightGoal: { startWeightKg: 78, targetWeightKg: 71, startedOn: '2026-08-18' },
  };

  it('is signed: a loss goal and its progress are negative', () => {
    expect(goalRing(base)).toEqual({ kind: 'weightGoal', changeKg: -4.2, goalKg: -7 });
    expect(goalRing({ ...base, weightGoal: null })).toBeNull();
  });
});
