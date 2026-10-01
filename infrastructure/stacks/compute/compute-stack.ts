import * as path from 'node:path';
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpServiceDiscoveryIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import type * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import type * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as servicediscovery from 'aws-cdk-lib/aws-servicediscovery';
import type * as sqs from 'aws-cdk-lib/aws-sqs';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import type { Construct } from 'constructs';
import type { EnvConfig } from '../../config/environments';

type Deps = {
  vpc: ec2.IVpc;
  ingressSg: ec2.ISecurityGroup;
  appSg: ec2.ISecurityGroup;
  dbOwnerSecret: secretsmanager.ISecret;
  appUserSecret: secretsmanager.ISecret;
  tenantBucket: s3.IBucket;
  jobsQueue: sqs.IQueue;
  tenantDeletionQueue: sqs.IQueue;
  userPoolId: string;
  dashboardClientId: string;
  patientClientId: string;
};

/**
 * ECS Fargate: SHARED services only (api, optional worker, optional dashboard). Never one per tenant.
 *
 * Ingress (`cfg.ingress`):
 * - `http-api`: API Gateway HTTP API → VPC link → Cloud Map (SRV) → API tasks. No hourly
 *   charge; stage throttling stands in for WAF rate limiting.
 * - `alb`: ALB (+ optional regional WAF) → API / dashboard target groups.
 * Either way, `cfg.apiDomain` gets an ACM certificate (DNS-validated) and a custom domain.
 */
export class ComputeStack extends Stack {
  readonly apiService: ecs.FargateService;
  /** 5xx count metric of whichever ingress is in front of the API (for alarms). */
  readonly api5xxMetric: cloudwatch.IMetric;

