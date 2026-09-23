/**
 * Platform-wide domain enums and DTO shapes.
 * These are the contract between API, dashboard, patient app and workers.
 * Keep in sync with packages/database/prisma/schema.prisma enums
 * (a unit test in @limon/database asserts parity).
 */

export const UserRole = {
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  NUTRITIONIST: 'NUTRITIONIST',
  PATIENT: 'PATIENT',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

/** Tenant (business) lifecycle. Independent from TenantAppStatus. */
export const TenantStatus = {
  TRIAL: 'TRIAL',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  CANCELING: 'CANCELING',
  SUSPENDED: 'SUSPENDED',
  DELETION_PENDING: 'DELETION_PENDING',
  DELETED: 'DELETED',
} as const;
export type TenantStatus = (typeof TenantStatus)[keyof typeof TenantStatus];

/** Store application lifecycle. Independent from TenantStatus. */
export const TenantAppStatus = {
  DRAFT: 'DRAFT',
  BUILDING: 'BUILDING',
  SUBMITTED: 'SUBMITTED',
  PUBLISHED: 'PUBLISHED',
  DISABLED: 'DISABLED',
  REMOVED: 'REMOVED',
} as const;
export type TenantAppStatus = (typeof TenantAppStatus)[keyof typeof TenantAppStatus];

export const AppPlatform = { IOS: 'IOS', ANDROID: 'ANDROID' } as const;
export type AppPlatform = (typeof AppPlatform)[keyof typeof AppPlatform];

export const DatabaseMode = { SHARED: 'SHARED', DEDICATED: 'DEDICATED' } as const;
export type DatabaseMode = (typeof DatabaseMode)[keyof typeof DatabaseMode];

export const PlatformSubscriptionStatus = {
  NONE: 'NONE',
  TRIALING: 'TRIALING',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  CANCELED: 'CANCELED',
  UNPAID: 'UNPAID',
} as const;
export type PlatformSubscriptionStatus =
  (typeof PlatformSubscriptionStatus)[keyof typeof PlatformSubscriptionStatus];

/** Runtime (server-delivered) branding. Can change without a store release. */
export type TenantAppConfig = {
  tenantId: string;
  appName: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor?: string | null;
  supportEmail?: string | null;
};

/** Stable error codes. Clients switch on `code`, never on `message`. */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  TENANT_NOT_FOUND: 'TENANT_NOT_FOUND',
  TENANT_SUSPENDED: 'TENANT_SUSPENDED',
  TENANT_MISMATCH: 'TENANT_MISMATCH',
  SUBSCRIPTION_REQUIRED: 'SUBSCRIPTION_REQUIRED',
  APP_NOT_RECOGNIZED: 'APP_NOT_RECOGNIZED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export type ApiErrorBody = { error: { code: ErrorCode; message: string; requestId?: string } };

export const PatientSubscriptionStatus = {
  PENDING: 'PENDING',
  TRIALING: 'TRIALING',
  ACTIVE: 'ACTIVE',
  GRACE_PERIOD: 'GRACE_PERIOD',
  PAST_DUE: 'PAST_DUE',
  CANCELED: 'CANCELED',
  EXPIRED: 'EXPIRED',
  REFUNDED: 'REFUNDED',
} as const;
export type PatientSubscriptionStatus =
  (typeof PatientSubscriptionStatus)[keyof typeof PatientSubscriptionStatus];

export const PaymentProvider = {
  APPLE_APP_STORE: 'APPLE_APP_STORE',
  GOOGLE_PLAY: 'GOOGLE_PLAY',
  STRIPE: 'STRIPE',
} as const;
export type PaymentProvider = (typeof PaymentProvider)[keyof typeof PaymentProvider];

export const ConsentKind = {
  PRIVACY_NOTICE: 'PRIVACY_NOTICE',
  SENSITIVE_DATA: 'SENSITIVE_DATA',
  TERMS_OF_SERVICE: 'TERMS_OF_SERVICE',
} as const;
export type ConsentKind = (typeof ConsentKind)[keyof typeof ConsentKind];

/** Does this patient currently have paid access? Derived server-side from subscriptions. */
export type PatientEntitlement = {
  active: boolean;
  status: PatientSubscriptionStatus | null;
  currentPeriodEnd: string | null;
};

export type MeResponse = {
  user: { id: string; email: string; role: UserRole };
  tenant: { id: string; name: string; slug: string; status: TenantStatus } | null;
  /** Present for PATIENT users only. */
  entitlement?: PatientEntitlement;
};

export type RegisterPatientResponse = { userId: string; patientId: string; tenantId: string };

export type RegisterNutritionistResponse = {
  userId: string;
  tenantId: string;
  nutritionistId: string;
  tenantAppIds: string[];
};

export type PatientDto = {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  createdAt: string;
};
