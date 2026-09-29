import { describe, expect, it } from 'vitest';
import { FatSecretClient, FatSecretError, parseFoodDescription } from '../../src/infrastructure/fatsecret.js';

type Call = { url: string; init: RequestInit };

/** A fake FatSecret: token endpoint + API methods answered by `handler`. */
function fakeFatSecret(handler: (url: URL, call: number) => unknown, opts: { expiresIn?: number } = {}) {
  const calls: Call[] = [];
  let apiCalls = 0;
  let tokens = 0;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url.startsWith('https://oauth.fatsecret.com/')) {
      tokens++;
      return Response.json({ access_token: `token-${tokens}`, token_type: 'Bearer', expires_in: opts.expiresIn ?? 86400 });
    }
    return Response.json(handler(new URL(url), ++apiCalls));
  }) as typeof fetch;
  return { fetchImpl, calls, tokenCount: () => tokens, apiCount: () => apiCalls };
}

const tortilla = {
  food: {
    food_id: '4412',
    food_name: 'Corn Tortilla',
    food_type: 'Generic',
    servings: {
      // A single serving arrives as an object, not an array.
      serving: {
        serving_id: '16532', serving_description: '1 medium tortilla (approx 6" dia)', metric_serving_amount: '26.000',
        metric_serving_unit: 'g', number_of_units: '1.000', measurement_description: 'medium tortilla (approx 6" dia)',
        is_default: '1', calories: '57', carbohydrate: '11.63', protein: '1.48', fat: '0.74', fiber: '1.6', sodium: '12',
      },
    },
  },
};

