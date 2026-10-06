import type { MealPlanDto, MealType, PlannedMealDto } from '@limon/types';
import { toDateOnly } from '../../i18n/format';

/** Usual hour of each main meal in Mexico; the plan has no times of its own. */
const MAIN_HOURS: Partial<Record<MealType, number>> = { BREAKFAST: 8, LUNCH: 14, DINNER: 20 };
/** A meal still counts as next until this long after its usual hour. */
const GRACE_HOURS = 1;

/**
 * The usual hour of each of a day's meals, in plan order. A snack sits halfway between the
 * meals around it (11:00 between breakfast and lunch, 17:00 between lunch and dinner).
 */
export function mealHours(meals: Pick<PlannedMealDto, 'mealType'>[]): number[] {
  const fixed = meals.map((m) => MAIN_HOURS[m.mealType]);
  return fixed.map((hour, i) => {
    if (hour !== undefined) return hour;
    const before = fixed.slice(0, i).reverse().find((h) => h !== undefined) ?? 5;
    const after = fixed.slice(i + 1).find((h) => h !== undefined) ?? 23;
    return (before + after) / 2;
  });
}

export type NextMeal = { meal: PlannedMealDto & { recipe: NonNullable<PlannedMealDto['recipe']> }; tomorrow: boolean };

/** The first meal with a recipe that is still ahead today, or tomorrow's first once today's are past. */
export function nextMeal(plan: MealPlanDto, now: Date): NextMeal | null {
  const hour = now.getHours() + now.getMinutes() / 60;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const pick = (date: string, after: number) => {
    const day = plan.days.find((d) => d.date === date);
    if (!day) return null;
    const hours = mealHours(day.meals);
    const meal = day.meals.find((m, i) => m.recipe !== null && hours[i]! + GRACE_HOURS > after);
    return (meal as NextMeal['meal'] | undefined) ?? null;
  };
  const today = pick(toDateOnly(now), hour);
  if (today) return { meal: today, tomorrow: false };
  const next = pick(toDateOnly(tomorrow), -Infinity);
  return next ? { meal: next, tomorrow: true } : null;
}
