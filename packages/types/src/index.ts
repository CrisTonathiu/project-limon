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
  /** Admission mode: true when the tenant is invite-only, so sign-up needs the patient's invite code. */
  requiresInviteCode: boolean;
  appName: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor?: string | null;
  supportEmail?: string | null;
};

/**
 * Per-tenant feature flags (tenant_features.feature_key). A missing row means off.
 * Modules and paid add-ons are switched on per nutritionist by the platform team.
 */
export const FeatureKey = {
  /** Admission: off = open sign-up; on = sign-up needs a per-patient invite code. */
  INVITE_ONLY: 'invite_only',
  RECIPES: 'recipes',
  MEAL_PLAN: 'meal_plan',
  FOOD_SWAPS: 'food_swaps',
  SHOPPING_LIST: 'shopping_list',
  WATER_TRACKER: 'water_tracker',
  GOAL_TRACKER: 'goal_tracker',
  /** Paid add-on after the MVP; off everywhere until then. */
  AI_ASSISTANT: 'ai_assistant',
} as const;
export type FeatureKey = (typeof FeatureKey)[keyof typeof FeatureKey];

/** A feature only takes effect when every feature it depends on is enabled too. */
export const FEATURE_DEPENDENCIES: Partial<Record<FeatureKey, readonly FeatureKey[]>> = {
  [FeatureKey.SHOPPING_LIST]: [FeatureKey.MEAL_PLAN],
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
  INVITE_CODE_INVALID: 'INVITE_CODE_INVALID',
  /** The module is switched off for this tenant (tenant_features). */
  FEATURE_DISABLED: 'FEATURE_DISABLED',
  /** The nutrition data provider (FatSecret) is not configured, unreachable or refused the request. */
  NUTRITION_PROVIDER_UNAVAILABLE: 'NUTRITION_PROVIDER_UNAVAILABLE',
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
  /** The tenant's effective feature flags (dependencies applied). The app hides everything else. */
  features: FeatureKey[];
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

/** Biological sex, as used by the energy equations (Mifflin-St Jeor). */
export const BiologicalSex = { FEMALE: 'FEMALE', MALE: 'MALE' } as const;
export type BiologicalSex = (typeof BiologicalSex)[keyof typeof BiologicalSex];

export const ActivityLevel = {
  SEDENTARY: 'SEDENTARY',
  LIGHT: 'LIGHT',
  MODERATE: 'MODERATE',
  ACTIVE: 'ACTIVE',
  VERY_ACTIVE: 'VERY_ACTIVE',
} as const;
export type ActivityLevel = (typeof ActivityLevel)[keyof typeof ActivityLevel];

/**
 * Allergens a patient can declare (patient_profiles.allergies). Based on the allergens
 * NOM-051 requires on Mexican labels, so they can be matched against recipe ingredients.
 * Stored as text: adding a key needs no migration.
 */
export const Allergen = {
  GLUTEN: 'gluten',
  CRUSTACEANS: 'crustaceans',
  EGGS: 'eggs',
  FISH: 'fish',
  PEANUTS: 'peanuts',
  SOY: 'soy',
  MILK: 'milk',
  TREE_NUTS: 'tree_nuts',
  SULFITES: 'sulfites',
} as const;
export type Allergen = (typeof Allergen)[keyof typeof Allergen];

/** Meal slots a recipe can fill. */
export const MealType = { BREAKFAST: 'BREAKFAST', LUNCH: 'LUNCH', DINNER: 'DINNER', SNACK: 'SNACK' } as const;
export type MealType = (typeof MealType)[keyof typeof MealType];

/**
 * Food groups of the Sistema Mexicano de Alimentos Equivalentes (SMAE), 5th ed. v2.0.
 * Food swaps stay within one group. The Spanish names are in the Prisma schema.
 */
export const SmaeGroup = {
  VEGETABLES: 'VEGETABLES',
  FRUITS: 'FRUITS',
  CEREALS_FAT_FREE: 'CEREALS_FAT_FREE',
  CEREALS_WITH_FAT: 'CEREALS_WITH_FAT',
  LEGUMES: 'LEGUMES',
  ANIMAL_VERY_LOW_FAT: 'ANIMAL_VERY_LOW_FAT',
  ANIMAL_LOW_FAT: 'ANIMAL_LOW_FAT',
  ANIMAL_MODERATE_FAT: 'ANIMAL_MODERATE_FAT',
  ANIMAL_HIGH_FAT: 'ANIMAL_HIGH_FAT',
  MILK_SKIM: 'MILK_SKIM',
  MILK_SEMI_SKIM: 'MILK_SEMI_SKIM',
  MILK_WHOLE: 'MILK_WHOLE',
  MILK_WITH_SUGAR: 'MILK_WITH_SUGAR',
  FATS_WITHOUT_PROTEIN: 'FATS_WITHOUT_PROTEIN',
  FATS_WITH_PROTEIN: 'FATS_WITH_PROTEIN',
  SUGARS_FAT_FREE: 'SUGARS_FAT_FREE',
  SUGARS_WITH_FAT: 'SUGARS_WITH_FAT',
  FREE_FOODS: 'FREE_FOODS',
  ALCOHOLIC_BEVERAGES: 'ALCOHOLIC_BEVERAGES',
} as const;
export type SmaeGroup = (typeof SmaeGroup)[keyof typeof SmaeGroup];

/** Shopping list sections, the way people shop in Mexico. */
export const ShoppingCategory = {
  PRODUCE: 'PRODUCE',
  MEAT_FISH: 'MEAT_FISH',
  DAIRY_EGGS: 'DAIRY_EGGS',
  BAKERY: 'BAKERY',
  GROCERY: 'GROCERY',
  NUTS_SEEDS: 'NUTS_SEEDS',
} as const;
export type ShoppingCategory = (typeof ShoppingCategory)[keyof typeof ShoppingCategory];

/** Display unit of an ingredient quantity. Every ingredient also has its weight in grams. */
export const IngredientUnit = { G: 'G', ML: 'ML', PIECE: 'PIECE', CUP: 'CUP', TBSP: 'TBSP', TSP: 'TSP' } as const;
export type IngredientUnit = (typeof IngredientUnit)[keyof typeof IngredientUnit];

/** Why a patient gets no automatic energy target and is sent to their nutritionist instead. */
export const EnergyTargetHoldReason = {
  MINOR: 'MINOR',
  PREGNANT_OR_BREASTFEEDING: 'PREGNANT_OR_BREASTFEEDING',
  /** Weight loss asked while BMI < 18.5. */
  UNDERWEIGHT: 'UNDERWEIGHT',
  /** Maintenance is already below the calorie floor for their sex. */
  BELOW_FLOOR: 'BELOW_FLOOR',
} as const;
export type EnergyTargetHoldReason = (typeof EnergyTargetHoldReason)[keyof typeof EnergyTargetHoldReason];

/** Daily energy target computed from the profile (and, from week 6, the patient's goal). */
export type EnergyTargetDto =
  | {
      status: 'READY';
      /** Energy burned at rest (Mifflin-St Jeor). */
      bmrKcal: number;
      /** BMR × activity factor: eating this keeps the weight stable. */
      maintenanceKcal: number;
      /** Maintenance ± the goal's deficit or surplus, after the guardrails. What meal plans aim at. */
      targetKcal: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
    }
  | { status: 'CONSULT_NUTRITIONIST'; reason: EnergyTargetHoldReason };

/** The patient's onboarding answers. `dateOfBirth` comes from the Patient row. */
export type PatientProfileDto = {
  sex: BiologicalSex;
  dateOfBirth: string;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  mealsPerDay: number;
  pregnantOrBreastfeeding: boolean;
  allergies: Allergen[];
  /** Sorted by name. */
  dislikedFoods: FoodOptionDto[];
  /** Computed on every read, so it follows profile edits and birthdays. */
  energyTarget: EnergyTargetDto;
  updatedAt: string;
};

/** `profile` is null until the patient finishes onboarding. */
export type PatientProfileResponse = { profile: PatientProfileDto | null };

/**
 * Nutrition data from FatSecret, normalized. Per FatSecret's terms these values may
 * be cached for at most 24 h; only the ids (`fatsecretFoodId`, `fatsecretServingId`)
 * may be stored. Units: calories kcal; carbohydrate, protein, fats, fiber and sugars g;
 * cholesterol, sodium, potassium, calcium, iron and vitamin C mg; vitamins A and D mcg.
 * A nutrient FatSecret doesn't report is null (unknown), never 0.
 */
export type Nutrients = {
  calories: number | null;
  carbohydrate: number | null;
  protein: number | null;
  fat: number | null;
  saturatedFat: number | null;
  polyunsaturatedFat: number | null;
  monounsaturatedFat: number | null;
  transFat: number | null;
  cholesterol: number | null;
  sodium: number | null;
  potassium: number | null;
  fiber: number | null;
  sugar: number | null;
  addedSugars: number | null;
  vitaminA: number | null;
  vitaminC: number | null;
  vitaminD: number | null;
  calcium: number | null;
  iron: number | null;
};

export type FoodServing = {
  fatsecretServingId: string;
  /** e.g. "1 medium tortilla (6\" dia)", "100 g". */
  description: string;
  /** Weight or volume of this serving, e.g. 26 + "g"; null when FatSecret doesn't give one. */
  metricAmount: number | null;
  metricUnit: string | null;
  numberOfUnits: number | null;
  measurementDescription: string | null;
  isDefault: boolean;
  nutrients: Nutrients;
};

export type FoodDetail = {
  fatsecretFoodId: string;
  name: string;
  /** "Generic" foods (e.g. "Corn Tortilla") or "Brand" products. */
  type: string;
  brand: string | null;
  servings: FoodServing[];
};

export type FoodSearchItem = {
  fatsecretFoodId: string;
  name: string;
  type: string;
  brand: string | null;
  /** FatSecret's one-line summary, e.g. "Per 100g - Calories: 218kcal | Fat: 2.85g | Carbs: 44.64g | Protein: 5.70g". */
  description: string;
  /** Parsed from `description` when possible. */
  summary: { per: string; calories: number | null; fat: number | null; carbohydrate: number | null; protein: number | null } | null;
};

export type FoodSearchResponse = { items: FoodSearchItem[]; page: number; pageSize: number; total: number };

/** A food from our catalog (foods table), as patients pick it: e.g. for disliked foods. */
export type FoodOptionDto = { id: string; name: string };

/** The whole catalog, sorted by name (Spanish collation). Small enough to search on the device. */
export type FoodCatalogResponse = { items: FoodOptionDto[] };

/** A tenant recipe in the patient's recipe list. */
export type RecipeSummaryDto = {
  id: string;
  title: string;
  mealTypes: MealType[];
  servings: number;
  totalMinutes: number | null;
};

/** The tenant's recipes, sorted by title (Spanish collation). */
export type RecipeListResponse = { items: RecipeSummaryDto[] };

export type RecipeIngredientDto = {
  foodId: string;
  /** Our Spanish food name. */
  name: string;
  quantity: number;
  unit: IngredientUnit;
  /** For the whole recipe (all servings). */
  grams: number;
  note: string | null;
};

/** Per serving, from FatSecret: kcal and grams. Computed on every read, never stored. */
export type RecipeMacros = { calories: number; protein: number; carbohydrate: number; fat: number };

export type RecipeDetailDto = RecipeSummaryDto & {
  description: string | null;
  tags: string[];
  steps: string[];
  ingredients: RecipeIngredientDto[];
  /** Null when FatSecret is unreachable or doesn't give an ingredient's calories or macros: partial totals would mislead. */
  macrosPerServing: RecipeMacros | null;
};
