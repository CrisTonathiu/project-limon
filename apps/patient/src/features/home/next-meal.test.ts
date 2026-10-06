import type { MealPlanDto, MealType, PlannedMealDto } from '@limon/types';
import { describe, expect, it } from 'vitest';
import { mealHours, nextMeal } from './next-meal';

const meal = (id: string, mealType: MealType, title: string | null = id): PlannedMealDto => ({
  id,
  mealType,
  recipe: title ? { id: `r-${id}`, title, totalMinutes: null } : null,
  servings: 1,
  macros: null,
  favourite: false,
});

const day = (date: string) => ({
  date,
  totals: null,
  meals: [meal(`${date}-b`, 'BREAKFAST'), meal(`${date}-s1`, 'SNACK'), meal(`${date}-l`, 'LUNCH'), meal(`${date}-s2`, 'SNACK'), meal(`${date}-d`, 'DINNER')],
});

const plan: MealPlanDto = { id: 'p', weekStart: '2026-10-05', days: [day('2026-10-05'), day('2026-10-06')] };
const at = (h: number, m = 0) => new Date(2026, 9, 5, h, m);

describe('mealHours', () => {
  it('puts snacks halfway between the meals around them', () => {
    expect(mealHours(day('x').meals)).toEqual([8, 11, 14, 17, 20]);
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

  it('skips meals without a recipe', () => {
    const p: MealPlanDto = { ...plan, days: [{ ...day('2026-10-05'), meals: [meal('l', 'LUNCH', null), meal('d', 'DINNER')] }] };
    expect(nextMeal(p, at(12))?.meal.id).toBe('d');
  });

  it('gives nothing when the plan has no more days', () => {
    expect(nextMeal(plan, new Date(2026, 9, 6, 23))).toBeNull();
  });
});
