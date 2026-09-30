import type { FoodCacheKey, FoodCacheStore } from '@limon/database';
import type { FoodDetail, FoodSearchItem, FoodSearchResponse, FoodServing, Nutrients } from '@limon/types';

/**
 * FatSecret Platform API client (OAuth 2.0 client credentials).
 *
 * Edition notes (see docs/roadmap/mvp-roadmap.md, "Nutrition data"):
 * - Basic (free): US data in English; search is `foods.search` v1, which returns a
 *   one-line summary per food instead of servings.
 * - Premier: `region`/`language` (e.g. MX/es) are sent when configured.
 * - Terms: only ids may be stored. Food details go to the shared Postgres cache
 *   (`store`, rows expire and are deleted after 24 h) with a short in-memory layer in
 *   front; search results stay in memory only. Without a store, food details are kept
 *   in memory for MEMORY_TTL_MS (< 24 h).
 * - Keys only work from whitelisted IPs (FatSecret error 21).
 */

const TOKEN_URL = 'https://oauth.fatsecret.com/connect/token';
const API_URL = 'https://platform.fatsecret.com/rest';
/** In-memory lifetime: well inside FatSecret's 24 h caching limit. */
const MEMORY_TTL_MS = 12 * 60 * 60 * 1000;
/** With the shared Postgres cache, memory only saves repeated reads within a few minutes. */
const MEMORY_TTL_WITH_STORE_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 2_000;
const TIMEOUT_MS = 8_000;
/** Refresh the token this long before it expires. */
const TOKEN_MARGIN_MS = 5 * 60 * 1000;

export type FatSecretConfig = {
  clientId: string;
  clientSecret: string;
  scopes: string;
  region?: string;
  language?: string;
  /** Shared Postgres cache for food details (see @limon/database food-cache). */
  store?: FoodCacheStore;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

/**
 * Why a FatSecret call failed. `reason` is safe to log; the message may contain
 * FatSecret's details (e.g. our IP) and is never sent to clients.
 */
export class FatSecretError extends Error {
  constructor(
    readonly reason: 'invalid_id' | 'ip_not_allowed' | 'auth' | 'quota' | 'unavailable' | 'bad_response',
    message: string,
    readonly fatsecretCode?: number,
  ) {
    super(message);
    this.name = 'FatSecretError';
  }
}

/** Small TTL cache with a size cap (oldest entries evicted first). */
class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();
  constructor(
    private readonly now: () => number,
    private readonly ttlMs: number,
  ) {}

  get(key: string): T | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T) {
    if (this.entries.size >= CACHE_MAX_ENTRIES) this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }
}

// ── Response normalization ───────────────────────────────────────────────────
// FatSecret returns numbers as strings, and a single result as an object instead of
// an array. Everything is normalized here so nothing else sees the raw shapes.

type Raw = Record<string, unknown>;

