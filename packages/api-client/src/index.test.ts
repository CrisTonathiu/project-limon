import { describe, expect, it } from 'vitest';
import { ApiError, createApiClient } from './index.js';

describe('api-client', () => {
  it('sends bearer token and app key, never a tenantId', async () => {
    let seen: RequestInit | undefined;
    const client = createApiClient({
      baseUrl: 'http://api',
      appKey: 'maria-ios',
      getAccessToken: async () => 'tok',
      fetchImpl: (async (_url: string, init: RequestInit) => {
        seen = init;
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }) as typeof fetch,
    });
    await client.patients.list();
    const h = seen!.headers as Record<string, string>;
    expect(h['Authorization']).toBe('Bearer tok');
    expect(h['X-App-Key']).toBe('maria-ios');
    expect(Object.keys(h).some((k) => k.toLowerCase().includes('tenant'))).toBe(false);
  });

  it('maps API errors to ApiError with stable code', async () => {
    const client = createApiClient({
      baseUrl: 'http://api',
      getAccessToken: async () => null,
      fetchImpl: (async () =>
        new Response(JSON.stringify({ error: { code: 'TENANT_SUSPENDED', message: 'x', requestId: 'r1' } }), { status: 403 })) as unknown as typeof fetch,
    });
    await expect(client.auth.me()).rejects.toMatchObject({ code: 'TENANT_SUSPENDED', status: 403, requestId: 'r1' });
    await expect(client.auth.me()).rejects.toBeInstanceOf(ApiError);
  });
});