describe('FatSecretClient', () => {
  it('gets a token with the client credentials and reuses it', async () => {
    const fs = fakeFatSecret(() => tortilla);
    const client = new FatSecretClient({ clientId: 'id', clientSecret: 'secret', scopes: 'basic', fetchImpl: fs.fetchImpl });
    await client.getFood('4412');
    await client.getFood('999'); // different id → API call, same token
    expect(fs.tokenCount()).toBe(1);
    const tokenCall = fs.calls[0]!;
    expect((tokenCall.init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('id:secret').toString('base64')}`);
    expect(String(tokenCall.init.body)).toBe('grant_type=client_credentials&scope=basic');
    expect((fs.calls[1]!.init.headers as Record<string, string>).Authorization).toBe('Bearer token-1');
  });

  it('normalizes a food: numbers from strings, single serving to array, missing nutrients as null', async () => {
    const fs = fakeFatSecret(() => tortilla);
    const food = await new FatSecretClient({ clientId: 'id', clientSecret: 's', scopes: 'basic', fetchImpl: fs.fetchImpl }).getFood('4412');
    expect(food).toMatchObject({ fatsecretFoodId: '4412', name: 'Corn Tortilla', type: 'Generic', brand: null });
    expect(food.servings).toHaveLength(1);
    expect(food.servings[0]).toMatchObject({ fatsecretServingId: '16532', metricAmount: 26, metricUnit: 'g', isDefault: true });
    expect(food.servings[0]!.nutrients).toMatchObject({ calories: 57, carbohydrate: 11.63, protein: 1.48, fat: 0.74, sugar: null });
  });

  it('caches food details in memory for less than 24 hours', async () => {
    let now = 0;
    const fs = fakeFatSecret(() => tortilla);
    const client = new FatSecretClient({ clientId: 'id', clientSecret: 's', scopes: 'basic', fetchImpl: fs.fetchImpl, now: () => now });
    await client.getFood('4412');
    now += 11 * 60 * 60 * 1000;
    await client.getFood('4412');
    expect(fs.apiCount()).toBe(1);
    now += 2 * 60 * 60 * 1000; // 13 h after the first fetch
    await client.getFood('4412');
    expect(fs.apiCount()).toBe(2);
  });

  it('searches with foods.search v1 and parses the one-line summaries', async () => {
    const fs = fakeFatSecret(() => ({
      foods: {
        max_results: '20', page_number: '0', total_results: '2',
        food: [
          { food_id: '4412', food_name: 'Corn Tortilla', food_type: 'Generic', food_description: 'Per 100g - Calories: 218kcal | Fat: 2.85g | Carbs: 44.64g | Protein: 5.70g' },
          { food_id: '77', food_name: 'Tortillas', food_type: 'Brand', brand_name: 'Mission', food_description: 'Per 1 tortilla - Calories: 50kcal | Fat: 0.50g | Carbs: 10.00g | Protein: 1.00g' },
        ],
      },
    }));
    const res = await new FatSecretClient({ clientId: 'id', clientSecret: 's', scopes: 'basic', fetchImpl: fs.fetchImpl }).searchFoods('corn tortilla');
    const url = new URL(fs.calls[1]!.url);
    expect(url.pathname).toBe('/rest/foods/search/v1');
    expect(url.searchParams.get('search_expression')).toBe('corn tortilla');
    expect(url.searchParams.get('format')).toBe('json');
    expect(url.searchParams.has('region')).toBe(false); // Basic: US only
    expect(res.total).toBe(2);
    expect(res.items[1]).toMatchObject({ fatsecretFoodId: '77', brand: 'Mission', summary: { per: '1 tortilla', calories: 50 } });
  });

  it('handles an empty search and a single result', async () => {
    const empty = fakeFatSecret(() => ({ foods: { max_results: '20', page_number: '0', total_results: '0' } }));
    expect((await new FatSecretClient({ clientId: 'i', clientSecret: 's', scopes: 'basic', fetchImpl: empty.fetchImpl }).searchFoods('zzz')).items).toEqual([]);
    const one = fakeFatSecret(() => ({ foods: { total_results: '1', food: { food_id: '1', food_name: 'Nopal', food_type: 'Generic', food_description: '' } } }));
    const res = await new FatSecretClient({ clientId: 'i', clientSecret: 's', scopes: 'basic', fetchImpl: one.fetchImpl }).searchFoods('nopal');
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.summary).toBeNull();
  });

  it('sends region and language when configured (Premier)', async () => {
    const fs = fakeFatSecret(() => tortilla);
    await new FatSecretClient({ clientId: 'i', clientSecret: 's', scopes: 'premier localization', region: 'MX', language: 'es', fetchImpl: fs.fetchImpl }).getFood('4412');
    const url = new URL(fs.calls[1]!.url);
    expect([url.searchParams.get('region'), url.searchParams.get('language')]).toEqual(['MX', 'es']);
  });

  it('retries once with a new token when FatSecret rejects the token', async () => {
    const fs = fakeFatSecret((_url, n) => (n === 1 ? { error: { code: 13, message: 'Invalid token' } } : tortilla));
    const food = await new FatSecretClient({ clientId: 'i', clientSecret: 's', scopes: 'basic', fetchImpl: fs.fetchImpl }).getFood('4412');
    expect(food.name).toBe('Corn Tortilla');
    expect(fs.tokenCount()).toBe(2);
  });

  it('maps FatSecret error codes, including errors sent with HTTP 200', async () => {
    const cases: [number, FatSecretError['reason']][] = [[21, 'ip_not_allowed'], [106, 'invalid_id'], [11, 'quota'], [14, 'auth']];
    for (const [code, reason] of cases) {
      const fs = fakeFatSecret(() => ({ error: { code, message: 'x' } }));
      await expect(
        new FatSecretClient({ clientId: 'i', clientSecret: 's', scopes: 'basic', fetchImpl: fs.fetchImpl }).getFood('1'),
      ).rejects.toMatchObject({ reason, fatsecretCode: code });
    }
  });

  it('reports a network failure as unavailable', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    await expect(new FatSecretClient({ clientId: 'i', clientSecret: 's', scopes: 'basic', fetchImpl }).getFood('1')).rejects.toMatchObject({
      reason: 'unavailable',
    });
  });
});

describe('parseFoodDescription', () => {
  it('reads the per-amount and macros', () => {
    expect(parseFoodDescription('Per 100g - Calories: 218kcal | Fat: 2.85g | Carbs: 44.64g | Protein: 5.70g')).toEqual({
      per: '100g', calories: 218, fat: 2.85, carbohydrate: 44.64, protein: 5.7,
    });
  });
  it('returns null for text it does not recognize', () => {
    expect(parseFoodDescription('something else')).toBeNull();
  });
});
