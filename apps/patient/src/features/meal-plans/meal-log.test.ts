import type { MealPlanDto } from '@limon/types';
import { describe, expect, it } from 'vitest';
import { canLog, draftLog, withLog } from './meal-log';

describe('canLog', () => {
  it('allows today and yesterday, across a month end', () => {
    expect(canLog('2026-11-01', '2026-11-01')).toBe(true);
    expect(canLog('2026-10-31', '2026-11-01')).toBe(true);
    expect(canLog('2026-10-30', '2026-11-01')).toBe(false);
    expect(canLog('2026-11-02', '2026-11-01')).toBe(false);
  });
});

describe('withLog', () => {
  const meal = (id: string) => ({
    id,
    mealType: 'LUNCH' as const,
    recipe: null,
    servings: null,
    macros: null,
    favourite: false,
    log: null,
  });
  const plan: MealPlanDto = {
    id: 'p',
    weekStart: '2026-10-19',
    days: [{ date: '2026-10-19', totals: null, meals: [meal('a'), meal('b')] }],
  };

  it('sets and clears one meal only', () => {
    const log = draftLog('EATEN', null, new Date('2026-10-19T15:00:00Z'));
    const logged = withLog(plan, 'a', log);
    expect(logged.days[0]!.meals.map((m) => m.log)).toEqual([log, null]);
    expect(withLog(logged, 'a', null)).toEqual(plan);
  });
});

describe('draftLog', () => {
  it('keeps a trimmed note for OTHER only', () => {
    const now = new Date('2026-10-19T15:00:00Z');
    expect(draftLog('OTHER', '  tacos ', now)).toEqual({
      status: 'OTHER',
      note: 'tacos',
      loggedAt: now.toISOString(),
    });
    expect(draftLog('OTHER', '  ', now).note).toBeNull();
    expect(draftLog('EATEN', 'rico', now).note).toBeNull();
  });
});
