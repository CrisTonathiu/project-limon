import { ActivityLevel, Allergen, BiologicalSex, GoalIntention, GoalPace, MealType, ProgressPeriod, RecentWeightChange } from '@limon/types';
import { z } from 'zod';

/**
 * API-boundary schemas shared by API (enforcement), dashboard and patient app (UX).
 * Rule: request schemas NEVER accept tenantId, userId, role or subscription status —
 * those come from the server-side TenantContext. `.strict()` rejects them outright.
 */

const slug = z
  .string()
  .min(3)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, numbers and dashes');
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'hex color like #22AA66');
const personName = z.string().trim().min(1).max(100);

export const FoodSearchQuerySchema = z
  .object({
    q: z.string().trim().min(2).max(100),
    page: z.coerce.number().int().min(0).max(1000).default(0),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export type FoodSearchQuery = z.infer<typeof FoodSearchQuerySchema>;

/** FatSecret food ids are positive integers (sent as strings). */
export const FatSecretFoodIdParamSchema = z.object({ id: z.string().regex(/^\d{1,19}$/, 'FatSecret food id') }).strict();

/** Normalized to upper case, matching how codes are stored (see @limon/tenant generateInviteCode). */
export const InviteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4,16}(?:-[A-Z0-9]{4,16})?$/, 'invite code like ABCD-EFGH');

export const RegisterNutritionistSchema = z
  .object({
    email: z.string().email().max(254),
    firstName: personName,
    lastName: personName,
    businessName: z.string().trim().min(2).max(120),
    slug,
  })
  .strict();
export type RegisterNutritionistInput = z.infer<typeof RegisterNutritionistSchema>;

export const CreateTenantSchema = z
  .object({ name: z.string().trim().min(2).max(120), slug })
  .strict();
export type CreateTenantInput = z.infer<typeof CreateTenantSchema>;

export const UpdateTenantBrandingSchema = z
  .object({
    appName: z.string().trim().min(2).max(30).optional(),
    primaryColor: hexColor.optional(),
    secondaryColor: hexColor.nullable().optional(),
    supportEmail: z.string().email().nullable().optional(),
  })
  .strict();
export type UpdateTenantBrandingInput = z.infer<typeof UpdateTenantBrandingSchema>;

/**
 * Patient self-signup from a tenant's app.
 * Consent is captured explicitly: LFPDPPP treats health data as sensitive personal
 * data requiring express consent, tied to the exact document version shown.
 */
export const RegisterPatientSchema = z
  .object({
    email: z.string().email().max(254),
    firstName: personName,
    lastName: personName,
    dateOfBirth: z.string().date().optional(),
    /** The patient's own invite code. Required when the tenant is invite-only; optional otherwise. */
    inviteCode: InviteCodeSchema.optional(),
    privacyNoticeVersion: z.string().min(1).max(64),
    termsVersion: z.string().min(1).max(64),
    acceptPrivacyNotice: z.literal(true),
    acceptSensitiveDataProcessing: z.literal(true),
    acceptTerms: z.literal(true),
  })
  .strict();
export type RegisterPatientInput = z.infer<typeof RegisterPatientSchema>;

export const CreatePatientSchema = z
  .object({
    firstName: personName,
    lastName: personName,
    email: z.string().email().max(254).optional(),
    dateOfBirth: z.string().date().optional(),
  })
  .strict();
export type CreatePatientInput = z.infer<typeof CreatePatientSchema>;

/** Whole years between an ISO date (YYYY-MM-DD) and today. */
export function ageInYears(isoDate: string, today = new Date()): number {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  const beforeBirthday = today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d);
  return today.getFullYear() - y - (beforeBirthday ? 1 : 0);
}

/** Bounds of the profile questionnaire, shared with the app so it can check each step before the PUT. */
export const PATIENT_PROFILE_LIMITS = {
  minBirthDate: '1900-01-01',
  heightCm: { min: 100, max: 250 },
  weightKg: { min: 25, max: 350 },
  mealsPerDay: { min: 3, max: 5 },
  dislikedFoods: { maxItems: 30 },
} as const;
const L = PATIENT_PROFILE_LIMITS;

