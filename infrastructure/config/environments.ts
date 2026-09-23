/**
 * Per-environment settings. development/staging/production never share resources:
 * each gets its own VPC, Aurora cluster, bucket, user pool, queues, secrets and ECS services.
 * Recommended: separate AWS accounts per environment (AWS Organizations).
 */
export type EnvName = 'development' | 'staging' | 'production';

export type EnvConfig = {
  name: EnvName;
  account?: string;
  region: string;
  prefix: string;
  natGateways: number;
  aurora: { minAcu: number; maxAcu: number; readers: number; deletionProtection: boolean };
  api: { desiredCount: number; cpu: number; memoryMiB: number };
  dashboard: { desiredCount: number };
  worker: { desiredCount: number };
  logRetentionDays: number;
  /** Explicitly opt in before production resources can be synthesized. */
  allowSynth: boolean;
};

export const environments: Record<EnvName, EnvConfig> = {
  development: {
    name: 'development', region: 'us-east-1', prefix: 'limon-dev', natGateways: 1,
    aurora: { minAcu: 0.5, maxAcu: 2, readers: 0, deletionProtection: false },
    api: { desiredCount: 1, cpu: 512, memoryMiB: 1024 }, dashboard: { desiredCount: 1 }, worker: { desiredCount: 1 },
    logRetentionDays: 14, allowSynth: true,
  },
  staging: {
    name: 'staging', region: 'us-east-1', prefix: 'limon-stg', natGateways: 1,
    aurora: { minAcu: 0.5, maxAcu: 4, readers: 0, deletionProtection: true },
    api: { desiredCount: 2, cpu: 512, memoryMiB: 1024 }, dashboard: { desiredCount: 1 }, worker: { desiredCount: 1 },
    logRetentionDays: 30, allowSynth: true,
  },
  production: {
    name: 'production', region: 'us-east-1', prefix: 'limon-prd', natGateways: 3,
    aurora: { minAcu: 2, maxAcu: 32, readers: 1, deletionProtection: true },
    api: { desiredCount: 3, cpu: 1024, memoryMiB: 2048 }, dashboard: { desiredCount: 2 }, worker: { desiredCount: 2 },
    logRetentionDays: 365,
    allowSynth: false, // flip deliberately after staging has been validated
  },
};
