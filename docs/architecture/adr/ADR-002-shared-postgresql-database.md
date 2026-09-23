# ADR-002: Shared PostgreSQL (Aurora) database

**Status:** Accepted · 2026-09-17

## Context
Relational domain (patients, plans, payments), strong consistency, FK integrity, team familiarity with Prisma. Some future enterprise tenants may require dedicated databases.

## Decision
Single Aurora PostgreSQL Serverless v2 cluster per environment with Prisma. Every tenant-owned table has `tenant_id` + RLS. `tenants.database_mode` (`SHARED|DEDICATED`) and `database_identifier` (`MAIN`) plus `DatabaseRouter.clientFor(placement)` form the abstraction for later dedicated placement. Only `SHARED/MAIN` is implemented.

## Alternatives considered
- Database per tenant from day one — premature cost/ops.
- DynamoDB — poor fit for relational, ad-hoc clinical/reporting queries.
- Citus/sharding — unnecessary at current scale.

## Consequences
+ Referential integrity, transactions, RLS available natively.
+ Dedicated placement is an additive change (router + migration tooling), not a rewrite.
− Prisma requires interactive transactions to scope RLS; long transactions must be avoided.
− Control-plane lookups (identity, app key) always hit the shared cluster, even for future dedicated tenants — by design.