/**
 * The onboarding questionnaire, also sent whole when the patient edits their profile (PUT).
 * Minors and pregnancy are accepted here: the energy target, not the profile, applies those guardrails.
 */
export const PatientProfileSchema = z
  .object({
    sex: z.nativeEnum(BiologicalSex),
    dateOfBirth: z
      .string()
      .date()
      .refine((d) => d >= L.minBirthDate && ageInYears(d) >= 0, 'birth date must be in the past'),
    heightCm: z.number().int().min(L.heightCm.min).max(L.heightCm.max),
    weightKg: z.number().min(L.weightKg.min).max(L.weightKg.max).transform((kg) => Math.round(kg * 10) / 10),
    activityLevel: z.nativeEnum(ActivityLevel),
    mealsPerDay: z.number().int().min(L.mealsPerDay.min).max(L.mealsPerDay.max),
    pregnantOrBreastfeeding: z.boolean().default(false),
    allergies: z.array(z.nativeEnum(Allergen)).max(Object.keys(Allergen).length).default([]).transform((a) => [...new Set(a)]),
    /** Ids from the food catalog (GET /foods/catalog); the API checks they exist. */
    dislikedFoodIds: z.array(z.string().uuid()).max(L.dislikedFoods.maxItems).default([]).transform((ids) => [...new Set(ids)]),
  })
  .strict()
  .refine((p) => !(p.sex === BiologicalSex.MALE && p.pregnantOrBreastfeeding), {
    path: ['pregnantOrBreastfeeding'],
    message: 'only applies to sex FEMALE',
  });
export type PatientProfileInput = z.input<typeof PatientProfileSchema>;
export type PatientProfile = z.output<typeof PatientProfileSchema>;

/**
 * The platform's energy guardrails. Plans are generated without a nutritionist reviewing them,
 * so a clinic's own rules (GoalRulesSchema) may only be stricter than these, never looser.
 */
export const PLATFORM_GUARDRAILS = {
  /** Bumped whenever a value here changes; stored with every goal decision. */
  version: 1,
  minAge: 18,
  floorKcal: { [BiologicalSex.FEMALE]: 1200, [BiologicalSex.MALE]: 1500 } as Record<BiologicalSex, number>,
  /** Share of body weight that may be lost per week. */
  maxWeeklyLossShare: 0.01,
  /** Weight loss is refused below this BMI, and so is a desired weight under it. */
  minBmiToLose: 18.5,
  /** Paces a patient may pick when the clinic hasn't set its own. FAST is opt-in. */
  paces: { lose: [GoalPace.GENTLE, GoalPace.MODERATE], gain: [GoalPace.GENTLE, GoalPace.MODERATE] } as {
    lose: GoalPace[];
    gain: GoalPace[];
  },
} as const;
const P = PLATFORM_GUARDRAILS;

const paceList = z
  .array(z.nativeEnum(GoalPace))
  .min(1)
  .transform((paces) => Object.values(GoalPace).filter((p) => paces.includes(p)));

/**
 * A clinic's goal rules, written by its nutritionist at onboarding and loaded by our team
 * (`admin goal-rules`). Every limit is optional and falls back to the platform's; one that is
 * looser than the platform's is refused.
 */
export const GoalRulesSchema = z
  .object({
    paces: z.object({ lose: paceList, gain: paceList }).strict().optional(),
    minAge: z.number().int().min(P.minAge, `can't be under ${P.minAge}`).max(120).optional(),
    floorKcal: z
      .object({
        FEMALE: z.number().int().min(P.floorKcal.FEMALE, `can't be under ${P.floorKcal.FEMALE}`).max(4000).optional(),
        MALE: z.number().int().min(P.floorKcal.MALE, `can't be under ${P.floorKcal.MALE}`).max(4000).optional(),
      })
      .strict()
      .optional(),
    maxWeeklyLossShare: z.number().positive().max(P.maxWeeklyLossShare, `can't be over ${P.maxWeeklyLossShare}`).optional(),
    minBmiToLose: z.number().min(P.minBmiToLose, `can't be under ${P.minBmiToLose}`).max(40).optional(),
  })
  .strict();
