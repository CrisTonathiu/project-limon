import { MealType } from '@limon/types';

/**
 * How the daily target is shared across the day's meals, by the patient's meals per day
 * (3–5, PATIENT_PROFILE_LIMITS). Pure, like the energy target.
 *
 * Slots are in the order they're eaten; snacks sit between the main meals. Protein is
 * split with the same shares as the kcal, so every meal carries some.
 */
export type MealSlot = { mealType: MealType; share: number };

const { BREAKFAST, LUNCH, DINNER, SNACK } = MealType;

export const MEAL_SPLITS: Record<number, readonly MealSlot[]> = {
  3: [
    { mealType: BREAKFAST, share: 0.3 },
    { mealType: LUNCH, share: 0.4 },
    { mealType: DINNER, share: 0.3 },
  ],
  4: [
    { mealType: BREAKFAST, share: 0.25 },
    { mealType: LUNCH, share: 0.35 },
    { mealType: SNACK, share: 0.1 },
    { mealType: DINNER, share: 0.3 },
  ],
  5: [
    { mealType: BREAKFAST, share: 0.25 },
    { mealType: SNACK, share: 0.1 },
    { mealType: LUNCH, share: 0.3 },
    { mealType: SNACK, share: 0.1 },
    { mealType: DINNER, share: 0.25 },
  ],
};

export type SlotTarget = { mealType: MealType; kcal: number; proteinG: number };

export function splitDailyTarget(target: { kcal: number; proteinG: number }, mealsPerDay: number): SlotTarget[] {
  const slots = MEAL_SPLITS[mealsPerDay];
  if (!slots) throw new RangeError(`No meal split for ${mealsPerDay} meals per day`);
  return slots.map(({ mealType, share }) => ({ mealType, kcal: target.kcal * share, proteinG: target.proteinG * share }));
}
