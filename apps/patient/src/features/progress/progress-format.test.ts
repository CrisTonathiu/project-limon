import type { ProgressResponse } from '@limon/types';
import { describe, expect, it } from 'vitest';
import { goalBar, measurementTiles, weightChart } from './progress-format';

const none = { waistCm: null, hipCm: null, chestCm: null, armCm: null, thighCm: null, bodyFatPct: null };
const progress: ProgressResponse = {
  currentWeightKg: 73.8,
  weights: [
    { date: '2026-08-18', weightKg: 78 },
    { date: '2026-09-01', weightKg: 76.5 },
    { date: '2026-09-15', weightKg: 75.1 },
    { date: '2026-10-06', weightKg: 73.8 },
  ],
  measurements: {
    ...none,
    waistCm: { value: 82, date: '2026-10-06', change: -3 },
    chestCm: { value: 95, date: '2026-09-01', change: null },
    bodyFatPct: { value: 29, date: '2026-10-06', change: -1.5 },
    armCm: { value: 30, date: '2026-10-06', change: 0 },
  },
  weightGoal: { startWeightKg: 78, targetWeightKg: 71, startedOn: '2026-08-18' },
};

describe('goalBar', () => {
  it('goes from the start weight to the target, starting on the goal date', () => {
    expect(goalBar(progress)).toEqual({ startKg: 78, targetKg: 71, currentKg: 73.8, startedOn: '18 ago' });
    expect(goalBar({ ...progress, weightGoal: null })).toBeNull();
  });
});

describe('weightChart', () => {
  it('labels the first, middle and last weigh-in, the last as "Hoy" when it is today', () => {
    expect(weightChart(progress, '2026-10-06')).toEqual({
      currentKg: 73.8,
      valuesKg: [78, 76.5, 75.1, 73.8],
      axis: ['18 ago', '1 sep', 'Hoy'],
    });
    expect(weightChart(progress, '2026-10-07').axis[2]).toBe('6 oct');
  });

  it('has no axis with fewer than two weigh-ins', () => {
    expect(weightChart({ ...progress, weights: [{ date: '2026-10-06', weightKg: 73.8 }] }, '2026-10-06').axis).toEqual(['', '', '']);
  });
});

describe('measurementTiles', () => {
  it('shows the first three logged, in the mockup order, with their change', () => {
    expect(measurementTiles(progress)).toEqual([
      { label: 'Cintura', value: '82 cm', change: '−3 cm' },
      { label: 'Grasa corporal', value: '29%', change: '−1.5%' },
      { label: 'Pecho', value: '95 cm', change: null },
    ]);
  });

  it('is null when nothing was measured', () => {
    expect(measurementTiles({ ...progress, measurements: none })).toBeNull();
  });
});
