/**
 * Per-environment settings. Environments never share resources: each gets its own VPC,
 * database, bucket, user pool, queues, secrets and ECS services.
 *
 * - `preproduction`: the only deployed environment during the MVP pilot. Sized to the bare
 *   minimum (< US$50/month, see docs/architecture/aws.md). Real pilot users, but disposable:
 *   it is torn down once `production` exists. Local development runs on docker compose.
 * - `production-scale`: the original production sizing (Multi-AZ NAT, Aurora with a reader,
 *   ALB + WAF, separate worker and dashboard services). Kept as a disabled profile so
 *   scaling up is a config change, not a rewrite.
 */
export type EnvName = 'preproduction' | 'production-scale';

/** Value of APP_ENV inside the containers (validated by @limon/config). */
export type AppEnv = 'preproduction' | 'production';

export type DatabaseConfig =
  /** Single RDS PostgreSQL instance. Cheapest option; no cold starts. */
  | { kind: 'rds-instance'; instanceSize: 'micro' | 'small' | 'medium'; allocatedStorageGiB: number; multiAz: boolean }
  /** Aurora PostgreSQL Serverless v2. Scales with load; minimum ACUs are always billed. */
  | { kind: 'aurora-serverless'; minAcu: number; maxAcu: number; readers: number };

export type EnvConfig = {
  name: EnvName;
  appEnv: AppEnv;
  account?: string;
  region: string;
  prefix: string;
  /** Availability zones for the VPC. 2 is the minimum for API Gateway VPC links, ALBs and RDS subnet groups. */
  maxAzs: number;
  /**
   * Outbound internet for the tasks (Cognito, Stripe, Sentry, FatSecret…). Tasks always run in
   * private subnets, so egress always leaves from a fixed IP — FatSecret only accepts
   * whitelisted IPs.
   * `nat-instance`: one t4g.nano NAT instance with an Elastic IP (≈ US$7/month, single AZ).
   * `nat-gateway`: managed NAT gateways (≈ US$33/month each + data processing).
   */
  egress: { kind: 'nat-instance' } | { kind: 'nat-gateway'; count: number };
  database: DatabaseConfig;
  /** Database deletion protection and final snapshot / retention behaviour. */
  protectData: boolean;
  backupRetentionDays: number;
  /**
   * `http-api`: API Gateway HTTP API → VPC link → ECS (Cloud Map). Pay per request, no hourly charge.
   * `alb`: Application Load Balancer (hourly + LCU + public IPv4 per AZ).
   */
  ingress: 'http-api' | 'alb';
  /** Regional AWS WAF on the ALB. Only applies to `ingress: 'alb'`. */
  waf: boolean;
  /** Public API hostname. The ACM certificate is validated by DNS (see docs/architecture/aws.md). */
  apiDomain?: {
    name: string;
    /** Set only if the domain's DNS is hosted in Route 53; otherwise records are created by hand. */
    route53?: { hostedZoneId: string; zoneName: string };
  };
  api: { desiredCount: number; cpu: number; memoryMiB: number };
  /** `sidecar`: queue consumer runs as a second container in the API task. `service`: its own ECS service. */
  worker: { mode: 'sidecar' } | { mode: 'service'; desiredCount: number };
  /** The nutritionist dashboard is not part of the MVP. */
  dashboard: { enabled: false } | { enabled: true; desiredCount: number };
  containerInsights: boolean;
  logRetentionDays: number;
  /** Explicitly opt in before resources can be synthesized. */
  allowSynth: boolean;
};

export const environments: Record<EnvName, EnvConfig> = {
  preproduction: {
    name: 'preproduction', appEnv: 'preproduction', region: 'us-east-1', prefix: 'limon-pre',
    maxAzs: 2, egress: { kind: 'nat-instance' },
    database: { kind: 'rds-instance', instanceSize: 'micro', allocatedStorageGiB: 20, multiAz: false },
    protectData: false, backupRetentionDays: 7,
    ingress: 'http-api', waf: false,
    // DNS is at Hostinger: validation and api CNAMEs are added by hand (docs/architecture/aws.md).
    apiDomain: { name: 'api.projectlimon.com' },
    api: { desiredCount: 1, cpu: 256, memoryMiB: 1024 },
    worker: { mode: 'sidecar' },
    dashboard: { enabled: false },
    containerInsights: false,
    logRetentionDays: 30,
    allowSynth: true,
  },
  'production-scale': {
    name: 'production-scale', appEnv: 'production', region: 'us-east-1', prefix: 'limon-prd',
    maxAzs: 3, egress: { kind: 'nat-gateway', count: 3 },
    database: { kind: 'aurora-serverless', minAcu: 2, maxAcu: 32, readers: 1 },
    protectData: true, backupRetentionDays: 30,
    ingress: 'alb', waf: true,
    api: { desiredCount: 3, cpu: 1024, memoryMiB: 2048 },
    worker: { mode: 'service', desiredCount: 2 },
    dashboard: { enabled: true, desiredCount: 2 },
    containerInsights: true,
    logRetentionDays: 365,
    allowSynth: false, // flip deliberately once the production account and domain exist
  },
};