  constructor(scope: Construct, id: string, cfg: EnvConfig, d: Deps, props?: StackProps) {
    super(scope, id, props);
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: d.vpc, clusterName: cfg.prefix,
      containerInsightsV2: cfg.containerInsights ? ecs.ContainerInsights.ENABLED : ecs.ContainerInsights.DISABLED,
    });
    // Private subnets; egress goes through the NAT (fixed IPs, whitelisted at FatSecret).
    const placement = {
      securityGroups: [d.appSg],
      vpcSubnets: { subnets: d.vpc.privateSubnets },
      assignPublicIp: false,
    };

    const commonEnv = {
      APP_ENV: cfg.appEnv,
      NODE_ENV: 'production',
      AUTH_PROVIDER: 'cognito',
      AWS_REGION: cfg.region,
      COGNITO_REGION: cfg.region,
      COGNITO_USER_POOL_ID: d.userPoolId,
      COGNITO_NUTRITIONIST_CLIENT_ID: d.dashboardClientId,
      COGNITO_PATIENT_CLIENT_ID: d.patientClientId,
      S3_TENANT_BUCKET: d.tenantBucket.bucketName,
      SQS_JOBS_QUEUE_URL: d.jobsQueue.queueUrl,
    };
    // FatSecret API credentials. Created with empty values (the API then runs without FatSecret);
    // fill them in the console and force a new deployment (docs/architecture/aws.md).
    const fatsecret = new secretsmanager.Secret(this, 'FatSecretCredentials', {
      secretName: `${cfg.prefix}/fatsecret`,
      generateSecretString: { secretStringTemplate: JSON.stringify({ client_id: '', client_secret: '' }), generateStringKey: 'unused' },
    });
    // DATABASE_URL is assembled at container start from these secret fields (lib/bootstrap-database-url).
    const appSecrets = {
      DB_APP_PASSWORD: ecs.Secret.fromSecretsManager(d.appUserSecret, 'password'),
      DB_HOST: ecs.Secret.fromSecretsManager(d.dbOwnerSecret, 'host'),
      FATSECRET_CLIENT_ID: ecs.Secret.fromSecretsManager(fatsecret, 'client_id'),
      FATSECRET_CLIENT_SECRET: ecs.Secret.fromSecretsManager(fatsecret, 'client_secret'),
    };

    const taskDef = (name: string, cpu: number, memoryLimitMiB: number) => {
      const td = new ecs.FargateTaskDefinition(this, `${name}Task`, { cpu, memoryLimitMiB, runtimePlatform: { cpuArchitecture: ecs.CpuArchitecture.ARM64 } });
      d.tenantBucket.grantReadWrite(td.taskRole);
      td.taskRole.addToPrincipalPolicy(
        new iam.PolicyStatement({ actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'], resources: ['*'] }), // TODO scope to model ARNs
      );
      td.taskRole.addToPrincipalPolicy(new iam.PolicyStatement({ actions: ['ses:SendEmail'], resources: ['*'] }));
      return td;
    };
    const logGroup = (name: string) =>
      new logs.LogGroup(this, `${name}Logs`, {
        logGroupName: `/${cfg.prefix}/${name}`,
        retention: cfg.logRetentionDays as unknown as logs.RetentionDays,
        // RETAIN (the default) orphans the group on stack rollback/deletion, blocking recreation
        // until it's deleted manually — but DESTROY loses crash logs the moment a rollback
        // starts, which is worse while actively debugging deploys. Keeping RETAIN everywhere;
        // `aws logs delete-log-group --log-group-name /<prefix>/<name>` before a retry if needed.
        removalPolicy: RemovalPolicy.RETAIN,
      });

    // CDK builds each Dockerfile locally and pushes it to the bootstrap-created asset ECR
    // repo as part of `cdk deploy` — no separate CI/ECR pipeline needed for this stage.
    const repoRoot = path.join(__dirname, '../../..');
    const image = (name: 'api' | 'dashboard') =>
      ecs.ContainerImage.fromAsset(repoRoot, { file: `apps/${name}/Dockerfile`, platform: Platform.LINUX_ARM64 });

    // Worker container definition (same image as API, different command).
    const addWorkerContainer = (td: ecs.FargateTaskDefinition, essential: boolean) => {
      td.addContainer('worker', {
        image: image('api'),
        command: ['node', 'dist/jobs/worker.js'],
        environment: commonEnv,
        secrets: appSecrets,
        essential,
        logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'worker', logGroup: logGroup('worker') }),
      });
      d.jobsQueue.grantConsumeMessages(td.taskRole);
      d.tenantDeletionQueue.grantConsumeMessages(td.taskRole);
    };

    // API
    const apiTd = taskDef('Api', cfg.api.cpu, cfg.api.memoryMiB);
    const apiContainer = apiTd.addContainer('api', {
      image: image('api'),
      command: ['node', 'dist/server.js'],
      environment: { ...commonEnv, API_PORT: '4000' },
      secrets: appSecrets,
      portMappings: [{ containerPort: 4000 }],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'api', logGroup: logGroup('api') }),
      healthCheck: { command: ['CMD-SHELL', 'wget -qO- http://localhost:4000/health || exit 1'], interval: Duration.seconds(30) },
    });
    d.jobsQueue.grantSendMessages(apiTd.taskRole);
    d.tenantDeletionQueue.grantSendMessages(apiTd.taskRole);
    // Sidecar worker shares the API task's CPU/memory. Non-essential: a crashing consumer must
    // not take the API down with it (failed jobs still land in the DLQ, which is alarmed).
    if (cfg.worker.mode === 'sidecar') addWorkerContainer(apiTd, false);

    // HTTP API integrates through Cloud Map; SRV records carry the task's port.
    const namespace = cfg.ingress === 'http-api'
      ? new servicediscovery.PrivateDnsNamespace(this, 'Namespace', { name: `${cfg.prefix}.internal`, vpc: d.vpc })
      : undefined;
    this.apiService = new ecs.FargateService(this, 'ApiService', {
      cluster, taskDefinition: apiTd, desiredCount: cfg.api.desiredCount, ...placement,
      circuitBreaker: { rollback: true }, minHealthyPercent: 100,
      cloudMapOptions: namespace
        ? { cloudMapNamespace: namespace, name: 'api', dnsRecordType: servicediscovery.DnsRecordType.SRV, container: apiContainer, containerPort: 4000 }
        : undefined,
    });

    // Separate worker service (production-scale)
    if (cfg.worker.mode === 'service') {
      const workerTd = taskDef('Worker', 512, 1024);
      addWorkerContainer(workerTd, true);
      new ecs.FargateService(this, 'WorkerService', {
        cluster, taskDefinition: workerTd, desiredCount: cfg.worker.desiredCount, ...placement,
        circuitBreaker: { rollback: true }, minHealthyPercent: 100,
      });
    }

    // One-off DB bootstrap: creates the limon_app role, runs migrations, seeds tenants.
    // Not a service — no desiredCount, no ingress. Invoke manually after each deploy via
    // `aws ecs run-task` (see docs/architecture/aws.md), using the TaskSubnetIds/AppSecurityGroupId outputs.
    const migrateTd = new ecs.FargateTaskDefinition(this, 'MigrateTask', { cpu: 512, memoryLimitMiB: 1024, runtimePlatform: { cpuArchitecture: ecs.CpuArchitecture.ARM64 } });
    migrateTd.addContainer('migrate', {
      image: ecs.ContainerImage.fromAsset(repoRoot, { file: 'packages/database/Dockerfile', platform: Platform.LINUX_ARM64 }),
      environment: { AWS_REGION: cfg.region },
      secrets: {
        DB_HOST: ecs.Secret.fromSecretsManager(d.dbOwnerSecret, 'host'),
        DB_OWNER_PASSWORD: ecs.Secret.fromSecretsManager(d.dbOwnerSecret, 'password'),
        DB_APP_PASSWORD: ecs.Secret.fromSecretsManager(d.appUserSecret, 'password'),
      },
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'migrate', logGroup: logGroup('migrate') }),
    });

    // Custom domain certificate. Without a Route 53 zone, CloudFormation waits on the
    // validation CNAME, which must be added at the DNS provider during the first deploy.
    const zone = cfg.apiDomain?.route53
      ? route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', cfg.apiDomain.route53)
      : undefined;
    const certificate = cfg.apiDomain
      ? new acm.Certificate(this, 'ApiCertificate', { domainName: cfg.apiDomain.name, validation: acm.CertificateValidation.fromDns(zone) })
      : undefined;

    if (cfg.ingress === 'http-api') {
      const vpcLink = new apigwv2.VpcLink(this, 'VpcLink', {
        vpc: d.vpc, subnets: { subnets: d.vpc.publicSubnets }, securityGroups: [d.ingressSg],
      });
      const domainName = cfg.apiDomain && certificate
        ? new apigwv2.DomainName(this, 'ApiDomain', { domainName: cfg.apiDomain.name, certificate })
        : undefined;
      const httpApi = new apigwv2.HttpApi(this, 'PublicApi', {
        apiName: `${cfg.prefix}-api`,
        createDefaultStage: false,
        // With a custom domain, clients must use it (TLS cert, stable URL); the execute-api URL is disabled.
        disableExecuteApiEndpoint: !!domainName,
        defaultIntegration: new HttpServiceDiscoveryIntegration('ApiIntegration', this.apiService.cloudMapService!, { vpcLink }),
      });
      httpApi.addStage('PublicStage', {
        stageName: '$default', autoDeploy: true,
        // Account-wide coarse limit standing in for WAF; per-route limits stay in Fastify.
        throttle: { rateLimit: 50, burstLimit: 100 },
        domainMapping: domainName ? { domainName } : undefined,
      });
      this.api5xxMetric = httpApi.metricServerError({ period: Duration.minutes(5) });

      if (domainName) {
        if (zone) {
          new route53.ARecord(this, 'ApiAlias', {
            zone, recordName: cfg.apiDomain!.name,
            target: route53.RecordTarget.fromAlias(new targets.ApiGatewayv2DomainProperties(domainName.regionalDomainName, domainName.regionalHostedZoneId)),
          });
        }
        // External DNS: CNAME <apiDomain> → this value.
        new CfnOutput(this, 'ApiDomainDnsTarget', { value: domainName.regionalDomainName });
        new CfnOutput(this, 'ApiBaseUrl', { value: `https://${cfg.apiDomain!.name}` });
      } else {
        new CfnOutput(this, 'ApiBaseUrl', { value: httpApi.apiEndpoint });
      }
    } else {
      const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', { vpc: d.vpc, internetFacing: true, securityGroup: d.ingressSg, dropInvalidHeaderFields: true });
      const listener = certificate
        ? alb.addListener('Https', { port: 443, certificates: [certificate], open: false, defaultAction: elbv2.ListenerAction.fixedResponse(404) })
        : alb.addListener('Http', { port: 80, open: false, defaultAction: elbv2.ListenerAction.fixedResponse(404) });
      listener.addTargets('Api', {
        priority: 10, conditions: [elbv2.ListenerCondition.pathPatterns(['/api/*', '/health'])],
        port: 4000, protocol: elbv2.ApplicationProtocol.HTTP, targets: [this.apiService], healthCheck: { path: '/health' },
      });

      if (cfg.dashboard.enabled) {
        const dashTd = taskDef('Dashboard', 512, 1024);
        dashTd.addContainer('dashboard', {
          image: image('dashboard'),
          command: ['node', 'apps/dashboard/server.js'],
          environment: { NODE_ENV: 'production', PORT: '3000' },
          portMappings: [{ containerPort: 3000 }],
          logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'dashboard', logGroup: logGroup('dashboard') }),
        });
        const dashboardService = new ecs.FargateService(this, 'DashboardService', {
          cluster, taskDefinition: dashTd, desiredCount: cfg.dashboard.desiredCount, ...placement,
          circuitBreaker: { rollback: true }, minHealthyPercent: 100,
        });
        listener.addTargets('Dashboard', {
          priority: 20, conditions: [elbv2.ListenerCondition.pathPatterns(['/*'])],
          port: 3000, protocol: elbv2.ApplicationProtocol.HTTP, targets: [dashboardService], healthCheck: { path: '/login' },
        });
      }

      if (cfg.waf) {
        const waf = new wafv2.CfnWebACL(this, 'Waf', {
          scope: 'REGIONAL',
          defaultAction: { allow: {} },
          visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: `${cfg.prefix}-waf`, sampledRequestsEnabled: true },
          rules: [
            managedRule('AWSManagedRulesCommonRuleSet', 1),
            managedRule('AWSManagedRulesKnownBadInputsRuleSet', 2),
            {
              name: 'RateLimitPerIp', priority: 10, action: { block: {} },
              statement: { rateBasedStatement: { limit: 2000, aggregateKeyType: 'IP' } },
              visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: 'rate-limit', sampledRequestsEnabled: true },
            },
          ],
        });
        new wafv2.CfnWebACLAssociation(this, 'WafAssoc', { resourceArn: alb.loadBalancerArn, webAclArn: waf.attrArn });
      }

      this.api5xxMetric = alb.metrics.httpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, { period: Duration.minutes(5) });
      if (zone && cfg.apiDomain) {
        new route53.ARecord(this, 'ApiAlias', { zone, recordName: cfg.apiDomain.name, target: route53.RecordTarget.fromAlias(new targets.LoadBalancerTarget(alb)) });
      }
      new CfnOutput(this, 'AlbDnsName', { value: alb.loadBalancerDnsName });
      new CfnOutput(this, 'ApiBaseUrl', { value: cfg.apiDomain ? `https://${cfg.apiDomain.name}` : `http://${alb.loadBalancerDnsName}` });
    }

    // Used by the `aws ecs run-task` command that runs the one-off DB bootstrap above.
    new CfnOutput(this, 'ClusterName', { value: cluster.clusterName });
    new CfnOutput(this, 'MigrateTaskDefinitionArn', { value: migrateTd.taskDefinitionArn });
    new CfnOutput(this, 'AppSecurityGroupId', { value: d.appSg.securityGroupId });
    new CfnOutput(this, 'TaskSubnetIds', { value: placement.vpcSubnets.subnets.map((s) => s.subnetId).join(',') });
  }
}

function managedRule(name: string, priority: number): wafv2.CfnWebACL.RuleProperty {
  return {
    name, priority, overrideAction: { none: {} },
    statement: { managedRuleGroupStatement: { vendorName: 'AWS', name } },
    visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: name, sampledRequestsEnabled: true },
  };
}
