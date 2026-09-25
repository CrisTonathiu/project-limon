import { Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import type { EnvConfig } from '../../config/environments';

/**
 * Shared PostgreSQL 16 — the "MAIN" placement in the tenant registry.
 * Aurora Serverless v2 (staging/production) or a single RDS instance (development), per `cfg.database.kind`.
 * Not publicly accessible; isolated subnets; encrypted; IAM auth enabled.
 * Two credentials: owner (migrations) and app (runtime, RLS-enforced, created by migration bootstrap).
 */
export class DatabaseStack extends Stack {
  /** Owner credentials + connection info (`host`, `port`, `password`, ...), attached to the database. */
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
      deletionProtection: db.deletionProtection,
      removalPolicy: cfg.name === 'production' ? RemovalPolicy.RETAIN : RemovalPolicy.SNAPSHOT,
      cloudwatchLogsExports: ['postgresql'],
    };
    const backupRetention = Duration.days(cfg.name === 'production' ? 30 : 7);

    // Both variants use the construct id 'Aurora' so the owner secret and its attachment keep their
    // logical IDs (Aurora/Secret/...). The compute stack imports that attachment as a cross-stack export,
    // so changing its ID would block switching an environment between variants.
    if (db.kind === 'aurora-serverless') {
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
        backup: { retention: backupRetention },
      });
      this.ownerSecret = cluster.secret!;
    } else {
      const instance = new rds.DatabaseInstance(this, 'Aurora', {
        ...common,
        engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16_13 }),
        databaseName: 'limon',
        instanceType: new ec2.InstanceType(db.instanceType),
        allocatedStorage: db.allocatedStorageGiB,
        storageType: rds.StorageType.GP3,
        multiAz: false,
        publiclyAccessible: false,
        backupRetention,
      });
      // The cluster variant's logical ID is taken by an AWS::RDS::DBCluster; CloudFormation cannot change a
      // resource's type in place, so the instance needs its own.
      (instance.node.defaultChild as rds.CfnDBInstance).overrideLogicalId('PostgresInstance');
      this.ownerSecret = instance.secret!;
    }

    this.appUserSecret = new secretsmanager.Secret(this, 'AppUserSecret', {
      secretName: `${cfg.prefix}/db/app`,
      generateSecretString: { secretStringTemplate: JSON.stringify({ username: 'limon_app' }), generateStringKey: 'password', excludePunctuation: true },
    });
  }
}