export type GoalRules = z.output<typeof GoalRulesSchema>;

const WEIGHT_GOALS: GoalIntention[] = [GoalIntention.LOSE_WEIGHT, GoalIntention.GAIN_WEIGHT];

/**
 * PUT /patients/me/goal. The patient picks an intention and, to lose or gain, a pace; never
 * a calorie number. The API checks the pace against the clinic's rules and decides the target.
 */
export const SetGoalSchema = z
  .object({
    intention: z.nativeEnum(GoalIntention),
    pace: z.nativeEnum(GoalPace).optional(),
    /** How many kg they'd like to lose or gain. Only for those two intentions. */
    desiredChangeKg: z.number().min(0.5).max(150).transform((kg) => Math.round(kg * 10) / 10).optional(),
    otherText: z.string().trim().min(1).max(300).optional(),
    recentWeightChange: z.nativeEnum(RecentWeightChange),
  })
  .strict()
  .superRefine((g, ctx) => {
    const weight = WEIGHT_GOALS.includes(g.intention);
    if (weight && !g.pace) ctx.addIssue({ code: 'custom', path: ['pace'], message: 'required to lose or gain weight' });
    if (!weight && g.pace) ctx.addIssue({ code: 'custom', path: ['pace'], message: 'only to lose or gain weight' });
    if (!weight && g.desiredChangeKg !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['desiredChangeKg'], message: 'only to lose or gain weight' });
    }
    if (g.intention !== GoalIntention.OTHER && g.otherText !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['otherText'], message: 'only for OTHER' });
    }
  });
export type SetGoalInput = z.output<typeof SetGoalSchema>;

/** Bounds of weigh-ins and measurements, shared with the app's number pickers. */
export const BODY_LOG_LIMITS = {
  weightKg: PATIENT_PROFILE_LIMITS.weightKg,
  waistCm: { min: 30, max: 250 },
  hipCm: { min: 30, max: 250 },
  chestCm: { min: 30, max: 250 },
  armCm: { min: 10, max: 100 },
  thighCm: { min: 20, max: 150 },
  bodyFatPct: { min: 2, max: 75 },
  /** How far back a weigh-in can be logged. */
  minDate: '2000-01-01',
} as const;
const B = BODY_LOG_LIMITS;

/** null clears the value; leaving the field out keeps what the day already has. Rounded to 0.1. */
const bodyValue = (bounds: { min: number; max: number }) =>
  z
    .number()
    .min(bounds.min)
    .max(bounds.max)
    .transform((v) => Math.round(v * 10) / 10)
    .nullable()
    .optional();

/** PUT /patients/me/body-logs/:date: one day's weigh-in and measurements, merged into what that day has. */
export const BodyLogSchema = z
  .object({
    weightKg: bodyValue(B.weightKg),
    waistCm: bodyValue(B.waistCm),
    hipCm: bodyValue(B.hipCm),
    chestCm: bodyValue(B.chestCm),
    armCm: bodyValue(B.armCm),
    thighCm: bodyValue(B.thighCm),
    bodyFatPct: bodyValue(B.bodyFatPct),
  })
  .strict()
  .refine((log) => Object.values(log).some((v) => v !== undefined), 'nothing to log');
export type BodyLogInput = z.input<typeof BodyLogSchema>;
export type BodyLog = z.output<typeof BodyLogSchema>;

/** A day in the patient's calendar. The API checks it isn't in the future. */
export const IsoDateParamSchema = z
  .object({
    date: z
      .string()
      .date('date must be YYYY-MM-DD')
      .refine((d) => d >= B.minDate, `date can't be before ${B.minDate}`),
  })
  .strict();

/** GET /patients/me/progress */
export const ProgressQuerySchema = z
  .object({ period: z.nativeEnum(ProgressPeriod).default(ProgressPeriod.WEEKS_8) })
  .strict();

