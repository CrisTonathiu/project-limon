# ADR-001: Multi-tenant architecture

**Status:** Accepted · 2026-09-17

## Context
Hundreds to thousands of nutritionists, each an isolated business with private patient health data and optionally its own store app. Small team; must avoid per-tenant operational cost.

## Decision
Pooled multi-tenancy: shared API, workers, dashboard and database. Each tenant has an immutable UUID `tenantId`. Isolation is enforced in three layers: server-derived `TenantContext`, composite tenant foreign keys, and Postgres Row-Level Security with a non-bypass runtime role. A tenant placement registry exists so specific tenants can later move to dedicated databases.

## Alternatives considered
- **Silo (stack/backend per tenant):** strongest isolation; cost and deployment complexity grow linearly with tenants; rejected for Stage 1.
- **Schema per tenant:** migrations × N, catalog bloat at thousands of tenants, pooled connections complicated.
- **Application-only filtering:** a single forgotten `WHERE` leaks health data. Rejected as sole control.

## Consequences
+ One deployment, one migration path, low marginal cost per tenant.
+ Leaks require defeating app code **and** DB policy.
− All tenant data access must go through `withTenant()` transactions (slight overhead, enforced convention).
− Noisy-neighbour risk; mitigated by rate limits now, dedicated placement later.
