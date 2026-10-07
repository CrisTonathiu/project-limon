import type { BodyLogDto } from '@limon/types';
import { describe, expect, it } from 'vitest';
import { buildProgress, isEmptyLog, mergeBodyLog, periodStart, weightGoalOf } from '../../src/modules/patients/body-logs.js';

const empty = { weightKg: null, waistCm: null, hipCm: null, chestCm: null, armCm: null, thighCm: null, bodyFatPct: null };
const log = (date: string, values: Partial<BodyLogDto>): BodyLogDto => ({ ...empty, ...values, date });

describe('mergeBodyLog', () => {
  it('replaces the given fields, keeps the missing ones and clears the nulls', () => {
    const day = { ...empty, weightKg: 80, waistCm: 90 };
    expect(mergeBodyLog(day, { weightKg: 79.5, hipCm: 100, waistCm: null })).toEqual({ ...empty, weightKg: 79.5, hipCm: 100 });
  });

  it('starts a new day from nothing', () => {
    expect(mergeBodyLog(null, { bodyFatPct: 28 })).toEqual({ ...empty, bodyFatPct: 28 });
  });

  it('knows when a day has nothing left', () => {
    expect(isEmptyLog(mergeBodyLog({ ...empty, weightKg: 80 }, { weightKg: null }))).toBe(true);
    expect(isEmptyLog({ ...empty, armCm: 30 })).toBe(false);
  });
});

describe('periodStart', () => {
  it('counts today as the last day of the period', () => {
    expect(periodStart('weeks8', '2026-10-06')).toBe('2026-08-12');
    expect(periodStart('months3', '2026-10-06')).toBe('2026-07-08');
    expect(periodStart('all', '2026-10-06')).toBeNull();
  });
});

describe('weightGoalOf', () => {
  const goal = { decidedGoal: 'LOSE' as const, desiredChangeKg: 7, startWeightKg: 78, startedOn: '2026-08-18' };

  it('puts the target below the start to lose and above it to gain', () => {
    expect(weightGoalOf(goal)).toEqual({ startWeightKg: 78, targetWeightKg: 71, startedOn: '2026-08-18' });
    expect(weightGoalOf({ ...goal, decidedGoal: 'GAIN', desiredChangeKg: 3.5 })).toMatchObject({ targetWeightKg: 81.5 });
  });

  it('has none when maintaining (even if the patient asked to lose) or without a number of kg', () => {
    expect(weightGoalOf({ ...goal, decidedGoal: 'MAINTAIN' })).toBeNull();
    expect(weightGoalOf({ ...goal, desiredChangeKg: null })).toBeNull();
    expect(weightGoalOf(null)).toBeNull();
  });
});

describe('buildProgress', () => {
  const logs = [
    log('2026-06-01', { weightKg: 82, waistCm: 88 }),
    log('2026-08-20', { weightKg: 78, hipCm: 100 }),
    log('2026-09-15', { waistCm: 85, bodyFatPct: 29 }),
    log('2026-10-06', { weightKg: 76.4, waistCm: 84.6 }),
  ];
  const progress = buildProgress(logs, { currentWeightKg: 76.4, period: 'weeks8', today: '2026-10-06', goal: null });

  it('charts only the weigh-ins of the period, oldest first', () => {
    expect(progress.weights).toEqual([
      { date: '2026-08-20', weightKg: 78 },
      { date: '2026-10-06', weightKg: 76.4 },
    ]);
    expect(buildProgress(logs, { currentWeightKg: 76.4, period: 'all', today: '2026-10-06', goal: null }).weights).toHaveLength(3);
  });

  it('gives each measurement its latest value and its change since the first one, whatever the period', () => {
    expect(progress.measurements.waistCm).toEqual({ value: 84.6, date: '2026-10-06', change: -3.4 });
    expect(progress.measurements.hipCm).toEqual({ value: 100, date: '2026-08-20', change: null });
    expect(progress.measurements.chestCm).toBeNull();
  });
});
