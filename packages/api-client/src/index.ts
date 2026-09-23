import type {
  ApiErrorBody, ErrorCode, MeResponse, PatientDto, PatientEntitlement,
  RegisterNutritionistResponse, RegisterPatientResponse, TenantAppConfig,
} from '@limon/types';
import type { CreatePatientInput, RegisterNutritionistInput, RegisterPatientInput, UpdateTenantBrandingInput } from '@limon/validation';

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
    tenants: {
      current: () => request<MeResponse['tenant']>('GET', '/tenants/current'),
      updateBranding: (input: UpdateTenantBrandingInput) => request<TenantAppConfig>('PATCH', '/tenants/current/branding', input),
    },
    subscriptions: {
      /** Patient's own entitlement (paywall state). */
      me: () => request<PatientEntitlement>('GET', '/subscriptions/me'),
    },
    patients: {
      list: () => request<{ items: PatientDto[] }>('GET', '/patients'),
      create: (input: CreatePatientInput) => request<PatientDto>('POST', '/patients', input),
      get: (id: string) => request<PatientDto>('GET', `/patients/${encodeURIComponent(id)}`),
      me: () => request<PatientDto>('GET', '/patients/me'),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
