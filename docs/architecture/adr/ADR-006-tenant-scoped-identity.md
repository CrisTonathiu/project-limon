# ADR-006: Tenant-scoped user identity

**Status:** Accepted · 2026-09-17 (confirmed by product: tenant-scoped only)

## Context
Each tenant app is a different brand/business. A person might be a patient of two nutritionists. A single Cognito pool with email as unique sign-in cannot hold two accounts for the same email.

## Decision
Identity is tenant-scoped. `users` is unique on `(tenant_id, email)`. One Cognito user pool per environment; Cognito usernames are namespaced per tenant (e.g. `<tenantId>#<email>`) and composed by the client from its build context. Tenant membership is always verified server-side from the database — namespacing is not a security control.

## Alternatives considered
- **Global identity** (one account, many tenant memberships): better UX across apps, but couples separate businesses' patient relationships, complicates consent and data deletion per tenant.
- **User pool per tenant**: strong separation; Cognito quotas and per-pool config/ops at thousands of tenants.

## Implementation
`tenantUsername(tenantId, email)` in `@limon/tenant` produces `<tenantId>#<lowercased email>`. The patient app composes it from `tenantId` in its build config; the person only types their email. The API always re-checks tenant membership from the database.

## Consequences
+ Per-tenant deletion is clean; no cross-tenant account linkage.
− Same person has separate passwords per nutritionist app.
− Username composition must be consistent across all clients.
