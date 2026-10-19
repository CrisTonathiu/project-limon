import type { MealLogStatus } from '@limon/types';
import { addDays, mondayOf } from './week.js';

/**
 * Meal check-off rules (docs/roadmap/mvp-2.md, Phase 1). Pure, so they're unit-tested directly
 * and a rule change needs no data fix: nothing here is stored.
 */

/** One meal slot of a plan day, with the patient's answer if any. */
export type SlotState = {
  /** YYYY-MM-DD */
  date: string;
  /** The slot has a recipe. Empty slots count for the streak but not for adherence. */
  planned: boolean;
  status: MealLogStatus | null;
};

/** How far back a meal can still be logged: today and yesterday. */
export const LOG_WINDOW_DAYS = 2;

/** Today or yesterday on the patient's calendar. */
export function canLog(date: string, today: string): boolean {
  return date <= today && date > addDays(today, -LOG_WINDOW_DAYS);
}

const SCORE: Record<MealLogStatus, number> = { EATEN: 1, OTHER: 0.5, SKIPPED: 0 };

/**
 * Adherence over the week so far: every planned meal of the past days (not answered counts 0),
 * plus today's planned meals already answered, so the ring doesn't drop every morning.
 */
export function weekAdherence(slots: SlotState[], today: string) {
  const counted = slots.filter((s) => s.planned && (s.date < today || (s.date === today && s.status !== null)));
  const score = counted.reduce((total, s) => total + (s.status ? SCORE[s.status] : 0), 0);
  return { score, counted: counted.length, adherence: counted.length ? score / counted.length : null };
}

/**
 * Days in a row, back from today, with every meal slot answered (in any state). Today and
 * yesterday can still be logged, so they add to the streak when complete but never break it.
 * One older incomplete day per Monday–Sunday week is forgiven. A day without a plan ends it.
 */
export function mealStreak(slots: SlotState[], today: string) {
  const days = new Map<string, { slots: number; answered: number }>();
  for (const s of slots) {
    const day = days.get(s.date) ?? { slots: 0, answered: 0 };
    day.slots++;
    if (s.status) day.answered++;
    days.set(s.date, day);
  }

  const forgiven = new Set<string>();
  let streak = 0;
  for (let date = today; ; date = addDays(date, -1)) {
    const day = days.get(date);
    if (!day) break;
    if (day.answered === day.slots) streak++;
    else if (canLog(date, today)) continue;
    else if (!forgiven.has(mondayOf(date))) forgiven.add(mondayOf(date));
    else break;
  }
  return { days: streak, graceUsed: forgiven.has(mondayOf(today)) };
}
