import { Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import type { EnvConfig } from '../../config/environments';

/**
 * Tenant assets bucket. Keys: tenants/{tenantId}/{branding|recipes|patients|documents|exports}/...
 * Fully private; access only via short-lived presigned URLs from the API.
 * Public branding (logos) will be served through CloudFront OAC scoped to the branding prefix (deferred).
 */
export class StorageStack extends Stack {
  readonly tenantBucket: s3.Bucket;

  constructor(scope: Construct, id: string, cfg: EnvConfig, props?: StackProps) {
    super(scope, id, props);
    this.tenantBucket = new s3.Bucket(this, 'TenantAssets', {
      bucketName: `${cfg.prefix}-tenant-assets-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: cfg.name !== 'development',
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      lifecycleRules: [{ prefix: 'tmp/', expiration: Duration.days(1) }, { noncurrentVersionExpiration: Duration.days(30) }],
      removalPolicy: cfg.name === 'development' ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
      autoDeleteObjects: cfg.name === 'development',
    });
  }
}
