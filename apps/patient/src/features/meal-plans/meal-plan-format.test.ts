import { describe, expect, it } from 'vitest';
import type { MealPlanDto, PlannedMealDto } from '@limon/types';
import { canRegenerate, dayChip, formatPortion, initialDayIndex, withFavourite } from './meal-plan-format';

const week = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'];

describe('initialDayIndex', () => {
  it('opens on today', () => expect(initialDayIndex(week, '2026-10-22')).toBe(3));
  it('opens on Monday when today is outside the week', () => expect(initialDayIndex(week, '2026-10-27')).toBe(0));
});

describe('canRegenerate', () => {
  it('allows today and later days only', () => {
    expect(canRegenerate('2026-10-22', '2026-10-22')).toBe(true);
    expect(canRegenerate('2026-10-25', '2026-10-22')).toBe(true);
    expect(canRegenerate('2026-10-21', '2026-10-22')).toBe(false);
  });
});

describe('formatPortion', () => {
  it.each([
    [1, '1 porción'],
    [0.5, '½ porción'],
    [1.25, '1 ¼ porciones'],
    [1.15, '1.15 porciones'],
    [2, '2 porciones'],
  ])('%s → %s', (servings, text) => expect(formatPortion(servings)).toBe(text));
});

describe('dayChip', () => {
  it('gives the short weekday and the day of the month', () => {
    expect(dayChip('2026-10-19')).toEqual({ weekday: 'lun', day: '19' });
  });
});

describe('withFavourite', () => {
  const meal = (id: string, recipeId: string | null): PlannedMealDto => ({
    id, mealType: 'LUNCH', recipe: recipeId ? { id: recipeId, title: recipeId, totalMinutes: null } : null, servings: recipeId ? 1 : null, macros: null, favourite: false,
  });
  const plan: MealPlanDto = {
    id: 'plan', weekStart: week[0]!,
    days: [
      { date: week[0]!, totals: null, meals: [meal('a', 'tacos'), meal('b', 'sopa')] },
      { date: week[1]!, totals: null, meals: [meal('c', 'tacos'), meal('d', null)] },
    ],
  };

  it('marks every meal with that recipe and leaves the others', () => {
    const favourites = withFavourite(plan, 'tacos', true).days.flatMap((d) => d.meals.map((m) => [m.id, m.favourite]));
    expect(favourites).toEqual([['a', true], ['b', false], ['c', true], ['d', false]]);
  });

  it('unmarks them again', () => {
    const back = withFavourite(withFavourite(plan, 'tacos', true), 'tacos', false);
    expect(back).toEqual(plan);
  });
});
