import { Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';
import type { EnvConfig } from '../../config/environments';

/**
 * Stage 1: one general jobs queue + DLQ, plus a separate FIFO-free queue for tenant deletion so
 * destructive work is isolated, throttleable and independently alarmed.
 * Split further only when a job type needs different scaling.
 */
export class QueuesStack extends Stack {
  readonly jobsQueue: sqs.Queue;
  readonly tenantDeletionQueue: sqs.Queue;

  constructor(scope: Construct, id: string, cfg: EnvConfig, props?: StackProps) {
    super(scope, id, props);
    const mk = (name: string, visibility: Duration) => {
      const dlq = new sqs.Queue(this, `${name}Dlq`, {
        queueName: `${cfg.prefix}-${name.toLowerCase()}-dlq`,
        retentionPeriod: Duration.days(14),
        encryption: sqs.QueueEncryption.SQS_MANAGED,
        enforceSSL: true,
      });
      return new sqs.Queue(this, name, {
        queueName: `${cfg.prefix}-${name.toLowerCase()}`,
        visibilityTimeout: visibility,
        encryption: sqs.QueueEncryption.SQS_MANAGED,
        enforceSSL: true,
        deadLetterQueue: { queue: dlq, maxReceiveCount: 5 },
      });
    };
    this.jobsQueue = mk('Jobs', Duration.minutes(5));
    this.tenantDeletionQueue = mk('TenantDeletion', Duration.minutes(15));
  }
}
