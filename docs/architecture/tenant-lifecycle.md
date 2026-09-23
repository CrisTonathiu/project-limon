# Tenant Lifecycle

Cancellation ≠ deletion. Access is controlled by **status**; infrastructure is never torn down to revoke access.

## States (`packages/tenant/src/lifecycle.ts`)
```
TRIAL ──▶ ACTIVE ◀──▶ PAST_DUE
  │          │  ▲         │
  │          ▼  │         │
  └──────▶ CANCELING ─────┤
             │            ▼
             └──────▶ SUSPENDED ◀──▶ DELETION_PENDING ──▶ DELETED (terminal)
```
Illegal transitions throw (`assertTransition`). Every transition writes a `tenant_lifecycle_events` row and an audit log entry.

## Flow
```
Nutritionist cancels
  → Stripe subscription cancel_at_period_end         (PlatformSubscription)
  → Tenant CANCELING      full access until period end
  → period ends (Stripe webhook) → SUSPENDED
        patients: no access; nutritionist: read-only/export
  → retention window elapses (sweeper) → DELETION_PENDING (scheduled_deletion_at)
  → DeleteTenantData job on tenant-deletion SQS queue
        operational data deleted/anonymized, S3 prefix removed,
        Cognito users deleted, financial rows retained w/o PII, audit retained
  → DELETED (tenant row kept as tombstone)
  → TenantApp → DISABLED/REMOVED (store delisting is operational)
```
Reactivation is possible from `SUSPENDED` (and from `DELETION_PENDING` back to `SUSPENDED` before the job runs).

## Implemented now
- State machine + access policy (unit-tested)
- `tenant-lifecycle.service.ts` (`transition`, `enqueueDeletion`)
- `DeleteTenantData` handler skeleton with guards and documented order (throws "not implemented")

## Deferred / needs decision
- Retention durations (placeholder: 30 days suspended before deletion). **Must be reconciled with Mexican rules**: NOM-004-SSA3-2012 points to retaining clinical records ~5 years, so tenant deletion cannot simply erase patient clinical data on cancellation. Likely shape: delete/anonymize operational data, retain clinical and financial records for the legal period under restricted access, then delete.
- ARCO rights (access, rectification, cancellation, opposition) under LFPDPPP — patient-initiated, independent of tenant lifecycle. Not built.
- Whether patients may export their own data before deletion.
- Stripe webhook handler + sweeper schedule (EventBridge Scheduler → SQS).
