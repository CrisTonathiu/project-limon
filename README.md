# Limon — White-label Nutrition Platform

Multi-tenant SaaS where every nutritionist runs their own practice, with their own branded iOS/Android app, all from a single codebase and a shared backend.

> **Status: foundation phase.** Tenancy, auth, isolation, app shells, infra skeleton and docs are done. Nutrition features aren't built yet.

## Stack
pnpm + Turborepo monorepo · TypeScript everywhere
- `apps/api` — Node.js, Fastify, REST `/api/v1`, Pub/Sub worker
- `apps/dashboard` — Next.js (App Router)
- `apps/patient` — Expo / React Native, white-label builds
- `packages/*` — types, validation (Zod), config, database (Prisma + RLS), tenant, auth, api-client, ui tokens
- `infrastructure/terraform` — GCP (us-east1): Cloud Run, Cloud SQL PostgreSQL, Identity Platform, Pub/Sub + Cloud Scheduler, Cloud Storage, Cloud Monitoring. See [docs/architecture/gcp.md](docs/architecture/gcp.md)

MVP plan: [docs/roadmap/mvp-roadmap.md](docs/roadmap/mvp-roadmap.md).

Start with [docs/architecture/overview.md](docs/architecture/overview.md) and [docs/architecture/open-decisions.md](docs/architecture/open-decisions.md).

## Prerequisites
Node 22, pnpm 10, Docker.

## Local setup
```bash
pnpm install
cp .env.example .env
docker compose up -d            # Postgres 16 with limon_owner + limon_app roles
pnpm --filter @limon/database build
pnpm db:migrate                 # applies 0001_init + 0002_rls
pnpm db:seed                    # tenants: maria-nutrition, carlos-nutrition
```

Run things:
```bash
pnpm --filter @limon/api dev          # http://localhost:4000
pnpm --filter @limon/api worker:dev   # scheduled jobs (FatSecret cache refresh + purge every 15 min)
pnpm --filter @limon/dashboard dev    # http://localhost:3000  (sign in as dev|nutritionist|maria-nutrition)
APP_TENANT=dev-tenant pnpm --filter @limon/patient start
APP_TENANT=carlos-nutrition pnpm --filter @limon/patient start   # invite-only tenant: sign up with code CARLOS-DEV1
```

FatSecret (credentials in .env, IP whitelisted in the FatSecret portal):
```bash
pnpm --filter @limon/api fatsecret search "nopales"   # or: food <id> | cache | refresh
```

Platform-team admin (until the dashboard exists):
```bash
pnpm --filter @limon/database admin features maria-nutrition --enable invite_only   # admission: invite only
pnpm --filter @limon/database admin invite maria-nutrition --first-name Ana --last-name López
```

Build a different tenant app's config:
```bash
cd apps/patient && APP_TENANT=carlos-nutrition npx expo config --type public
```

## Quality gates
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm test:integration     # tenant isolation against real Postgres (needs docker + migrate + seed)
```
CI (`.github/workflows/ci.yml`) runs all of this, including the tenant-isolation suites.

## Git workflow
Branch from `main` as `feat/*` or `chore/*`; never commit or push to `main` directly. PRs require green CI: lint, typecheck, tests, build, Terraform validate. A merge to `main` deploys to `preproduction` (`.github/workflows/deploy.yml`).

## Product rules encoded in the foundation
- **Market: Mexico.** Health data is sensitive personal data under LFPDPPP — signup captures express consent per patient with the document version accepted. Clinical-record retention (NOM-004) constrains deletion. See [open-decisions.md](docs/architecture/open-decisions.md).
- **Identity is tenant-scoped.** The same email can be a patient of several nutritionists; each nutritionist has their own Identity Platform tenant, so the same email makes separate logins.
- **Patients sign themselves up** in their nutritionist's app and pay for access. Content stays locked until an active subscription exists — enforced by the API, not the app.
- **Each tenant app is published from that nutritionist's own developer account**, enrolled with a platform-provisioned mailbox.

## Security invariants (don't break these)
1. Never accept `tenantId`, `userId`, `role` or status from a client. Use `TenantContext`.
2. Tenant-owned tables are only accessed inside `withTenant()`.
3. Every new tenant-owned table gets an RLS policy (a test enforces this).
4. Clients get `{ error: { code, message, requestId } }` only. No internals.
5. No patient health data in logs, audit metadata, or queue payloads.
6. Cloud Storage keys only through `tenantObjectKey()`; private bucket, signed URLs.
7. Entitlement is derived server-side from verified provider events — a client may never claim it.
