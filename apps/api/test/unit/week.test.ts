import { describe, expect, it } from 'vitest';
import { isMonday, weekDates, weekStartOf } from '../../src/modules/meal-plans/week.js';

describe('plan weeks', () => {
  it('starts on the Monday of the current week in Mexico City', () => {
    expect(weekStartOf(new Date('2026-10-21T18:00:00Z'))).toBe('2026-10-19'); // Wednesday
    expect(weekStartOf(new Date('2026-10-19T12:00:00Z'))).toBe('2026-10-19'); // Monday
    expect(weekStartOf(new Date('2026-10-25T23:00:00Z'))).toBe('2026-10-19'); // Sunday 5 pm local
  });

  it('uses the local date, not UTC, around midnight', () => {
    // Monday 03:00 UTC is still Sunday evening in Mexico City (UTC−6).
    expect(weekStartOf(new Date('2026-10-26T03:00:00Z'))).toBe('2026-10-19');
    expect(weekStartOf(new Date('2026-10-26T07:00:00Z'))).toBe('2026-10-26');
  });

  it('checks for a real Monday', () => {
    expect(isMonday('2026-10-19')).toBe(true);
    expect(isMonday('2026-10-20')).toBe(false);
    expect(isMonday('2026-02-30')).toBe(false);
    expect(isMonday('19/10/2026')).toBe(false);
  });

  it('lists the 7 dates, across a month end', () => {
    expect(weekDates('2026-10-26')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  });
});
