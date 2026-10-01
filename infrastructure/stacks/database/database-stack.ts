import { Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import type { EnvConfig } from '../../config/environments';

const INSTANCE_SIZES = { micro: ec2.InstanceSize.MICRO, small: ec2.InstanceSize.SMALL, medium: ec2.InstanceSize.MEDIUM } as const;

/**
 * Shared PostgreSQL — the "MAIN" placement in the tenant registry. Either a single RDS
 * instance (preproduction) or Aurora Serverless v2 (production-scale); the application,
 * Prisma and the RLS policies are identical on both.
 * Not publicly accessible; isolated subnets; encrypted; IAM auth enabled.
 * Two credentials: owner (migrations) and app (runtime, RLS-enforced, created by migration bootstrap).
 */
export class DatabaseStack extends Stack {
  /** Owner credentials; the attached secret also carries `host` and `port`. */
  readonly ownerSecret: secretsmanager.ISecret;
  readonly appUserSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, cfg: EnvConfig, deps: { vpc: ec2.IVpc; dbSg: ec2.ISecurityGroup }, props?: StackProps) {
    super(scope, id, props);
    const db = cfg.database;
    const common = {
      credentials: rds.Credentials.fromGeneratedSecret('limon_owner', { secretName: `${cfg.prefix}/db/owner` }),
      vpc: deps.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [deps.dbSg],
      storageEncrypted: true,
      iamAuthentication: true,
      deletionProtection: cfg.protectData,
      // SNAPSHOT keeps a final snapshot even for the disposable environment: it holds pilot health data.
      removalPolicy: cfg.protectData ? RemovalPolicy.RETAIN : RemovalPolicy.SNAPSHOT,
      cloudwatchLogsExports: ['postgresql'],
    };

    if (db.kind === 'rds-instance') {
      const instance = new rds.DatabaseInstance(this, 'Postgres', {
        ...common,
        engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16_13 }),
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE4_GRAVITON, INSTANCE_SIZES[db.instanceSize]),
        databaseName: 'limon',
        allocatedStorage: db.allocatedStorageGiB,
        maxAllocatedStorage: db.allocatedStorageGiB * 2,
        storageType: rds.StorageType.GP3,
        multiAz: db.multiAz,
        publiclyAccessible: false,
        backupRetention: Duration.days(cfg.backupRetentionDays),
        enablePerformanceInsights: false,
      });
      this.ownerSecret = instance.secret!;
    } else {
      const cluster = new rds.DatabaseCluster(this, 'Aurora', {
        ...common,
        // 16.4 was removed from AWS's available engine versions after this was originally written.
        engine: rds.DatabaseClusterEngine.auroraPostgres({ version: rds.AuroraPostgresEngineVersion.VER_16_13 }),
        defaultDatabaseName: 'limon',
        serverlessV2MinCapacity: db.minAcu,
        serverlessV2MaxCapacity: db.maxAcu,
        writer: rds.ClusterInstance.serverlessV2('writer', { publiclyAccessible: false }),
        readers: Array.from({ length: db.readers }, (_, i) =>
          rds.ClusterInstance.serverlessV2(`reader${i}`, { scaleWithWriter: true, publiclyAccessible: false }),
        ),
        backup: { retention: Duration.days(cfg.backupRetentionDays) },
      });
      this.ownerSecret = cluster.secret!;
    }

    this.appUserSecret = new secretsmanager.Secret(this, 'AppUserSecret', {
      secretName: `${cfg.prefix}/db/app`,
      generateSecretString: { secretStringTemplate: JSON.stringify({ username: 'limon_app' }), generateStringKey: 'password', excludePunctuation: true },
    });
  }
}
