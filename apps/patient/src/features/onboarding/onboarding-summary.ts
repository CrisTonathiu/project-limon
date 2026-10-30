import type { PatientProfileDto } from '@limon/types';
import { mealSlotTypes } from '@limon/validation';
import { formatGrams, formatKcal, formatMealTime } from '../../i18n/format';
import { t } from '../../i18n/es-MX';

export type OnboardingSummary = {
  target: { kcal: string; macros: string } | { hold: string };
  times: { meal: string; time: string }[];
};

/** The last onboarding page: the daily target the plan aims at, and the meal times just saved. */
export function onboardingSummary(profile: PatientProfileDto): OnboardingSummary {
  const target = profile.energyTarget;
  const types = mealSlotTypes(profile.mealsPerDay);
  return {
    target:
      target.status === 'READY'
        ? {
            kcal: formatKcal(target.targetKcal),
            macros: t.profile.target.macros(formatGrams(target.proteinG), formatGrams(target.carbsG), formatGrams(target.fatG)),
          }
        : { hold: t.profile.target.hold[target.reason] },
    times: profile.mealTimes.map((time, i) => ({ meal: t.recipes.mealTypes[types[i] ?? 'SNACK'], time: formatMealTime(time) })),
  };
}