const asArray = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : typeof v === 'number' ? String(v) : null);
const num = (v: unknown): number | null => {
  const s = str(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

function nutrientsOf(s: Raw): Nutrients {
  return {
    calories: num(s.calories),
    carbohydrate: num(s.carbohydrate),
    protein: num(s.protein),
    fat: num(s.fat),
    saturatedFat: num(s.saturated_fat),
    polyunsaturatedFat: num(s.polyunsaturated_fat),
    monounsaturatedFat: num(s.monounsaturated_fat),
    transFat: num(s.trans_fat),
    cholesterol: num(s.cholesterol),
    sodium: num(s.sodium),
    potassium: num(s.potassium),
    fiber: num(s.fiber),
    sugar: num(s.sugar),
    addedSugars: num(s.added_sugars),
    vitaminA: num(s.vitamin_a),
    vitaminC: num(s.vitamin_c),
    vitaminD: num(s.vitamin_d),
    calcium: num(s.calcium),
    iron: num(s.iron),
  };
}

function servingOf(s: Raw): FoodServing {
  return {
    fatsecretServingId: str(s.serving_id) ?? '',
    description: str(s.serving_description) ?? '',
    metricAmount: num(s.metric_serving_amount),
    metricUnit: str(s.metric_serving_unit),
    numberOfUnits: num(s.number_of_units),
    measurementDescription: str(s.measurement_description),
    isDefault: str(s.is_default) === '1',
    nutrients: nutrientsOf(s),
  };
}

export function normalizeFood(raw: unknown): FoodDetail {
  const food = (raw as { food?: Raw } | null)?.food;
  const id = str(food?.food_id);
  if (!food || !id) throw new FatSecretError('bad_response', 'food.get: missing food');
  const servings = asArray((food.servings as { serving?: Raw | Raw[] } | undefined)?.serving).map(servingOf);
  return { fatsecretFoodId: id, name: str(food.food_name) ?? '', type: str(food.food_type) ?? '', brand: str(food.brand_name), servings };
}

/** "Per 100g - Calories: 218kcal | Fat: 2.85g | Carbs: 44.64g | Protein: 5.70g" → numbers. */
export function parseFoodDescription(description: string): FoodSearchItem['summary'] {
  const m = /^Per (.+?) - (.*)$/.exec(description.trim());
  if (!m) return null;
  const field = (label: string) => num(new RegExp(`${label}:\\s*([\\d.]+)`, 'i').exec(m[2]!)?.[1]);
  return { per: m[1]!, calories: field('Calories'), fat: field('Fat'), carbohydrate: field('Carbs'), protein: field('Protein') };
}

export function normalizeSearch(raw: unknown, page: number, pageSize: number): FoodSearchResponse {
  const foods = (raw as { foods?: Raw } | null)?.foods;
  if (!foods) throw new FatSecretError('bad_response', 'foods.search: missing foods');
  const items = asArray(foods.food as Raw | Raw[] | undefined).map((f): FoodSearchItem => {
    const description = str(f.food_description) ?? '';
    return {
      fatsecretFoodId: str(f.food_id) ?? '',
      name: str(f.food_name) ?? '',
      type: str(f.food_type) ?? '',
      brand: str(f.brand_name),
      description,
      summary: parseFoodDescription(description),
    };
  });
  return { items, page, pageSize, total: num(foods.total_results) ?? items.length };
}

/** FatSecret error codes → our reasons (https://platform.fatsecret.com/docs/guides/error-codes). */
function errorFor(code: number, message: string): FatSecretError {
  if (code === 106) return new FatSecretError('invalid_id', message, code);
  if (code === 21) return new FatSecretError('ip_not_allowed', message, code);
  // 11: monthly quota used up; 12: too many requests in a short time.
  if (code === 11 || code === 12) return new FatSecretError('quota', message, code);
  if (code >= 2 && code <= 14) return new FatSecretError('auth', message, code);
  return new FatSecretError('unavailable', message, code);
}

// ── Client ───────────────────────────────────────────────────────────────────

export class FatSecretClient {
  private readonly fetch: typeof fetch;
  private readonly now: () => number;
  private token: { value: string; expiresAt: number } | null = null;
  private tokenRequest: Promise<string> | null = null;
  private readonly foods: TtlCache<FoodDetail>;
  private readonly searches: TtlCache<FoodSearchResponse>;

  constructor(private readonly cfg: FatSecretConfig) {
    this.fetch = cfg.fetchImpl ?? fetch;
    this.now = cfg.now ?? Date.now;
    this.foods = new TtlCache(this.now, cfg.store ? MEMORY_TTL_WITH_STORE_MS : MEMORY_TTL_MS);
    this.searches = new TtlCache(this.now, MEMORY_TTL_MS);
  }

  /** Dataset this client reads: "" on Basic (US, English). */
  get region(): string {
    return this.cfg.region ?? '';
  }
  get language(): string {
    return this.cfg.region ? (this.cfg.language ?? '') : '';
  }

  private keyFor(fatsecretFoodId: string): FoodCacheKey {
    return { fatsecretFoodId, region: this.region, language: this.language };
  }

  async searchFoods(query: string, page = 0, pageSize = 20): Promise<FoodSearchResponse> {
    const key = `${this.cfg.region ?? ''}|${this.cfg.language ?? ''}|${query.toLowerCase()}|${page}|${pageSize}`;
    const cached = this.searches.get(key);
    if (cached) return cached;
    const raw = await this.call('/foods/search/v1', {
      search_expression: query,
      page_number: String(page),
      max_results: String(pageSize),
    });
    const result = normalizeSearch(raw, page, pageSize);
    this.searches.set(key, result);
    return result;
  }

  /** Memory → shared Postgres cache → FatSecret. Only the last step needs FatSecret to be up. */
  async getFood(foodId: string): Promise<FoodDetail> {
    const key = this.keyFor(foodId);
    const memoryKey = `${key.region}|${key.language}|${foodId}`;
    const inMemory = this.foods.get(memoryKey);
    if (inMemory) return inMemory;
    const stored = await this.cfg.store?.get(key, new Date(this.now()));
    if (stored) {
      this.foods.set(memoryKey, stored);
      return stored;
    }
    return this.refreshFood(foodId);
  }

  /** Always asks FatSecret, then updates both caches. Used by getFood on a miss and by the refresh job. */
  async refreshFood(foodId: string): Promise<FoodDetail> {
    const key = this.keyFor(foodId);
    const fetchedAt = new Date(this.now());
    const food = normalizeFood(await this.call('/food/v4', { food_id: foodId }));
    await this.cfg.store?.put(key, food, fetchedAt);
    this.foods.set(`${key.region}|${key.language}|${foodId}`, food);
    return food;
  }

  /** GET an API method. Retries once with a fresh token if FatSecret rejects the current one. */
  private async call(path: string, params: Record<string, string>, retried = false): Promise<unknown> {
    const query = new URLSearchParams({ ...params, format: 'json' });
    if (this.cfg.region) {
      query.set('region', this.cfg.region);
      if (this.cfg.language) query.set('language', this.cfg.language);
    }
    const res = await this.send(`${API_URL}${path}?${query}`, {
      headers: { Authorization: `Bearer ${await this.accessToken()}`, Accept: 'application/json' },
    });
    const body = (await res.json().catch(() => null)) as { error?: { code?: unknown; message?: unknown } } | null;
    // Errors can arrive with HTTP 200, so check the body first.
    if (body?.error) {
      const code = num(body.error.code) ?? 0;
      if (code === 13 && !retried) {
        this.token = null;
        return this.call(path, params, true);
      }
      throw errorFor(code, `FatSecret ${path} error ${code}: ${str(body.error.message) ?? ''}`);
    }
    if (!res.ok || body === null) throw new FatSecretError('unavailable', `FatSecret ${path}: HTTP ${res.status}`);
    return body;
  }

  /** Cached until shortly before expiry; concurrent callers share one token request. */
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > this.now()) return this.token.value;
    this.tokenRequest ??= this.requestToken().finally(() => {
      this.tokenRequest = null;
    });
    return this.tokenRequest;
  }

  private async requestToken(): Promise<string> {
    const basic = Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString('base64');
    const res = await this.send(TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: this.cfg.scopes }).toString(),
    });
    const body = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; error?: string } | null;
    if (!res.ok || !body?.access_token) {
      // e.g. invalid_client (wrong id/secret), invalid_scope (scope not in this plan).
      throw new FatSecretError('auth', `FatSecret token request failed: HTTP ${res.status} ${body?.error ?? ''}`.trim());
    }
    const lifetimeMs = (body.expires_in ?? 3600) * 1000;
    this.token = { value: body.access_token, expiresAt: this.now() + Math.max(lifetimeMs - TOKEN_MARGIN_MS, 0) };
    return body.access_token;
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      throw new FatSecretError('unavailable', `FatSecret request failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
