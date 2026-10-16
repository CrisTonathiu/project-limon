import { Storage, type Bucket } from '@google-cloud/storage';
import type { ServerEnv } from '@limon/config';
import { tenantObjectKey, tenantPrefix, type TenantContext, type TenantObjectArea } from '@limon/tenant';

/** How long a signed upload or download URL stays valid. */
const SIGNED_URL_TTL_MS = 5 * 60 * 1000;

/**
 * Private bucket, tenant-prefixed keys, short-lived signed URLs.
 * The tenant always comes from TenantContext; a key from another tenant's prefix is refused.
 */
export interface TenantStorage {
  uploadUrl(ctx: TenantContext, area: TenantObjectArea, fileName: string, contentType: string): Promise<{ key: string; url: string }>;
  downloadUrl(ctx: TenantContext, key: string): Promise<string>;
  /** Every object (and every old version) under tenants/{tenantId}/. Safe to repeat. */
  deleteTenantFiles(tenantId: string): Promise<void>;
}

/**
 * Cloud Storage with V4 signed URLs. On Cloud Run there's no key file: the client signs
 * through the IAM signBlob API as the service account (token creator on itself, iam.tf).
 */
export function createStorage(env: ServerEnv, bucket: Bucket = new Storage({ projectId: env.GCP_PROJECT_ID }).bucket(env.GCS_TENANT_BUCKET)): TenantStorage {
  return {
    async uploadUrl(ctx, area, fileName, contentType) {
      const key = tenantObjectKey(ctx.tenantId, area, `${Date.now()}-${fileName}`);
      const [url] = await bucket.file(key).getSignedUrl({ version: 'v4', action: 'write', contentType, expires: Date.now() + SIGNED_URL_TTL_MS });
      return { key, url };
    },
    async downloadUrl(ctx, key) {
      if (!key.startsWith(tenantPrefix(ctx.tenantId))) throw new Error('Cross-tenant object access denied');
      const [url] = await bucket.file(key).getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + SIGNED_URL_TTL_MS });
      return url;
    },
    async deleteTenantFiles(tenantId) {
      // The bucket is versioned: without `versions`, deleted objects would live on as noncurrent versions.
      await bucket.deleteFiles({ prefix: tenantPrefix(tenantId), versions: true, force: true });
    },
  };
}
