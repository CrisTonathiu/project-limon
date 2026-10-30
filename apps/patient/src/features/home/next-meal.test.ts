import type { MealPlanDto, MealType, PlannedMealDto } from '@limon/types';
import { describe, expect, it } from 'vitest';
import { hourOf, nextMeal } from './next-meal';

const meal = (id: string, mealType: MealType, time: string, title: string | null = id): PlannedMealDto => ({
  id,
  mealType,
  time,
  recipe: title ? { id: `r-${id}`, title, totalMinutes: null } : null,
  servings: 1,
  macros: null,
  favourite: false, log: null,
});

const day = (date: string) => ({
  date,
  totals: null,
  meals: [
    meal(`${date}-b`, 'BREAKFAST', '08:00'),
    meal(`${date}-s1`, 'SNACK', '11:00'),
    meal(`${date}-l`, 'LUNCH', '14:00'),
    meal(`${date}-s2`, 'SNACK', '17:00'),
    meal(`${date}-d`, 'DINNER', '20:00'),
  ],
});

const plan: MealPlanDto = { id: 'p', weekStart: '2026-10-05', days: [day('2026-10-05'), day('2026-10-06')] };
const at = (h: number, m = 0) => new Date(2026, 9, 5, h, m);

describe('hourOf', () => {
  it('reads a meal time as hours of the day', () => {
    expect(hourOf('08:00')).toBe(8);
    expect(hourOf('14:30')).toBe(14.5);
  });
});

describe('nextMeal', () => {
  it('picks the next meal by the time of day', () => {
    expect(nextMeal(plan, at(6))?.meal.id).toBe('2026-10-05-b');
    expect(nextMeal(plan, at(12))?.meal.id).toBe('2026-10-05-l');
    expect(nextMeal(plan, at(14, 30))?.meal.id).toBe('2026-10-05-l');
    expect(nextMeal(plan, at(15, 30))?.meal.id).toBe('2026-10-05-s2');
  });

  it("moves on to tomorrow's first meal once dinner has passed", () => {
    expect(nextMeal(plan, at(22))).toMatchObject({ meal: { id: '2026-10-06-b' }, tomorrow: true });
  });

  it('follows the patient’s own meal times', () => {
    const late: MealPlanDto = { ...plan, days: [{ ...day('2026-10-05'), meals: [meal('b', 'BREAKFAST', '10:30'), meal('l', 'LUNCH', '16:00')] }] };
    expect(nextMeal(late, at(11))?.meal.id).toBe('b');
    expect(nextMeal(late, at(12))?.meal.id).toBe('l');
  });

  it('skips meals without a recipe', () => {
    const p: MealPlanDto = { ...plan, days: [{ ...day('2026-10-05'), meals: [meal('l', 'LUNCH', '14:00', null), meal('d', 'DINNER', '20:00')] }] };
    expect(nextMeal(p, at(12))?.meal.id).toBe('d');
  });

  it('gives nothing when the plan has no more days', () => {
    expect(nextMeal(plan, new Date(2026, 9, 6, 23))).toBeNull();
  });
});
