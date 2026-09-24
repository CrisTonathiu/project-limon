import { Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import type { EnvConfig } from '../../config/environments';

/**
 * Shared Aurora PostgreSQL (Serverless v2) — the "MAIN" placement in the tenant registry.
 * Not publicly accessible; isolated subnets; encrypted; IAM auth enabled.
 * Two credentials: owner (migrations) and app (runtime, RLS-enforced, created by migration bootstrap).
 */
export class DatabaseStack extends Stack {
  readonly cluster: rds.DatabaseCluster;
  readonly appUserSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, cfg: EnvConfig, deps: { vpc: ec2.IVpc; dbSg: ec2.ISecurityGroup }, props?: StackProps) {
    super(scope, id, props);
    this.cluster = new rds.DatabaseCluster(this, 'Aurora', {
      // 16.4 was removed from AWS's available engine versions after this was originally written.
      engine: rds.DatabaseClusterEngine.auroraPostgres({ version: rds.AuroraPostgresEngineVersion.VER_16_13 }),
      credentials: rds.Credentials.fromGeneratedSecret('limon_owner', { secretName: `${cfg.prefix}/db/owner` }),
      defaultDatabaseName: 'limon',
      vpc: deps.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [deps.dbSg],
      serverlessV2MinCapacity: cfg.aurora.minAcu,
      serverlessV2MaxCapacity: cfg.aurora.maxAcu,
      writer: rds.ClusterInstance.serverlessV2('writer', { publiclyAccessible: false }),
      readers: Array.from({ length: cfg.aurora.readers }, (_, i) =>
        rds.ClusterInstance.serverlessV2(`reader${i}`, { scaleWithWriter: true, publiclyAccessible: false }),
      ),
      storageEncrypted: true,
      iamAuthentication: true,
      backup: { retention: Duration.days(cfg.name === 'production' ? 30 : 7) },
      deletionProtection: cfg.aurora.deletionProtection,
      removalPolicy: cfg.name === 'production' ? RemovalPolicy.RETAIN : RemovalPolicy.SNAPSHOT,
      cloudwatchLogsExports: ['postgresql'],
    });

    this.appUserSecret = new secretsmanager.Secret(this, 'AppUserSecret', {
      secretName: `${cfg.prefix}/db/app`,
      generateSecretString: { secretStringTemplate: JSON.stringify({ username: 'limon_app' }), generateStringKey: 'password', excludePunctuation: true },
    });
  }
}

