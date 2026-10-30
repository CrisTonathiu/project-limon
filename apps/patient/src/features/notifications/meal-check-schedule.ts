import type { MealPlanDto, MealType } from '@limon/types';
import { parseDateOnly } from '../../i18n/format';
import { minutesOfDay } from '@limon/validation';

/** "¿Comiste tu desayuno?" fires this long after the meal's time. */
export const MEAL_CHECK_DELAY_MINUTES = 30;
/** iOS keeps at most 64 pending notifications per app; stay under it with room for others. */
export const MAX_MEAL_CHECKS = 48;

export type MealCheck = {
  mealId: string;
  mealType: MealType;
  /** The recipe's title, for the meal detail's header; null when the meal has no recipe. */
  recipeTitle: string | null;
  fireAt: Date;
};

/**
 * One "did you eat?" reminder per meal of the plan that is still unanswered and whose reminder
 * time is ahead, soonest first. Each meal's time comes from the patient's profile.
 */
export function mealCheckSchedule(plan: MealPlanDto, now: Date): MealCheck[] {
  const checks = plan.days.flatMap((day) => {
    const midnight = parseDateOnly(day.date);
    return day.meals.flatMap((meal): MealCheck[] => {
      if (meal.log) return [];
      const fireAt = new Date(midnight);
      fireAt.setMinutes(minutesOfDay(meal.time) + MEAL_CHECK_DELAY_MINUTES);
      if (fireAt <= now) return [];
      return [{ mealId: meal.id, mealType: meal.mealType, recipeTitle: meal.recipe?.title ?? null, fireAt }];
    });
  });
  return checks.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime()).slice(0, MAX_MEAL_CHECKS);
}
