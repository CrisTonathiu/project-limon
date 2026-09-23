# ADR-004: Backend architecture

**Status:** Accepted · 2026-09-17

## Context
Need an API shared by the dashboard and all patient apps, plus async jobs, without microservice overhead.

## Decision
A modular monolith in `apps/api`: Node.js + TypeScript + **Fastify**, REST under `/api/v1`. Modules follow routes → service → repository; services receive `TenantContext` explicitly (no global mutable state); a composition root (`createContainer`) wires dependencies. The same image runs as the SQS worker with a different command. Zod validation at boundaries, a single error handler emitting `{ error: { code, message, requestId } }`.

Fastify over Express: built-in structured logging (pino) with redaction and request IDs, schema-friendly, maintained plugins for helmet/CORS/rate limiting. Over NestJS: less framework surface; the layering is enforced by convention and review.

## Alternatives considered
- Express — older ecosystem, manual async error handling.
- NestJS — heavier DI/decorator model than needed now.
- GraphQL — no current requirement; complicates per-field authorization and caching.
- Microservices — no measurable reason yet (Stage 4).

## Consequences
+ One deployable, simple local dev, easy cross-module transactions.
+ Module boundaries allow later extraction of AI, payments, notifications, app-build.
− Discipline required to keep modules from reaching into each other's repositories.
