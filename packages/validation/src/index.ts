import { ActivityLevel, Allergen, BiologicalSex, MealType } from '@limon/types';
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

export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().uuid().optional(),
});
