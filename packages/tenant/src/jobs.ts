/**
 * SQS job envelope. Every job carries the tenant + actor context it was
 * created under so workers can rebuild a TenantContext and re-check status
 * before doing anything (a tenant may have been suspended since enqueue).
 */
export type JobType =
  | 'GenerateMealPlan'
  | 'GenerateShoppingList'
  | 'GeneratePDF'
  | 'ProcessAIRequest'
  | 'SendNotification'
  | 'ProcessSubscriptionEvent'
  | 'DeleteTenantData';

export type JobEnvelope<TPayload = unknown> = {
  jobId: string;
  type: JobType;
  tenantId: string;
  actorUserId: string | null; // null for system-initiated jobs
  resource?: { type: string; id: string };
  requestId?: string;
  enqueuedAt: string;
  attempt: number;
  payload: TPayload; // IDs only — never embed patient PII in queue messages
};
