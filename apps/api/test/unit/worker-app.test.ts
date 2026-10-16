import type { JobEnvelope } from '@limon/tenant';
import { describe, expect, it } from 'vitest';
import type { Container } from '../../src/infrastructure/container.js';
import { buildWorkerApp } from '../../src/jobs/worker-app.js';

const job: JobEnvelope = {
  jobId: 'job-1', type: 'DeleteTenantData', tenantId: 't1', actorUserId: null, enqueuedAt: '2026-10-15T00:00:00Z', attempt: 0, payload: {},
};

/** The body Pub/Sub POSTs to a push endpoint. */
const push = (data: unknown, deliveryAttempt?: number) => ({
  message: { data: Buffer.from(typeof data === 'string' ? data : JSON.stringify(data)).toString('base64'), messageId: 'm1', publishTime: '2026-10-15T00:00:00Z' },
  subscription: 'projects/limon-preproduction/subscriptions/jobs-worker',
  ...(deliveryAttempt ? { deliveryAttempt } : {}),
});

async function worker(run: (c: Container, job: JobEnvelope) => Promise<void>) {
  const app = await buildWorkerApp({} as Container, { runJob: run });
  app.log.level = 'silent';
  return app;
}

describe('worker POST /jobs', () => {
  it('runs the job and acknowledges it with 2xx', async () => {
    const ran: JobEnvelope[] = [];
    const app = await worker(async (_c, j) => void ran.push(j));
    const res = await app.inject({ method: 'POST', url: '/jobs', payload: push(job, 3) });
    expect(res.statusCode).toBe(204);
    expect(ran).toEqual([{ ...job, attempt: 2 }]);
  });

  it('answers 500 when the handler fails, so Pub/Sub retries it', async () => {
    const app = await worker(async () => {
      throw new Error('boom');
    });
    expect((await app.inject({ method: 'POST', url: '/jobs', payload: push(job) })).statusCode).toBe(500);
  });

  it('rejects a malformed message without running anything', async () => {
    let ran = false;
    const app = await worker(async () => void (ran = true));
    for (const payload of [push('not json'), push({ type: 'DeleteTenantData' }), { message: {} }]) {
      expect((await app.inject({ method: 'POST', url: '/jobs', payload })).statusCode).toBe(400);
    }
    expect(ran).toBe(false);
  });
});
