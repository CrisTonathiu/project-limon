import type { JobEnvelope, JobType } from '@limon/tenant';
import type { Container } from '../infrastructure/container.js';
import { deleteTenantData } from './handlers/delete-tenant-data.js';

type Handler = (c: Container, job: JobEnvelope) => Promise<void>;
const handlers: Partial<Record<JobType, Handler>> = {
  DeleteTenantData: deleteTenantData,
  // GenerateMealPlan, GenerateShoppingList, GeneratePDF, ProcessAIRequest, SendNotification, ProcessSubscriptionEvent: deferred
};

/**
 * Runs one job. Throws when it fails, so the caller can have it redelivered.
 * Handlers must be idempotent: Pub/Sub delivers at least once.
 */
export async function runJob(c: Container, job: JobEnvelope): Promise<void> {
  const handler = handlers[job.type];
  if (!handler) throw new Error(`No handler for ${job.type}`);
  await handler(c, job);
}
