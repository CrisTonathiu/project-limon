import { Duration, Stack, type StackProps } from 'aws-cdk-lib';
import type * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import type * as rds from 'aws-cdk-lib/aws-rds';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type * as sqs from 'aws-cdk-lib/aws-sqs';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import type { Construct } from 'constructs';
import type { EnvConfig } from '../../config/environments';

type Deps = {
  vpc: ec2.IVpc;
  albSg: ec2.ISecurityGroup;
  appSg: ec2.ISecurityGroup;
  cluster: rds.DatabaseCluster;
  appUserSecret: secretsmanager.ISecret;
  tenantBucket: s3.IBucket;
  jobsQueue: sqs.IQueue;
  tenantDeletionQueue: sqs.IQueue;
  userPoolId: string;
  dashboardClientId: string;
  patientClientId: string;
};

/**
 * ECS Fargate: three SHARED services (api, dashboard, worker). Never one per tenant.
 * CloudFront distribution + ACM certificate/domain are added once domains are decided (see aws.md).
 */
export class ComputeStack extends Stack {
  readonly alb: elbv2.ApplicationLoadBalancer;
  readonly apiService: ecs.FargateService;

  constructor(scope: Construct, id: string, cfg: EnvConfig, d: Deps, props?: StackProps) {
    super(scope, id, props);
    const cluster = new ecs.Cluster(this, 'Cluster', { vpc: d.vpc, clusterName: cfg.prefix, containerInsightsV2: ecs.ContainerInsights.ENABLED });

    const commonEnv = {
      APP_ENV: cfg.name,
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
    // DATABASE_URL is assembled at container start from these secret fields (entrypoint script, TODO).
    const dbSecrets = {
      DB_APP_PASSWORD: ecs.Secret.fromSecretsManager(d.appUserSecret, 'password'),
      DB_HOST: ecs.Secret.fromSecretsManager(d.cluster.secret!, 'host'),
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
      new logs.LogGroup(this, `${name}Logs`, { logGroupName: `/${cfg.prefix}/${name}`, retention: cfg.logRetentionDays as unknown as logs.RetentionDays });

    // Placeholder image until CI pushes api/dashboard images to ECR (see .github/workflows).
    const image = (_name: 'api' | 'dashboard') => ecs.ContainerImage.fromRegistry('public.ecr.aws/docker/library/node:22-alpine');

    // API
    const apiTd = taskDef('Api', cfg.api.cpu, cfg.api.memoryMiB);
    apiTd.addContainer('api', {
      image: image('api'),
      command: ['node', 'dist/server.js'],
      environment: { ...commonEnv, API_PORT: '4000' },
      secrets: dbSecrets,
      portMappings: [{ containerPort: 4000 }],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'api', logGroup: logGroup('api') }),
      healthCheck: { command: ['CMD-SHELL', 'wget -qO- http://localhost:4000/health || exit 1'], interval: Duration.seconds(30) },
    });
    d.jobsQueue.grantSendMessages(apiTd.taskRole);
    d.tenantDeletionQueue.grantSendMessages(apiTd.taskRole);
    this.apiService = new ecs.FargateService(this, 'ApiService', {
      cluster, taskDefinition: apiTd, desiredCount: cfg.api.desiredCount, securityGroups: [d.appSg],
      vpcSubnets: { subnets: d.vpc.privateSubnets }, assignPublicIp: false, circuitBreaker: { rollback: true }, minHealthyPercent: 100,
    });

    // Dashboard
    const dashTd = taskDef('Dashboard', 512, 1024);
    dashTd.addContainer('dashboard', {
      image: image('dashboard'),
      command: ['node', 'apps/dashboard/server.js'],
      environment: { NODE_ENV: 'production', PORT: '3000' },
      portMappings: [{ containerPort: 3000 }],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'dashboard', logGroup: logGroup('dashboard') }),
    });
    const dashboardService = new ecs.FargateService(this, 'DashboardService', {
      cluster, taskDefinition: dashTd, desiredCount: cfg.dashboard.desiredCount, securityGroups: [d.appSg],
      vpcSubnets: { subnets: d.vpc.privateSubnets }, assignPublicIp: false, circuitBreaker: { rollback: true }, minHealthyPercent: 100,
    });

    // Worker (same image as API, different command)
    const workerTd = taskDef('Worker', 512, 1024);
    workerTd.addContainer('worker', {
      image: image('api'),
      command: ['node', 'dist/jobs/worker.js'],
      environment: commonEnv,
      secrets: dbSecrets,
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'worker', logGroup: logGroup('worker') }),
    });
    d.jobsQueue.grantConsumeMessages(workerTd.taskRole);
    d.tenantDeletionQueue.grantConsumeMessages(workerTd.taskRole);
    new ecs.FargateService(this, 'WorkerService', {
      cluster, taskDefinition: workerTd, desiredCount: cfg.worker.desiredCount, securityGroups: [d.appSg],
      vpcSubnets: { subnets: d.vpc.privateSubnets }, assignPublicIp: false, circuitBreaker: { rollback: true }, minHealthyPercent: 100,
    });

    // ALB
    this.alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', { vpc: d.vpc, internetFacing: true, securityGroup: d.albSg, dropInvalidHeaderFields: true });
    // HTTP listener for the skeleton only; production requires HTTPS listener + ACM cert + redirect.
    const listener = this.alb.addListener('Http', { port: 80, open: false, defaultAction: elbv2.ListenerAction.fixedResponse(404) });
    listener.addTargets('Api', {
      priority: 10, conditions: [elbv2.ListenerCondition.pathPatterns(['/api/*', '/health'])],
      port: 4000, protocol: elbv2.ApplicationProtocol.HTTP, targets: [this.apiService], healthCheck: { path: '/health' },
    });
    listener.addTargets('Dashboard', {
      priority: 20, conditions: [elbv2.ListenerCondition.pathPatterns(['/*'])],
      port: 3000, protocol: elbv2.ApplicationProtocol.HTTP, targets: [dashboardService], healthCheck: { path: '/login' },
    });

    // WAF (regional, on ALB). CloudFront-scoped WAF comes with the distribution.
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
    new wafv2.CfnWebACLAssociation(this, 'WafAssoc', { resourceArn: this.alb.loadBalancerArn, webAclArn: waf.attrArn });
  }
}

function managedRule(name: string, priority: number): wafv2.CfnWebACL.RuleProperty {
  return {
    name, priority, overrideAction: { none: {} },
    statement: { managedRuleGroupStatement: { vendorName: 'AWS', name } },
    visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: name, sampledRequestsEnabled: true },
  };
}
