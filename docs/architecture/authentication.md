# Authentication

**Authentication answers only "who is this?"** It yields a Cognito `sub`. Tenant and role are resolved from the application database (see [authorization.md](authorization.md)).

## Cognito layout (per environment)
- One **user pool** per environment (dev / staging / prod).
- App clients: `dashboard` (auth code + PKCE) and `patient-apps` (SRP, shared by all tenant apps).
- Access tokens verified in the API with `aws-jwt-verify` (signature via cached JWKS, issuer, expiry, `token_use=access`, allowed `client_id`).

## Application user
```
Cognito user (sub) ──cognito_user_id──▶ users { id, tenant_id, role, status }
```
- `PLATFORM_ADMIN` users have `tenant_id = NULL`.
- `users` is unique on `(tenant_id, email)`, **not** on email.

## Tenant-scoped identity (ADR-006) — confirmed
A person can be a patient of Maria **and** of Carlos. Those are two separate accounts (separate data, consent, passwords), because each nutritionist is an independent business. In one shared user pool, email must therefore not be the global unique login key.

Implemented: Cognito `username` is namespaced per tenant — `tenantUsername(tenantId, email)` → `<tenantId>#<normalized email>`. The patient app composes it from `tenantId` in its build config; the user only ever types their email. Namespacing is **not** a security boundary — the API still verifies tenant membership from the database.

Alternative considered: a user pool per tenant (clean separation, but Cognito per-account pool quotas, N× configuration, harder cross-tenant platform ops). Revisit for enterprise tenants.

## Flows
**Nutritionist signup (implemented):** Cognito sign-up → verified token → `POST /api/v1/auth/register/nutritionist` → one transaction creates Tenant, TenantBranding, User, Nutritionist (owner), TenantApp×2 (iOS/Android, `DRAFT`), audit entries. The endpoint refuses if the `sub` is already registered.

**Patient self-signup (implemented):** the patient downloads their nutritionist's app from the store → signs up in Cognito with the namespaced username → `POST /api/v1/auth/register/patient` with `X-App-Key`.

- The tenant comes from the **app key**, never from the body, so a patient can only be created in the tenant whose app they installed.
- Only `TRIAL`/`ACTIVE` tenants accept new patients (a cancelling or suspended practice must not take payments).
- If the nutritionist pre-created a patient with the same email, that record is **claimed** rather than duplicated, so existing history carries over.
- Consent is captured in the same transaction (see below).
- New patients have **no content access until they pay** — see [ADR-008](adr/ADR-008-patient-payments.md).

## Consent at signup (LFPDPPP)
Health data is sensitive personal data in Mexico, so signup requires express consent, recorded per patient with the exact document version accepted:

| Consent | Stored as |
|---|---|
| Privacy notice (aviso de privacidad) read | `PRIVACY_NOTICE` + version |
| Express consent to process health/nutrition data | `SENSITIVE_DATA` + version |
| Terms of service | `TERMS_OF_SERVICE` + version |

The checkboxes are unticked by default and all three are required. `patient_consents` rows are a legal record: the runtime role may insert and revoke, never delete. Not yet built: ARCO request handling (access, rectification, cancellation, opposition).

## Local development
`AUTH_PROVIDER=dev`: HMAC-signed tokens issued by `POST /api/v1/dev/token`. The config loader **refuses to boot** with dev auth when `APP_ENV` is not `development`, and the route is not registered otherwise.

## Token storage
- Patient app: `expo-secure-store` (Keychain/Keystore).
- Dashboard: foundation uses `sessionStorage` (dev only). Production: httpOnly Secure SameSite cookies set by a Next.js route handler after the Cognito code exchange.
