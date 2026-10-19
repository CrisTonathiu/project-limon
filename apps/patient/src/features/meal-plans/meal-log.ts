import type { MealLogDto, MealLogStatus, MealPlanDto } from '@limon/types';
import { parseDateOnly, toDateOnly } from '../../i18n/format';

/**
 * Meal check-off rules on the phone. The API is the authority (it refuses the rest); these
 * only decide what the screens offer.
 */

/** Today and yesterday can be checked off. */
export function canLog(date: string, today: string): boolean {
  const yesterday = parseDateOnly(today);
  yesterday.setDate(yesterday.getDate() - 1);
  return date <= today && date >= toDateOnly(yesterday);
}

/** The plan with one meal's check-off replaced (null clears it), for optimistic updates. */
export function withLog(plan: MealPlanDto, mealId: string, log: MealLogDto | null): MealPlanDto {
  return {
    ...plan,
    days: plan.days.map((day) => ({
      ...day,
      meals: day.meals.map((m) => (m.id === mealId ? { ...m, log } : m)),
    })),
  };
}

/** An answer as the phone shows it before the API confirms it. */
export function draftLog(status: MealLogStatus, note: string | null, now: Date): MealLogDto {
  return {
    status,
    note: status === 'OTHER' ? note?.trim() || null : null,
    loggedAt: now.toISOString(),
  };
}
