# ADR-004: Backend architecture

**Status:** Accepted · 2026-09-17

## Context
Need an API shared by the dashboard and all patient apps, plus async jobs, without microservice overhead.

## Decision
A modular monolith in `apps/api`: Node.js + TypeScript + **Fastify**, REST under `/api/v1`. Modules follow routes → service → repository; services receive `TenantContext` explicitly (no global mutable state); a composition root (`createContainer`) wires dependencies. The same image runs as the worker with a different command (`node dist/jobs/worker.js`). Zod validation at boundaries, a single error handler emitting `{ error: { code, message, requestId } }`.

Fastify over Express: built-in structured logging (pino) with redaction and request IDs, schema-friendly, maintained plugins for helmet/CORS/rate limiting. Over NestJS: less framework surface; the layering is enforced by convention and review.

## Alternatives considered
- Express — older ecosystem, manual async error handling.
- NestJS — heavier DI/decorator model than needed now.
- GraphQL — no current requirement; complicates per-field authorization and caching.
- Microservices — no measurable reason yet (Stage 4).

## Worker (amended 2026-10-19, with ADR-010)
The worker was first an always-running SQS consumer. On Cloud Run it's an HTTP service that scales to zero:

- `POST /jobs`: Pub/Sub pushes each job (the `JobEnvelope` from `packages/tenant/src/jobs.ts`). A `2xx` acknowledges it, and any other status retries it. After 5 attempts it goes to the dead-letter topic `jobs-dlq`. Handlers must be idempotent.
- `POST /maintenance/*`: Cloud Scheduler calls these (the FatSecret cache refresh every 15 minutes, the Sunday plan job).
- Only the Pub/Sub and Scheduler service accounts can invoke it, so it needs no authentication code. Every job finishes within its request (at most 10 minutes); nothing runs in the background.
- Locally, with `PUBSUB_JOBS_TOPIC` unset, the api runs each job in-process right after the request that published it.

## Consequences
+ One deployable, simple local dev, easy cross-module transactions.
+ Module boundaries allow later extraction of AI, payments, notifications, app-build.
− Discipline required to keep modules from reaching into each other's repositories.
