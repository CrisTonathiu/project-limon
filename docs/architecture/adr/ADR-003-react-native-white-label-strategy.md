# ADR-003: React Native white-label strategy

**Status:** Accepted (publishing model pending — see open-decisions #1) · 2026-09-17

## Context
Each nutritionist should be able to have an independently published iOS/Android app with their name, icon and branding, without forking code.

## Decision
One Expo (React Native) app. Build-time identity (name, bundle ID/package, icon, splash, scheme, public app key) comes from `tenants/<slug>/tenant.json` selected by `APP_TENANT` in `app.config.ts`. Runtime branding comes from `GET /apps/bootstrap`. The app sends its app key as `X-App-Key`; the API treats it as context, never authorization. `TenantApp` rows (one per platform) track store lifecycle independently of tenant status.

## Alternatives considered
- **Single multi-tenant app** (patient picks nutritionist): simplest, but fails the "my own app" product requirement.
- **Fork per tenant:** unmaintainable.
- **Bare React Native with flavors/schemes:** workable but more native config per tenant; Expo config plugins + EAS give this programmatically.

## Consequences
+ One codebase; tenant builds are pure configuration.
+ Suspending a tenant cuts access without touching the store.
− Each store app needs its own review, signing credentials, push credentials.
− Apple 4.2.6 may require submitting from each nutritionist's developer account.
− A shared JS bug ships to every tenant app; OTA channel strategy needed.
