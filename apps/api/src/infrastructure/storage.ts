import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ServerEnv } from '@limon/config';
import { tenantObjectKey, tenantPrefix, type TenantContext, type TenantObjectArea } from '@limon/tenant';

/**
 * Private bucket, tenant-prefixed keys, short-lived signed URLs.
 * The tenant always comes from TenantContext; a key from another tenant's prefix is refused.
 */
export interface TenantStorage {
  uploadUrl(ctx: TenantContext, area: TenantObjectArea, fileName: string, contentType: string): Promise<{ key: string; url: string }>;
  downloadUrl(ctx: TenantContext, key: string): Promise<string>;
}

export function createStorage(env: ServerEnv): TenantStorage {
  const s3 = new S3Client({ region: env.AWS_REGION });
  const Bucket = env.S3_TENANT_BUCKET;
  return {
    async uploadUrl(ctx, area, fileName, contentType) {
      const key = tenantObjectKey(ctx.tenantId, area, `${Date.now()}-${fileName}`);
      const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket, Key: key, ContentType: contentType }), { expiresIn: 300 });
      return { key, url };
    },
    async downloadUrl(ctx, key) {
      if (!key.startsWith(tenantPrefix(ctx.tenantId))) throw new Error('Cross-tenant object access denied');
      return getSignedUrl(s3, new GetObjectCommand({ Bucket, Key: key }), { expiresIn: 300 });
    },
  };
}
