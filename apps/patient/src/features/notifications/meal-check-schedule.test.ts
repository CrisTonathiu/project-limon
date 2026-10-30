import type { MealPlanDto, MealType, PlannedMealDto } from '@limon/types';
import { describe, expect, it } from 'vitest';
import { MAX_MEAL_CHECKS, mealCheckSchedule } from './meal-check-schedule';

const meal = (id: string, mealType: MealType, time: string, logged = false): PlannedMealDto => ({
  id,
  mealType,
  time,
  recipe: { id: `r-${id}`, title: `Receta ${id}`, totalMinutes: null },
  servings: 1,
  macros: null,
  favourite: false,
  log: logged ? { status: 'EATEN', note: null, loggedAt: '2026-10-05T08:10:00.000Z' } : null,
});

const day = (date: string, loggedIds: string[] = []) => ({
  date,
  totals: null,
  meals: (
    [
      ['b', 'BREAKFAST', '08:00'],
      ['s1', 'SNACK', '11:00'],
      ['l', 'LUNCH', '14:00'],
      ['s2', 'SNACK', '17:00'],
      ['d', 'DINNER', '20:00'],
    ] as const
  ).map(([id, type, time]) => meal(`${date}-${id}`, type, time, loggedIds.includes(`${date}-${id}`))),
});

const plan = (...days: ReturnType<typeof day>[]): MealPlanDto => ({ id: 'p', weekStart: '2026-10-05', days });
const at = (h: number, m = 0) => new Date(2026, 9, 5, h, m);
const time = (d: Date) => `${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;

describe('mealCheckSchedule', () => {
  it('fires 30 minutes after each meal’s time', () => {
    const checks = mealCheckSchedule(plan(day('2026-10-05')), at(6));
    expect(checks.map((c) => time(c.fireAt))).toEqual(['5 8:30', '5 11:30', '5 14:30', '5 17:30', '5 20:30']);
    expect(checks[0]).toMatchObject({ mealId: '2026-10-05-b', mealType: 'BREAKFAST', recipeTitle: 'Receta 2026-10-05-b' });
  });

  it('leaves out reminders already past and meals already answered', () => {
    const checks = mealCheckSchedule(plan(day('2026-10-05', ['2026-10-05-l']), day('2026-10-06')), at(11, 30));
    expect(checks.map((c) => c.mealId)).toEqual([
      '2026-10-05-s2',
      '2026-10-05-d',
      '2026-10-06-b',
      '2026-10-06-s1',
      '2026-10-06-l',
      '2026-10-06-s2',
      '2026-10-06-d',
    ]);
  });

  it('follows a meal time the patient changed', () => {
    const p = plan(day('2026-10-05'));
    p.days[0]!.meals[0] = { ...p.days[0]!.meals[0]!, time: '07:15' };
    expect(time(mealCheckSchedule(p, at(6))[0]!.fireAt)).toBe('5 7:45');
  });

  it('gives a meal without a recipe a null title', () => {
    const p = plan(day('2026-10-05'));
    p.days[0]!.meals[0] = { ...p.days[0]!.meals[0]!, recipe: null };
    expect(mealCheckSchedule(p, at(6))[0]!.recipeTitle).toBeNull();
  });

  it('keeps the soonest reminders under the cap', () => {
    const days = Array.from({ length: 12 }, (_, i) => day(`2026-10-${String(5 + i).padStart(2, '0')}`));
    const checks = mealCheckSchedule(plan(...days), at(6));
    expect(checks).toHaveLength(MAX_MEAL_CHECKS);
    expect(checks[0]!.mealId).toBe('2026-10-05-b');
  });
});
