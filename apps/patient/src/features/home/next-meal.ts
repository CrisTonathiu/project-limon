import type { MealPlanDto, PlannedMealDto } from '@limon/types';
import { minutesOfDay } from '@limon/validation';
import { toDateOnly } from '../../i18n/format';

/** A meal still counts as next until this long after its time. */
const GRACE_HOURS = 1;

/** "14:30" → 14.5 */
export const hourOf = (time: string) => minutesOfDay(time) / 60;

export type NextMeal = { meal: PlannedMealDto & { recipe: NonNullable<PlannedMealDto['recipe']> }; tomorrow: boolean };

/** The first meal with a recipe that is still ahead today, or tomorrow's first once today's are past. */
export function nextMeal(plan: MealPlanDto, now: Date): NextMeal | null {
  const hour = now.getHours() + now.getMinutes() / 60;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const pick = (date: string, after: number) => {
    const day = plan.days.find((d) => d.date === date);
    if (!day) return null;
    const meal = day.meals.find((m) => m.recipe !== null && hourOf(m.time) + GRACE_HOURS > after);
    return (meal as NextMeal['meal'] | undefined) ?? null;
  };
  const today = pick(toDateOnly(now), hour);
  if (today) return { meal: today, tomorrow: false };
  const next = pick(toDateOnly(tomorrow), -Infinity);
  return next ? { meal: next, tomorrow: true } : null;
}
