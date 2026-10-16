/**
 * The `worker` Cloud Run service: private (IAM only), so only the `pubsub-push` and
 * `scheduler` service accounts can call it and no auth code is needed here.
 *
 * - POST /jobs: a Pub/Sub push. 2xx acknowledges it; any other status is retried with
 *   backoff, and after 5 attempts the message goes to the `jobs-dlq` topic.
 * - POST /maintenance/*: called by Cloud Scheduler.
 *
 * Every job is tenant-aware: handlers re-resolve tenant placement and re-check tenant
 * status before processing, since the tenant may have changed since enqueue.
 */
import type { JobEnvelope } from '@limon/tenant';
import Fastify from 'fastify';
import { z } from 'zod';
import type { Container } from '../infrastructure/container.js';
import { maintainFoodCache } from './food-cache-maintenance.js';
import { runJob } from './run-job.js';

/** https://cloud.google.com/pubsub/docs/push#receive_push */
const PushRequest = z.object({
  message: z.object({ data: z.string(), messageId: z.string() }),
  /** Set when the subscription has a dead-letter policy; 1 on the first delivery. */
  deliveryAttempt: z.number().int().positive().optional(),
});

const Envelope = z.object({
  jobId: z.string(),
  type: z.string(),
  tenantId: z.string(),
});

export async function buildWorkerApp(c: Container, opts: { runJob?: typeof runJob } = {}) {
  const run = opts.runJob ?? runJob;
  const app = Fastify({
    logger: {
      level: 'info',
      // Structured JSON → Cloud Logging. Never log bodies: job payloads are ids only, but stay safe.
      redact: ['req.headers.authorization'],
    },
  });

  app.get('/health', async () => ({ status: 'ok' }));

  app.post('/jobs', async (req, reply) => {
    const push = PushRequest.safeParse(req.body);
    let job: JobEnvelope | null = null;
    if (push.success) {
      try {
        const decoded: unknown = JSON.parse(Buffer.from(push.data.message.data, 'base64').toString('utf8'));
        if (Envelope.safeParse(decoded).success) job = decoded as JobEnvelope;
      } catch {
        // falls through to the 400 below
      }
    }
    if (!push.success || !job) {
      // Still nacked: after 5 attempts it lands in jobs-dlq, where it can be inspected.
      req.log.error({ messageId: push.success ? push.data.message.messageId : undefined }, 'job.malformed');
      return reply.status(400).send();
    }

    job = { ...job, attempt: (push.data.deliveryAttempt ?? 1) - 1 };
    const log = { jobId: job.jobId, type: job.type, tenantId: job.tenantId, attempt: job.attempt };
    try {
      await run(c, job);
      req.log.info({ ...log }, 'job.done');
      return reply.status(204).send();
    } catch (err) {
      req.log.error({ ...log, error: (err as Error).message }, 'job.failed');
      return reply.status(500).send();
    }
  });

  // Every 15 minutes. A run that outlasts the interval is never overlapped on this instance.
  let foodCacheRunning = false;
  app.post('/maintenance/food-cache', async (req) => {
    if (foodCacheRunning) return { skipped: 'already_running' };
    foodCacheRunning = true;
    try {
      const result = await maintainFoodCache(c);
      req.log.info({ ...result }, 'food-cache.maintenance');
      return result;
    } finally {
      foodCacheRunning = false;
    }
  });

  // Sundays, America/Mexico_City. The Scheduler job stays paused until this exists (MVP week 4).
  app.post('/maintenance/weekly-plans', async (req, reply) => {
    req.log.warn('weekly-plans.not_implemented');
    return reply.status(501).send({ error: 'weekly plan generation is not implemented yet' });
  });

  return app;
}
