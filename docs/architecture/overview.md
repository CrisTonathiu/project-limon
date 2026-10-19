# Architecture Overview

Limon is a multi-tenant, white-label nutrition SaaS. Each nutritionist is a **tenant**; each tenant can ship its own branded iOS/Android app built from **one** React Native codebase, all backed by **one** shared API and database.

```
   Patient apps (Expo) ── "Maria Nutrition", "Carlos Nutrition", … ─┐
   Dashboard (Next.js, not deployed yet) ───────────────────────────┤ api-client, HTTPS
                                                                    ▼
                                     api.projectlimon.com ─▶ Cloud Run "api" (Fastify)
                                                               │   │   │
              ┌────────────────────────┬───────────────────────┘   │   └──▶ Pub/Sub "jobs" ─push─▶ Cloud Run "worker"
              ▼                        ▼                           ▼                                  ▲
   Identity Platform        Cloud SQL PostgreSQL (RLS)      Cloud Storage                     Cloud Scheduler
   (one tenant per          ◀── worker too                  (signed URLs)
    nutritionist)
   Secret Manager · Cloud NAT (fixed IP for FatSecret) · Cloud Logging / Monitoring
```

One GCP project per environment; only `preproduction` exists during the MVP. See [gcp.md](gcp.md).

## Repository

| Path | Purpose |
|---|---|
| `apps/api` | REST API (`/api/v1`) + worker entrypoint (Pub/Sub push and Cloud Scheduler endpoints). Modular: routes → service → repository. |
| `apps/dashboard` | Next.js App Router dashboard for nutritionists. |
| `apps/patient` | Expo React Native patient app; one source, many tenant builds. |
| `packages/types` | Domain enums, DTOs, error codes — the cross-app contract. |
| `packages/validation` | Zod schemas used at API boundaries (and for form UX). |
| `packages/config` | Fail-fast server env loading. |
| `packages/database` | Prisma schema, migrations (incl. RLS), `withTenant()`, `DatabaseRouter`, audit writer. |
| `packages/tenant` | `TenantContext`, lifecycle state machine, placement registry interface, storage key builder, job envelope. |
| `packages/auth` | Token verifiers (Identity Platform, dev), Identity Platform admin + role→permission policy. |
| `packages/api-client` | Typed fetch client shared by dashboard and patient app. |
| `packages/ui` | Design tokens + tenant theme builder (no cross-platform components). |
| `infrastructure/terraform` | Terraform for GCP, one folder per environment. |

Why each package exists: every package is imported by at least two deployables (api/worker/dashboard/patient) **or** isolates a security-critical concern (`database`, `auth`, `tenant`) so it can be reviewed and tested in one place.

## Request flow (authenticated)

1. Client sends `Authorization: Bearer <Identity Platform ID token>` (+ `X-App-Key` from patient apps).
2. API verifies the token → login uid and identity tenant; the email must be verified.
3. API resolves user → tenant → role **from its own database**, and checks the login came from that tenant's identity tenant.
4. Patient apps: app key must belong to the user's tenant.
5. Tenant status → access level (full / read-only / none).
6. Role → permission check.
7. Patients additionally need an active subscription for paid content.
8. Service runs inside `withTenant()` → Postgres RLS scopes every statement.

See [authorization.md](authorization.md).

## Related documents
- [multi-tenancy.md](multi-tenancy.md) · [database.md](database.md) · [authentication.md](authentication.md) · [authorization.md](authorization.md)
- [mobile-white-label.md](mobile-white-label.md) · [tenant-lifecycle.md](tenant-lifecycle.md) · [gcp.md](gcp.md)
- [open-decisions.md](open-decisions.md) · [adr/](adr/)
