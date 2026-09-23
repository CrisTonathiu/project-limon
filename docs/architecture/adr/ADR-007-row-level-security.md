# ADR-007: Postgres Row-Level Security as the database isolation layer

**Status:** Accepted · 2026-09-17

## Context
Requirement: "Do not rely exclusively on application code to remember to filter by tenant."

## Decision
Enable RLS on every tenant-owned table with policy `tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid`. The runtime role `limon_app` is neither owner nor `BYPASSRLS`. The API sets the variable transaction-locally inside `withTenant()`. Pre-tenant lookups use two narrow `SECURITY DEFINER` functions. Audit and lifecycle tables are append-only for the runtime role. A unit test fails if a model with `tenantId` lacks a policy; integration tests prove cross-tenant reads/writes fail.

## Alternatives considered
- Prisma client extension auto-injecting `tenantId` — still application-level; bypassed by raw queries.
- Schema/database per tenant — see ADR-001/002.

## Consequences
+ Fail-closed: missing context returns no rows.
+ Safe with connection pooling (transaction-local setting).
− Every tenant query runs in an interactive transaction.
− Migration authors must add policies for new tables (guarded by test).
− Platform-wide queries need a separate privileged role/connection.
