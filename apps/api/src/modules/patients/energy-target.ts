import { ActivityLevel, BiologicalSex, EnergyTargetHoldReason, type EnergyTargetDto } from '@limon/types';
import { ageInYears } from '@limon/validation';

/**
 * Daily energy and macro target. Pure: no I/O, so it is unit-tested directly.
 *
 *   BMR (Mifflin-St Jeor) × activity factor = maintenance
 *   maintenance ± the goal's deficit or surplus, clamped by the guardrails = target
 *
 * The guardrails are platform constants on purpose: plans are generated without a
 * nutritionist reviewing them in the MVP, so a tenant can't loosen them.
 */

/** Until the goal tracker (week 6) stores one, every patient maintains. */
export const WeightGoal = { LOSE: 'LOSE', MAINTAIN: 'MAINTAIN', GAIN: 'GAIN' } as const;
export type WeightGoal = (typeof WeightGoal)[keyof typeof WeightGoal];

/** For gains these are lean gain / steady / bulk. */
export const GoalPace = { GENTLE: 'GENTLE', MODERATE: 'MODERATE', FAST: 'FAST' } as const;
export type GoalPace = (typeof GoalPace)[keyof typeof GoalPace];

export type Goal = { type: typeof WeightGoal.MAINTAIN } | { type: typeof WeightGoal.LOSE | typeof WeightGoal.GAIN; pace: GoalPace };

export type EnergyInput = {
  sex: BiologicalSex;
  dateOfBirth: string;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  pregnantOrBreastfeeding: boolean;
};

export const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  [ActivityLevel.SEDENTARY]: 1.2,
  [ActivityLevel.LIGHT]: 1.375,
  [ActivityLevel.MODERATE]: 1.55,
  [ActivityLevel.ACTIVE]: 1.725,
  [ActivityLevel.VERY_ACTIVE]: 1.9,
};

export const ENERGY_GUARDRAILS = {
  minAge: 18,
  floorKcal: { [BiologicalSex.FEMALE]: 1200, [BiologicalSex.MALE]: 1500 } as Record<BiologicalSex, number>,
  /** Share of body weight that may be lost per week. */
  maxWeeklyLossShare: 0.01,
  /** Weight loss is refused below this BMI. */
  minBmiToLose: 18.5,
} as const;

/** Share of maintenance removed (LOSE) or added (GAIN). FAST gain (bulk, +20%) is the surplus cap. */
const DEFICIT: Record<GoalPace, number> = { GENTLE: 0.1, MODERATE: 0.2, FAST: 0.25 };
const SURPLUS: Record<GoalPace, number> = { GENTLE: 0.1, MODERATE: 0.15, FAST: 0.2 };

/** Energy in 1 kg of body weight change, used to turn the weekly loss cap into a daily deficit. */
const KCAL_PER_KG = 7700;

/** Protein per kg of body weight (more when losing or gaining, to keep or build muscle), kept within a share of the kcal. */
const PROTEIN_G_PER_KG: Record<WeightGoal, number> = { MAINTAIN: 1.2, LOSE: 1.6, GAIN: 1.6 };
const PROTEIN_SHARE = { min: 0.15, max: 0.3 };
const FAT_SHARE = 0.3;
const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 };

const roundTo10 = (kcal: number) => Math.round(kcal / 10) * 10;

/** Mifflin-St Jeor (1990). */
export function bmrKcal(p: Pick<EnergyInput, 'sex' | 'weightKg' | 'heightCm'>, age: number): number {
  return 10 * p.weightKg + 6.25 * p.heightCm - 5 * age + (p.sex === BiologicalSex.MALE ? 5 : -161);
}

export function energyTarget(p: EnergyInput, goal: Goal = { type: WeightGoal.MAINTAIN }, today = new Date()): EnergyTargetDto {
  const G = ENERGY_GUARDRAILS;
  const hold = (reason: EnergyTargetHoldReason): EnergyTargetDto => ({ status: 'CONSULT_NUTRITIONIST', reason });

  const age = ageInYears(p.dateOfBirth, today);
  // Mifflin-St Jeor isn't valid for children, and pregnancy changes the needs: a professional decides.
  if (age < G.minAge) return hold(EnergyTargetHoldReason.MINOR);
  if (p.pregnantOrBreastfeeding) return hold(EnergyTargetHoldReason.PREGNANT_OR_BREASTFEEDING);
  const bmi = p.weightKg / (p.heightCm / 100) ** 2;
  if (goal.type === WeightGoal.LOSE && bmi < G.minBmiToLose) return hold(EnergyTargetHoldReason.UNDERWEIGHT);

  const bmr = bmrKcal(p, age);
  const maintenance = bmr * ACTIVITY_FACTOR[p.activityLevel];
  const floor = G.floorKcal[p.sex];
  if (maintenance < floor) return hold(EnergyTargetHoldReason.BELOW_FLOOR);

  let target = maintenance;
  if (goal.type === WeightGoal.LOSE) {
    const maxDailyDeficit = (p.weightKg * G.maxWeeklyLossShare * KCAL_PER_KG) / 7;
    target = Math.max(maintenance - Math.min(maintenance * DEFICIT[goal.pace], maxDailyDeficit), floor);
  } else if (goal.type === WeightGoal.GAIN) {
    target = maintenance * (1 + SURPLUS[goal.pace]);
  }
  const targetKcal = roundTo10(target);

  const proteinKcal = Math.min(
    Math.max(p.weightKg * PROTEIN_G_PER_KG[goal.type] * KCAL_PER_G.protein, targetKcal * PROTEIN_SHARE.min),
    targetKcal * PROTEIN_SHARE.max,
  );
  const proteinG = Math.round(proteinKcal / KCAL_PER_G.protein);
  const fatG = Math.round((targetKcal * FAT_SHARE) / KCAL_PER_G.fat);
  return {
    status: 'READY',
    bmrKcal: roundTo10(bmr),
    maintenanceKcal: roundTo10(maintenance),
    targetKcal,
    proteinG,
    // Carbs take the rest, from the rounded grams, so the macros add up to the target.
    carbsG: Math.round((targetKcal - proteinG * KCAL_PER_G.protein - fatG * KCAL_PER_G.fat) / KCAL_PER_G.carbs),
    fatG,
  };
}
