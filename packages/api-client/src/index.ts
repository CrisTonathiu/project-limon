import type {
  ApiErrorBody, ErrorCode, FoodCatalogResponse, FoodDetail, FoodSearchResponse, FoodSwapOptionsResponse, MealPlanResponse, MealType, MeResponse, MyGoalResponse, PatientDto, PatientEntitlement, PatientProfileResponse, SetGoalResponse,
  PlannedMealDetailDto, RecipeDetailDto, RecipeListResponse, RegisterNutritionistResponse, RegisterPatientResponse, ShoppingListResponse, TenantAppConfig,
} from '@limon/types';
import type { CreatePatientInput, PatientProfileInput, SetGoalInput, RegisterNutritionistInput, RegisterPatientInput, UpdateTenantBrandingInput } from '@limon/validation';

/**
 * Typed client shared by the dashboard (web) and patient apps (React Native).
 * Uses global fetch so it works in both runtimes. No tenantId is ever sent as an
 * authorization input; patient apps send their public app key in X-App-Key.
 */
export type ApiClientOptions = {
  baseUrl: string;
  getAccessToken: () => Promise<string | null>;
  /** Patient apps only: build-time public app key identifying the tenant app. */
  appKey?: string;
  fetchImpl?: typeof fetch;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function createApiClient(opts: ApiClientOptions) {
  const doFetch = opts.fetchImpl ?? fetch;

  async function request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.appKey) headers['X-App-Key'] = opts.appKey;
    if (auth) {
      const token = await opts.getAccessToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await doFetch(`${opts.baseUrl}/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 204) return undefined as T;
    const json = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      const err = (json as ApiErrorBody | null)?.error;
      throw new ApiError(res.status, err?.code ?? 'INTERNAL_ERROR', err?.message ?? 'Request failed', err?.requestId);
    }
    return json as T;
  }

  return {
    auth: {
      registerNutritionist: (input: RegisterNutritionistInput) =>
        request<RegisterNutritionistResponse>('POST', '/auth/register/nutritionist', input),
      registerPatient: (input: RegisterPatientInput) =>
        request<RegisterPatientResponse>('POST', '/auth/register/patient', input),
      me: () => request<MeResponse>('GET', '/auth/me'),
    },
    apps: {
      /** Public: runtime branding for the app key configured on this client. */
      bootstrap: () => request<TenantAppConfig>('GET', '/apps/bootstrap', undefined, false),
    },
    invites: {
      /** Public: resolves if the code is a valid, unused invite of this app's tenant; throws INVITE_CODE_INVALID otherwise. */
      check: (code: string) => request<void>('GET', `/invites/${encodeURIComponent(code)}`, undefined, false),
    },
    tenants: {
      current: () => request<MeResponse['tenant']>('GET', '/tenants/current'),
      updateBranding: (input: UpdateTenantBrandingInput) => request<TenantAppConfig>('PATCH', '/tenants/current/branding', input),
    },
    subscriptions: {
      /** Patient's own entitlement (paywall state). */
      me: () => request<PatientEntitlement>('GET', '/subscriptions/me'),
    },
    foods: {
      /** Our food catalog (ids and names), e.g. to pick disliked foods. */
      catalog: () => request<FoodCatalogResponse>('GET', '/foods/catalog'),
      /** Nutritionists: search FatSecret. Values may not be kept for more than 24 h. */
      search: (q: string, page = 0, pageSize = 20) =>
        request<FoodSearchResponse>('GET', `/foods/search?${new URLSearchParams({ q, page: String(page), pageSize: String(pageSize) })}`),
      getFatSecret: (fatsecretFoodId: string) => request<FoodDetail>('GET', `/foods/fatsecret/${encodeURIComponent(fatsecretFoodId)}`),
    },
    recipes: {
      /** The tenant's recipes, optionally only those that fit one meal. */
      list: (mealType?: MealType) => request<RecipeListResponse>('GET', `/recipes${mealType ? `?${new URLSearchParams({ mealType })}` : ''}`),
      /** Ingredients, steps and macros per serving (null when FatSecret can't provide them). */
      get: (id: string) => request<RecipeDetailDto>('GET', `/recipes/${encodeURIComponent(id)}`),
    },
    mealPlans: {
      /** This week's plan; the API generates it on the first visit of the week. */
      current: () => request<MealPlanResponse>('GET', '/meal-plans/current'),
      /** New recipes for one day (today or later) of this week; returns the whole week. */
      regenerateDay: (date: string) => request<MealPlanResponse>('POST', `/meal-plans/current/days/${encodeURIComponent(date)}/regenerate`),
      /** ♥ a recipe; the generator prefers it in later plans. */
      addFavourite: (recipeId: string) => request<void>('PUT', `/meal-plans/favourites/${encodeURIComponent(recipeId)}`),
      removeFavourite: (recipeId: string) => request<void>('DELETE', `/meal-plans/favourites/${encodeURIComponent(recipeId)}`),
      /** One meal of this week with its ingredients for the patient's portion, after swaps. */
      meal: (mealId: string) => request<PlannedMealDetailDto>('GET', `/meal-plans/current/meals/${encodeURIComponent(mealId)}`),
      /** Foods of the same SMAE group the ingredient can be swapped for. */
      swapOptions: (mealId: string, ingredientId: string) =>
        request<FoodSwapOptionsResponse>('GET', `/meal-plans/current/meals/${encodeURIComponent(mealId)}/ingredients/${encodeURIComponent(ingredientId)}/swaps`),
      /** Eat `foodId` instead (today or later); the recipe's own food undoes the swap. Returns the updated meal. */
      swap: (mealId: string, ingredientId: string, foodId: string) =>
        request<PlannedMealDetailDto>('PUT', `/meal-plans/current/meals/${encodeURIComponent(mealId)}/ingredients/${encodeURIComponent(ingredientId)}/swap`, { foodId }),
    },
    shoppingList: {
      /** This week's list, from the plan (generated on the first visit of the week, like `mealPlans.current`). */
      current: () => request<ShoppingListResponse>('GET', '/shopping-list/current'),
      /** Check or uncheck a food for this week. */
      setChecked: (foodId: string, checked: boolean) =>
        request<void>('PUT', `/shopping-list/current/items/${encodeURIComponent(foodId)}`, { checked }),
    },
    patients: {
      list: () => request<{ items: PatientDto[] }>('GET', '/patients'),
      create: (input: CreatePatientInput) => request<PatientDto>('POST', '/patients', input),
      get: (id: string) => request<PatientDto>('GET', `/patients/${encodeURIComponent(id)}`),
      me: () => request<PatientDto>('GET', '/patients/me'),
      /** `profile` is null until onboarding is done. */
      myProfile: () => request<PatientProfileResponse>('GET', '/patients/me/profile'),
      /** Onboarding and profile edits: always the whole questionnaire. */
      saveMyProfile: (input: PatientProfileInput) => request<PatientProfileResponse>('PUT', '/patients/me/profile', input),
      /** The patient's goal and the paces their clinic offers (goal_tracker module). */
      myGoal: () => request<MyGoalResponse>('GET', '/patients/me/goal'),
      /** Intention, pace and screening; the clinic's rules decide the starting target. */
      setMyGoal: (input: SetGoalInput) => request<SetGoalResponse>('PUT', '/patients/me/goal', input),
      /** Erases the patient's data. The Cognito login is deleted separately by the app. */
      deleteMyAccount: () => request<void>('DELETE', '/patients/me'),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
