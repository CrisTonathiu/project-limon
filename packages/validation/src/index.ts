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

export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().uuid().optional(),
});
