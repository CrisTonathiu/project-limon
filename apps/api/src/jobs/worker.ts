/**
 * SQS worker entrypoint (separate ECS service, same image, different command).
 * Every job is tenant-aware: the worker re-resolves tenant placement and re-checks
 * tenant status before processing, since the tenant may have changed since enqueue.
 */
import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import type { JobEnvelope, JobType } from '@limon/tenant';
import { env } from '../config/index.js';
import { createContainer, type Container } from '../infrastructure/container.js';
import { deleteTenantData } from './handlers/delete-tenant-data.js';

type Handler = (c: Container, job: JobEnvelope) => Promise<void>;
const handlers: Partial<Record<JobType, Handler>> = {
  DeleteTenantData: deleteTenantData,
  // GenerateMealPlan, GenerateShoppingList, GeneratePDF, ProcessAIRequest, SendNotification, ProcessSubscriptionEvent: deferred
};

async function main() {
  if (!env.SQS_JOBS_QUEUE_URL) {
    console.warn('SQS_JOBS_QUEUE_URL not set; worker idle.');
    return;
  }
  const c = createContainer(env);
  const sqs = new SQSClient({ region: env.AWS_REGION });
  for (;;) {
    const res = await sqs.send(new ReceiveMessageCommand({ QueueUrl: env.SQS_JOBS_QUEUE_URL, MaxNumberOfMessages: 10, WaitTimeSeconds: 20 }));
    for (const msg of res.Messages ?? []) {
      const job = JSON.parse(msg.Body ?? '{}') as JobEnvelope;
      const log = { jobId: job.jobId, type: job.type, tenantId: job.tenantId };
      const handler = handlers[job.type];
      try {
        if (!handler) throw new Error(`No handler for ${job.type}`);
        await handler(c, job);
        await sqs.send(new DeleteMessageCommand({ QueueUrl: env.SQS_JOBS_QUEUE_URL, ReceiptHandle: msg.ReceiptHandle! }));
        console.info(JSON.stringify({ msg: 'job.done', ...log }));
      } catch (err) {
        // Not deleted → SQS redelivers; after maxReceiveCount it lands in the DLQ.
        console.error(JSON.stringify({ msg: 'job.failed', ...log, error: (err as Error).message }));
      }
    }
  }
}

await main();
