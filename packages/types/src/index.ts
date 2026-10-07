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
  // Swaps are made on the meals of a plan.
  [FeatureKey.FOOD_SWAPS]: [FeatureKey.MEAL_PLAN],
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

/** How a shopping list item is counted: grams, millilitres, or whole pieces (eggs, limes, tortillas). */
export const ShoppingUnit = { G: 'G', ML: 'ML', PIECE: 'PIECE' } as const;
export type ShoppingUnit = (typeof ShoppingUnit)[keyof typeof ShoppingUnit];

/** Display unit of an ingredient quantity. Every ingredient also has its weight in grams. */
export const IngredientUnit = { G: 'G', ML: 'ML', PIECE: 'PIECE', CUP: 'CUP', TBSP: 'TBSP', TSP: 'TSP' } as const;
export type IngredientUnit = (typeof IngredientUnit)[keyof typeof IngredientUnit];

/** What the patient wants to work toward. They choose an intention; the clinic's rules decide the target. */
export const GoalIntention = {
  LOSE_WEIGHT: 'LOSE_WEIGHT',
  MAINTAIN_WEIGHT: 'MAINTAIN_WEIGHT',
  GAIN_WEIGHT: 'GAIN_WEIGHT',
  NUTRITION_QUALITY: 'NUTRITION_QUALITY',
  BUILD_MUSCLE: 'BUILD_MUSCLE',
  OTHER: 'OTHER',
} as const;
export type GoalIntention = (typeof GoalIntention)[keyof typeof GoalIntention];

/** The direction the energy target takes: what an intention turns into. */
export const WeightGoal = { LOSE: 'LOSE', MAINTAIN: 'MAINTAIN', GAIN: 'GAIN' } as const;
export type WeightGoal = (typeof WeightGoal)[keyof typeof WeightGoal];

/** How fast to lose or gain. For gains these are lean gain / steady / bulk. Which ones a patient may pick is the clinic's call. */
export const GoalPace = { GENTLE: 'GENTLE', MODERATE: 'MODERATE', FAST: 'FAST' } as const;
export type GoalPace = (typeof GoalPace)[keyof typeof GoalPace];

/** Screening: how the patient's weight moved in the last 3 months (more than 5 kg counts as lost or gained). */
export const RecentWeightChange = { STABLE: 'STABLE', LOST: 'LOST', GAINED: 'GAINED', UNSURE: 'UNSURE' } as const;
export type RecentWeightChange = (typeof RecentWeightChange)[keyof typeof RecentWeightChange];

/** Why the starting target came out as it did. The app turns it into the explanation the patient reads. */
export const GoalDecisionReason = {
  /** Lose or gain at the pace the patient chose (one the clinic allows). */
  AS_CHOSEN: 'AS_CHOSEN',
  /** Maintain weight or improve nutrition quality: maintenance. */
  MAINTAIN: 'MAINTAIN',
  /** Build muscle: a lean gain (gentle surplus, more protein). */
  LEAN_GAIN: 'LEAN_GAIN',
  /** "Other": maintenance until they talk to their nutritionist. */
  OTHER: 'OTHER',
  /** Lost more than 5 kg recently and wants to lose more: maintenance, talk to the nutritionist. */
  RECENT_WEIGHT_LOSS: 'RECENT_WEIGHT_LOSS',
  /** The weight they'd like to reach is below a healthy BMI: maintenance, talk to the nutritionist. */
  DESIRED_WEIGHT_TOO_LOW: 'DESIRED_WEIGHT_TOO_LOW',
} as const;
export type GoalDecisionReason = (typeof GoalDecisionReason)[keyof typeof GoalDecisionReason];

/** The patient's goal: what they asked for, and the starting target the rules chose. */
export type PatientGoalDto = {
  intention: GoalIntention;
  /** The pace they picked (lose and gain only). */
  pace: GoalPace | null;
  /** How many kg they'd like to lose or gain, if they said. Always positive. */
  desiredChangeKg: number | null;
  otherText: string | null;
  recentWeightChange: RecentWeightChange;
  decision: { goal: WeightGoal; pace: GoalPace | null; reason: GoalDecisionReason };
  /** The rules the decision used: "platform-1" or "clinic-3". */
  rulesVersion: string;
  decidedAt: string;
};

/** GET /patients/me/goal. `options` are the paces this clinic lets patients pick. */
export type MyGoalResponse = {
  goal: PatientGoalDto | null;
  options: { lose: GoalPace[]; gain: GoalPace[] };
};

/** PUT /patients/me/goal: the saved goal, and the energy target it leads to. */
export type SetGoalResponse = MyGoalResponse & { goal: PatientGoalDto; energyTarget: EnergyTargetDto };

/** Body measurements a patient can log, besides weight. */
export const BodyMeasurement = {
  WAIST_CM: 'waistCm',
  HIP_CM: 'hipCm',
  CHEST_CM: 'chestCm',
  ARM_CM: 'armCm',
  THIGH_CM: 'thighCm',
  BODY_FAT_PCT: 'bodyFatPct',
} as const;
export type BodyMeasurement = (typeof BodyMeasurement)[keyof typeof BodyMeasurement];

/** One day of weigh-in and measurements. Values the patient didn't log that day are null. */
export type BodyLogDto = { date: string; weightKg: number | null } & Record<BodyMeasurement, number | null>;

/** GET /patients/me/body-logs: newest first. */
export type BodyLogListResponse = { items: BodyLogDto[] };

/** Period of the weight chart: the last 8 weeks, the last 3 months, or everything. */
export const ProgressPeriod = { WEEKS_8: 'weeks8', MONTHS_3: 'months3', ALL: 'all' } as const;
export type ProgressPeriod = (typeof ProgressPeriod)[keyof typeof ProgressPeriod];

