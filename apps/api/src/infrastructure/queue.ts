import { randomUUID } from 'node:crypto';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import type { ServerEnv } from '@limon/config';
import type { JobEnvelope, JobType } from '@limon/tenant';

export interface JobPublisher {
  publish<T>(job: { type: JobType; tenantId: string; actorUserId: string | null; payload: T; requestId?: string; resource?: JobEnvelope['resource'] }): Promise<string>;
}

class SqsJobPublisher implements JobPublisher {
  private readonly sqs: SQSClient;
  constructor(private readonly queueUrl: string, region: string) {
    this.sqs = new SQSClient({ region });
  }
  async publish<T>(job: Parameters<JobPublisher['publish']>[0] & { payload: T }): Promise<string> {
    const envelope: JobEnvelope<T> = { jobId: randomUUID(), enqueuedAt: new Date().toISOString(), attempt: 0, ...job };
    await this.sqs.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(envelope),
        MessageAttributes: {
          jobType: { DataType: 'String', StringValue: job.type },
          tenantId: { DataType: 'String', StringValue: job.tenantId },
        },
      }),
    );
    return envelope.jobId;
  }
}

/** Local dev without SQS: jobs are logged, not executed. */
class LoggingJobPublisher implements JobPublisher {
  async publish(job: Parameters<JobPublisher['publish']>[0]): Promise<string> {
    const id = randomUUID();
    console.info(JSON.stringify({ msg: 'job.enqueued(local)', jobId: id, type: job.type, tenantId: job.tenantId }));
    return id;
  }
}

export function createJobPublisher(env: ServerEnv): JobPublisher {
  return env.SQS_JOBS_QUEUE_URL ? new SqsJobPublisher(env.SQS_JOBS_QUEUE_URL, env.AWS_REGION) : new LoggingJobPublisher();
}