export const WATER_LIMITS = {
  /** One logged glass or bottle. */
  intakeMl: { min: 50, max: 2000 },
  /** The patient's own daily target, in steps of 50 ml. */
  targetMl: { min: 1000, max: 6000, step: 50 },
  /** Default target per kg of body weight. */
  defaultMlPerKg: 35,
  historyDays: { default: 7, max: 30 },
} as const;
const W = WATER_LIMITS;

/** POST /water/intakes */
export const WaterIntakeSchema = z
  .object({ amountMl: z.number().int().min(W.intakeMl.min).max(W.intakeMl.max) })
  .strict();
export type WaterIntakeInput = z.infer<typeof WaterIntakeSchema>;

/** PUT /water/target. null goes back to the default (35 ml per kg). */
export const WaterTargetSchema = z
  .object({
    targetMl: z
      .number()
      .int()
      .min(W.targetMl.min)
      .max(W.targetMl.max)
      .refine((ml) => ml % W.targetMl.step === 0, `targetMl must be a multiple of ${W.targetMl.step}`)
      .nullable(),
  })
  .strict();
export type WaterTargetInput = z.infer<typeof WaterTargetSchema>;

/** GET /water */
export const WaterQuerySchema = z
  .object({ days: z.coerce.number().int().min(1).max(W.historyDays.max).default(W.historyDays.default) })
  .strict();

/** Placeholders — shape will grow with the nutrition domain. */
export const CreateRecipeSchema = z
  .object({ title: z.string().trim().min(1).max(200), description: z.string().max(5000).optional() })
  .strict();
export type CreateRecipeInput = z.infer<typeof CreateRecipeSchema>;

export const CreateMealPlanSchema = z
  .object({
    patientId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    startsOn: z.string().date().optional(),
  })
  .strict();
export type CreateMealPlanInput = z.infer<typeof CreateMealPlanSchema>;

export const UuidParamSchema = z.object({ id: z.string().uuid() });

/** GET /recipes: optionally only the recipes that fit one meal. */
export const RecipeListQuerySchema = z.object({ mealType: z.nativeEnum(MealType).optional() }).strict();
export type RecipeListQuery = z.infer<typeof RecipeListQuerySchema>;

/** POST /meal-plans/current/days/:date/regenerate */
export const MealPlanDayParamSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
}).strict();
export type MealPlanDayParam = z.infer<typeof MealPlanDayParamSchema>;

/** PUT and DELETE /meal-plans/favourites/:recipeId */
export const MealPlanFavouriteParamSchema = z.object({ recipeId: z.string().uuid() }).strict();
export type MealPlanFavouriteParam = z.infer<typeof MealPlanFavouriteParamSchema>;

/** GET /meal-plans/current/meals/:mealId */
export const MealPlanMealParamSchema = z.object({ mealId: z.string().uuid() }).strict();
export type MealPlanMealParam = z.infer<typeof MealPlanMealParamSchema>;

/** GET …/ingredients/:ingredientId/swaps and PUT …/ingredients/:ingredientId/swap */
export const MealPlanIngredientParamSchema = z.object({ mealId: z.string().uuid(), ingredientId: z.string().uuid() }).strict();
export type MealPlanIngredientParam = z.infer<typeof MealPlanIngredientParamSchema>;

/** PUT …/swap: the food to eat instead. The recipe's own food undoes the swap. */
export const FoodSwapSchema = z.object({ foodId: z.string().uuid() }).strict();
export type FoodSwapInput = z.infer<typeof FoodSwapSchema>;

/** PUT /shopping-list/current/items/:foodId */
export const ShoppingListItemParamSchema = z.object({ foodId: z.string().uuid() }).strict();
export type ShoppingListItemParam = z.infer<typeof ShoppingListItemParamSchema>;

export const ShoppingListCheckSchema = z.object({ checked: z.boolean() }).strict();
export type ShoppingListCheckInput = z.infer<typeof ShoppingListCheckSchema>;

export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().uuid().optional(),
});