/** GET /patients/me/progress */
export type ProgressResponse = {
  /** The profile's weight, which follows the latest weigh-in. */
  currentWeightKg: number;
  /** Weigh-ins in the period, oldest first. */
  weights: { date: string; weightKg: number }[];
  /** Each measurement's latest value and its change since the first time it was logged (null with one value). */
  measurements: Record<BodyMeasurement, { value: number; date: string; change: number | null } | null>;
  /**
   * The weight goal's start and target, when the goal loses or gains toward a number of kg.
   * Null for goals that maintain, or that don't say how many kg.
   */
  weightGoal: { startWeightKg: number; targetWeightKg: number; startedOn: string } | null;
};

/** One glass (or bottle) of water. */
export type WaterIntakeDto = { id: string; amountMl: number; createdAt: string };

/** Today's water: what was drunk against the target. Returned by every water endpoint. */
export type WaterTodayDto = {
  /** Today on the patient's calendar (YYYY-MM-DD). */
  date: string;
  targetMl: number;
  /** The default target (35 ml per kg), shown when the patient edits theirs. */
  defaultTargetMl: number;
  /** True when the patient set their own target. */
  customTarget: boolean;
  totalMl: number;
  /** Newest first. */
  intakes: WaterIntakeDto[];
};

/** GET /water: today plus the totals of the last `days` days (today included, oldest first, 0 for days with none). */
export type WaterResponse = WaterTodayDto & { history: { date: string; totalMl: number }[] };

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

/** One meal of a plan day. `recipe` and `servings` are null when no recipe fit the patient's filters. */
export type PlannedMealDto = {
  id: string;
  mealType: MealType;
  recipe: { id: string; title: string; totalMinutes: number | null } | null;
  /** Recipe servings the patient eats (0.5–2.5). */
  servings: number | null;
  /** For the portion, from FatSecret on every read. Null when unknown, like RecipeDetailDto.macrosPerServing. */
  macros: RecipeMacros | null;
  /** The patient ♥ this recipe (in any week). False when there's no recipe. */
  favourite: boolean;
};

export type MealPlanDayDto = {
  /** YYYY-MM-DD */
  date: string;
  /** Sum of the day's meals; null when any planned meal's macros are unknown. */
  totals: RecipeMacros | null;
  meals: PlannedMealDto[];
};

export type MealPlanDto = { id: string; weekStart: string; days: MealPlanDayDto[] };

/** The patient's daily target the plan aims at (energyTarget when READY). */
export type MealPlanTargetDto = { kcal: number; proteinG: number; carbsG: number; fatG: number };

/**
 * GET /meal-plans/current and POST …/regenerate. CONSULT_NUTRITIONIST when the guardrails
 * withhold an automatic target: no plan is generated then.
 */
export type MealPlanResponse =
  | { status: 'READY'; plan: MealPlanDto; target: MealPlanTargetDto }
  | { status: 'CONSULT_NUTRITIONIST'; reason: EnergyTargetHoldReason };

/** One ingredient of a planned meal, for the patient's portion, after any swap. */
export type PlannedMealIngredientDto = {
  /** The recipe ingredient: what a swap refers to. */
  id: string;
  foodId: string;
  /** Our Spanish food name. */
  name: string;
  /** Grams the patient eats in this meal (the recipe's grams × the portion, converted by SMAE equivalents when swapped). */
  grams: number;
  /** The recipe's household amount for the patient's portion. Null when swapped: only grams carry over. */
  quantity: number | null;
  unit: IngredientUnit | null;
  note: string | null;
  /** The recipe's own food when this ingredient was swapped, otherwise null. */
  swappedFrom: { foodId: string; name: string } | null;
  /** The food has an SMAE group and equivalent, so it can be swapped. */
  swappable: boolean;
};

/** GET /meal-plans/current/meals/:mealId and the swap endpoints: one planned meal with its ingredients. */
export type PlannedMealDetailDto = {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  mealType: MealType;
  recipe: { id: string; title: string; totalMinutes: number | null; description: string | null; steps: string[] };
  servings: number;
  /** For the portion, after swaps. Null when unknown, like PlannedMealDto.macros. */
  macros: RecipeMacros | null;
  favourite: boolean;
  ingredients: PlannedMealIngredientDto[];
};

/** A food the ingredient can be swapped for: same SMAE group, none of the patient's allergens or disliked foods. */
export type FoodSwapOptionDto = {
  foodId: string;
  name: string;
  /** Grams for the patient's portion that give the same equivalents. */
  grams: number;
  /** The recipe's own food: choosing it undoes the swap. */
  original: boolean;
};

/** GET /meal-plans/current/meals/:mealId/ingredients/:ingredientId/swaps, sorted by name. */
export type FoodSwapOptionsResponse = { items: FoodSwapOptionDto[] };

/** One food to buy for the week, rounded up to a quantity you can buy. */
export type ShoppingListItemDto = {
  foodId: string;
  /** Our Spanish food name. */
  name: string;
  unit: ShoppingUnit;
  amount: number;
  /** Checked for at least this amount. A plan change that raises the amount unchecks it. */
  checked: boolean;
};

/** One store section of the list. Sections come in a fixed order and items by name; empty sections are left out. */
export type ShoppingListSectionDto = { category: ShoppingCategory; items: ShoppingListItemDto[] };

/**
 * GET /shopping-list/current: the current week's plan (after swaps and portions) added up by food.
 * Worked out on every read, so it follows the plan. CONSULT_NUTRITIONIST when there's no plan.
 */
export type ShoppingListResponse =
  | { status: 'READY'; weekStart: string; sections: ShoppingListSectionDto[] }
  | { status: 'CONSULT_NUTRITIONIST'; reason: EnergyTargetHoldReason };

