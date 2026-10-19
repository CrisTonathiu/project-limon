import type { MealLogStatus } from '@limon/types';
import { describe, expect, it } from 'vitest';
import { canLog, mealStreak, weekAdherence, type SlotState } from '../../src/modules/meal-plans/meal-log-stats.js';
import { addDays, mondayOf } from '../../src/modules/meal-plans/week.js';

// Thursday. Its week starts Monday 2026-10-19.
const today = '2026-10-22';

/** A day of 3 planned slots with these answers (null = not answered). */
const day = (date: string, ...statuses: (MealLogStatus | null)[]): SlotState[] => statuses.map((status) => ({ date, planned: true, status }));
const full = (date: string) => day(date, 'EATEN', 'SKIPPED', 'OTHER');
const missed = (date: string) => day(date, 'EATEN', null, null);

describe('week helpers', () => {
  it('moves days and finds the Monday', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-10-19', -1)).toBe('2026-10-18');
    expect(mondayOf('2026-10-25')).toBe('2026-10-19'); // Sunday
    expect(mondayOf('2026-10-19')).toBe('2026-10-19');
  });
});

describe('canLog', () => {
  it('allows today and yesterday only', () => {
    expect(canLog(today, today)).toBe(true);
    expect(canLog('2026-10-21', today)).toBe(true);
    expect(canLog('2026-10-20', today)).toBe(false);
    expect(canLog('2026-10-23', today)).toBe(false);
  });

  it('reaches back into last week on a Monday', () => {
    expect(canLog('2026-10-25', '2026-10-26')).toBe(true);
  });
});

describe('weekAdherence', () => {
  it('counts eaten as 1, something else as 0.5, and unanswered past meals as 0', () => {
    const slots = [...day('2026-10-19', 'EATEN', 'OTHER', 'SKIPPED'), ...day('2026-10-20', 'EATEN', null, null)];
    expect(weekAdherence(slots, today)).toEqual({ score: 2.5, counted: 6, adherence: 2.5 / 6 });
  });

  it("counts only today's answered meals, so the ring doesn't drop in the morning", () => {
    const slots = day(today, 'EATEN', null, null);
    expect(weekAdherence(slots, today)).toEqual({ score: 1, counted: 1, adherence: 1 });
  });

  it('leaves out slots with no recipe', () => {
    const slots: SlotState[] = [{ date: '2026-10-19', planned: false, status: 'OTHER' }, ...day('2026-10-19', 'EATEN')];
    expect(weekAdherence(slots, today).counted).toBe(1);
  });

  it('is null before anything counts', () => {
    expect(weekAdherence(day(today, null, null), today).adherence).toBeNull();
  });
});

describe('mealStreak', () => {
  it('counts days with every meal answered, in any state', () => {
    const slots = [...full('2026-10-19'), ...full('2026-10-20'), ...full('2026-10-21'), ...full(today)];
    expect(mealStreak(slots, today)).toEqual({ days: 4, graceUsed: false });
  });

  it("doesn't break on today or yesterday, which can still be logged", () => {
    const slots = [...full('2026-10-19'), ...full('2026-10-20'), ...missed('2026-10-21'), ...missed(today)];
    expect(mealStreak(slots, today)).toEqual({ days: 2, graceUsed: false });
  });

  it('forgives one missed day a week', () => {
    const slots = [...full('2026-10-19'), ...missed('2026-10-20'), ...full('2026-10-21'), ...full(today)];
    expect(mealStreak(slots, today)).toEqual({ days: 3, graceUsed: true });
  });

  it('breaks on the second missed day of the same week', () => {
    const slots = [...missed('2026-10-19'), ...missed('2026-10-20'), ...full('2026-10-21'), ...full(today)];
    expect(mealStreak(slots, today)).toEqual({ days: 2, graceUsed: true });
  });

  it('gives each week its own forgiven day', () => {
    // Last week: Sat missed (forgiven for that week); this week: Tue missed (forgiven for this week).
    const slots = [
      ...full('2026-10-16'), ...missed('2026-10-17'), ...full('2026-10-18'),
      ...full('2026-10-19'), ...missed('2026-10-20'), ...full('2026-10-21'), ...full(today),
    ];
    expect(mealStreak(slots, today)).toEqual({ days: 5, graceUsed: true });
  });

  it('ends where the plans start', () => {
    expect(mealStreak([...full('2026-10-21'), ...full(today)], today).days).toBe(2);
    expect(mealStreak([], today)).toEqual({ days: 0, graceUsed: false });
  });

  it('counts an empty slot only when it was answered', () => {
    const slots: SlotState[] = [...day('2026-10-20', 'EATEN'), { date: '2026-10-20', planned: false, status: null }, ...full('2026-10-21'), ...full(today)];
    // Tuesday's empty slot wasn't answered, so Tuesday is incomplete (forgiven); Monday has no plan.
    expect(mealStreak(slots, today)).toEqual({ days: 2, graceUsed: true });
  });
});
