import type { Bucket } from '@google-cloud/storage';
import type { ServerEnv } from '@limon/config';
import type { TenantContext } from '@limon/tenant';
import { describe, expect, it } from 'vitest';
import { createStorage } from '../../src/infrastructure/storage.js';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const ctx = { tenantId: TENANT_A } as TenantContext;

/** Records what the storage helper asks Cloud Storage for, without signing or calling anything. */
function fakeBucket() {
  const calls: { signed: { key: string; options: Record<string, unknown> }[]; deleted: unknown[] } = { signed: [], deleted: [] };
  const bucket = {
    file: (key: string) => ({
      getSignedUrl: async (options: Record<string, unknown>) => {
        calls.signed.push({ key, options });
        return [`https://storage.googleapis.com/bucket/${key}?signed`];
      },
    }),
    deleteFiles: async (query: unknown) => void calls.deleted.push(query),
  } as unknown as Bucket;
  return { bucket, calls };
}

describe('TenantStorage (Cloud Storage)', () => {
  it('signs a V4 upload URL under the tenant prefix, bound to the content type, valid 5 minutes', async () => {
    const { bucket, calls } = fakeBucket();
    const before = Date.now();
    const { key, url } = await createStorage({} as ServerEnv, bucket).uploadUrl(ctx, 'patients', 'mi foto.jpg', 'image/jpeg');
    expect(key).toMatch(new RegExp(`^tenants/${TENANT_A}/patients/\\d+-mi_foto\\.jpg$`));
    expect(url).toContain(key);
    const { options } = calls.signed[0]!;
    expect(options).toMatchObject({ version: 'v4', action: 'write', contentType: 'image/jpeg' });
    expect(options.expires as number).toBeGreaterThanOrEqual(before + 5 * 60 * 1000);
    expect(options.expires as number).toBeLessThanOrEqual(Date.now() + 5 * 60 * 1000);
  });

  it('signs a read URL for the tenant’s own key', async () => {
    const { bucket, calls } = fakeBucket();
    const key = `tenants/${TENANT_A}/documents/plan.pdf`;
    await createStorage({} as ServerEnv, bucket).downloadUrl(ctx, key);
    expect(calls.signed[0]).toMatchObject({ key, options: { version: 'v4', action: 'read' } });
  });

  it('refuses a key from another tenant without signing anything', async () => {
    const { bucket, calls } = fakeBucket();
    await expect(createStorage({} as ServerEnv, bucket).downloadUrl(ctx, `tenants/${TENANT_B}/documents/plan.pdf`)).rejects.toThrow('Cross-tenant');
    expect(calls.signed).toEqual([]);
  });

  it('deletes every object and old version under the tenant prefix', async () => {
    const { bucket, calls } = fakeBucket();
    await createStorage({} as ServerEnv, bucket).deleteTenantFiles(TENANT_A);
    expect(calls.deleted).toEqual([{ prefix: `tenants/${TENANT_A}/`, versions: true, force: true }]);
  });
});
