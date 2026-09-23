# Multi-tenancy

## Tenant identity
- `tenants.id` — UUID, immutable, the **only** security identifier.
- `tenants.slug` — human-friendly, mutable, unique; used for URLs and build folders. Never used for authorization, S3 keys, or joins.

## Isolation — three layers

| Layer | Mechanism | Protects against |
|---|---|---|
| 1. Application | `TenantContext` derived server-side; repositories filter by `tenantId`; request schemas are `.strict()` and reject `tenantId`. | Normal bugs, client tampering |
| 2. Relational | Composite FKs `(tenant_id, x_id) → (tenant_id, id)`. | A row in tenant A referencing a row in tenant B |
| 3. Database policy | Postgres **Row-Level Security** on every tenant-owned table; runtime role cannot bypass; tenant set per transaction via `set_config('app.tenant_id', …, true)`. | Forgotten `WHERE tenant_id`, raw queries, injection reading other tenants |

Fail-closed: if `app.tenant_id` is not set, policies match **no rows**.

Tested by `packages/database/test/integration/tenant-isolation.test.ts` (DB level) and `apps/api/test/integration/tenant-isolation.api.test.ts` (HTTP level); both run in CI.

## Pre-tenant operations
Some lookups happen before a tenant is known (token `sub` → user; app key → tenant). They use two narrow `SECURITY DEFINER` functions (`app_resolve_identity`, `app_resolve_tenant_app`) that return a minimal fixed column set — not a general RLS bypass.

## Connection pooling note
`app.tenant_id` is **transaction-local** (`is_local = true`), so it cannot leak across pooled connections (Prisma pool, RDS Proxy, PgBouncer in transaction mode).

## Placement (future dedicated DBs)
`tenants.database_mode` / `database_identifier` + `TenantRegistry` + `DatabaseRouter.clientFor(placement)`. All tenant data access already goes through the router, so moving a tenant to a dedicated cluster means: provision DB, migrate the tenant's rows, flip placement. Not implemented (ADR-002).

Cross-tenant platform operations (admin reporting, billing sweeps) must use a separate `BYPASSRLS` role on a separate connection, never the API's runtime role. Deferred.

## Workers, storage, logs
- SQS `JobEnvelope` carries `tenantId`, `actorUserId`, `requestId`; payload holds IDs only. Workers re-check tenant status before acting.
- S3 keys: `tenants/{tenantId}/{area}/…` built only by `tenantObjectKey()`; downloads verify the prefix matches the caller's tenant.
- Logs include `requestId`, `tenantId`, `userId` — never patient health data.
