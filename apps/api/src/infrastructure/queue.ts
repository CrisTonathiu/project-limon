import { randomUUID } from 'node:crypto';
import { PubSub, type Topic } from '@google-cloud/pubsub';
import type { ServerEnv } from '@limon/config';
import type { JobEnvelope, JobType } from '@limon/tenant';
import { runJob } from '../jobs/run-job.js';
import type { Container } from './container.js';

type JobInput = { type: JobType; tenantId: string; actorUserId: string | null; payload: unknown; requestId?: string; resource?: JobEnvelope['resource'] };

export interface JobPublisher {
  publish<T>(job: JobInput & { payload: T }): Promise<string>;
}

const envelopeOf = (job: JobInput): JobEnvelope => ({ jobId: randomUUID(), enqueuedAt: new Date().toISOString(), attempt: 0, ...job });

/** Publishes to the `jobs` topic; its push subscription delivers each job to the worker's `POST /jobs`. */
class PubSubJobPublisher implements JobPublisher {
  private readonly topic: Topic;
  constructor(topicName: string, projectId: string | undefined) {
    this.topic = new PubSub({ projectId }).topic(topicName);
  }
  async publish(job: JobInput): Promise<string> {
    const envelope = envelopeOf(job);
    await this.topic.publishMessage({
      json: envelope,
      attributes: { jobType: job.type, tenantId: job.tenantId },
    });
    return envelope.jobId;
  }
}

/**
 * Local dev and tests, without Pub/Sub: runs the handler in this process, after the
 * request that published it. A failure is logged, never retried.
 */
class InProcessJobPublisher implements JobPublisher {
  constructor(private readonly container: () => Container) {}
  async publish(job: JobInput): Promise<string> {
    const envelope = envelopeOf(job);
    const log = { jobId: envelope.jobId, type: envelope.type, tenantId: envelope.tenantId };
    console.info(JSON.stringify({ msg: 'job.enqueued(local)', ...log }));
    setImmediate(() => {
      runJob(this.container(), envelope).then(
        () => console.info(JSON.stringify({ msg: 'job.done(local)', ...log })),
        (err: Error) => console.error(JSON.stringify({ msg: 'job.failed(local)', ...log, error: err.message })),
      );
    });
    return envelope.jobId;
  }
}

export function createJobPublisher(env: ServerEnv, container: () => Container): JobPublisher {
  return env.PUBSUB_JOBS_TOPIC ? new PubSubJobPublisher(env.PUBSUB_JOBS_TOPIC, env.GCP_PROJECT_ID) : new InProcessJobPublisher(container);
}
