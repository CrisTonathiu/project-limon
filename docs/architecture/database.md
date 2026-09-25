# Database

Aurora PostgreSQL (16), shared cluster, Prisma ORM. The development environment uses a single RDS PostgreSQL 16 `db.t4g.micro` instance instead, to save cost. Local: `docker compose` Postgres 16.

## Roles
| Role | Used by | RLS |
|---|---|---|
| `limon_owner` | migrations, seed | owner (not subject) |
| `limon_app` | API, workers | enforced; `UPDATE/DELETE` revoked on `audit_logs`, `tenant_lifecycle_events`; `DELETE` revoked on `tenants` |
| `limon_platform` (future) | admin/reporting jobs | `BYPASSRLS`, separate connection |

## Entities (foundation)
Implemented: `Tenant`, `TenantBranding`, `TenantApp`, `TenantStoreAccount`, `TenantLifecycleEvent`, `User`, `Nutritionist`, `Patient`, `PatientConsent`, `PatientSubscription` (entitlement only), `AuditLog`.
Placeholders (tables exist, no logic): `Recipe`, `Food`, `MealPlan`, `Protocol`, `Conversation`, `Message`, `PlatformSubscription`, `Payment`, `PaymentTransaction`.

## Data classes and deletion behaviour
| Class | Tables | FK on delete | Tenant deletion |
|---|---|---|---|
| Platform | `tenants`, `tenant_apps`, `tenant_lifecycle_events` | RESTRICT | tombstone (status `DELETED`) |
| Operational (user-owned) | patients, meal_plans, conversations, messages, recipes, foods, protocols | CASCADE only *within* a patient's subtree (patient → meal plans/conversations → messages) | hard delete / anonymize |
| Financial | platform_subscriptions, patient_subscriptions, payments, payment_transactions | RESTRICT | retained per legal retention, PII stripped |
| Audit | audit_logs | no user FK; RESTRICT to tenant | retained; contains no health data |
| Legal | patient_consents | RESTRICT | retained as proof of consent (DELETE revoked for the app role) |
| Clinical | patient records covered by NOM-004 | RESTRICT | retained ~5 years — see open-decisions |

All FKs to `tenants` are RESTRICT: deleting a tenant row can never silently cascade. Tenant data removal is an explicit, ordered, idempotent job.

## Access pattern
```
route → service(TenantContext) → withTenant(router, placement, tx => repository(tx, tenantId, …))
```
- `withTenant` opens a transaction and sets `app.tenant_id` locally.
- Repositories take `TenantTx` + `tenantId` and still filter explicitly.
- Audit rows are written in the same transaction as the change.
- No module imports `@prisma/client` directly except `packages/database`.

## Migrations
- `0001_init` generated from `schema.prisma` (`prisma migrate diff`).
- `0002_rls` hand-written: policies, resolver functions, grants.
- `0003_patient_access`: consent, store accounts, provider-agnostic patient subscriptions.
- `0004_rls_patient_access`: policies and grants for those tables.
- Unit test scans **all** migrations and asserts every model with `tenantId` is covered by an RLS policy, and that Prisma enums match `@limon/types`.
- When adding a tenant-owned table: add it to an RLS migration or the test fails.

## Commands
```bash
docker compose up -d
pnpm db:migrate     # dev migrations as owner
pnpm db:seed        # maria-nutrition + carlos-nutrition
pnpm --filter @limon/database test:integration
```
