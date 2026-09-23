import { Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import type * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import type * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';
import type { EnvConfig } from '../../config/environments';

/**
 * Baseline alarms. Per-tenant visibility comes from structured logs (requestId, tenantId, userId)
 * queried with CloudWatch Logs Insights — no per-tenant metrics (cardinality/cost).
 */
export class MonitoringStack extends Stack {
  constructor(scope: Construct, id: string, cfg: EnvConfig, d: { alb: elbv2.ApplicationLoadBalancer; apiService: ecs.FargateService; dlqs: sqs.IQueue[] }, props?: StackProps) {
    super(scope, id, props);
    new cloudwatch.Alarm(this, 'Api5xx', {
      alarmName: `${cfg.prefix}-api-5xx`,
      metric: d.alb.metrics.httpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, { period: Duration.minutes(5) }),
      threshold: 10, evaluationPeriods: 1,
    });
    new cloudwatch.Alarm(this, 'ApiCpu', {
      alarmName: `${cfg.prefix}-api-cpu`, metric: d.apiService.metricCpuUtilization(), threshold: 80, evaluationPeriods: 3,
    });
    d.dlqs.forEach((q, i) =>
      new cloudwatch.Alarm(this, `Dlq${i}`, {
        alarmName: `${cfg.prefix}-dlq-${i}`, metric: q.metricApproximateNumberOfMessagesVisible(), threshold: 1, evaluationPeriods: 1,
      }),
    );
    // TODO: SNS topic → email/Slack; Logs Insights saved queries by tenantId.
  }
}

