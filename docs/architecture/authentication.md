# Authentication

**Authentication answers only "who is this?"** It yields an Identity Platform login uid (the token's `sub`) and its identity tenant. Tenant and role are resolved from the application database (see [authorization.md](authorization.md)).

## Identity Platform layout (per GCP project)
- **Multi-tenancy on.** Each nutritionist's practice has its own **identity tenant** (`tenants.identity_tenant_id`), where its patients' logins live. Email + password, verification by email link, password reset by email. Emails are in Spanish.
- **Nutritionists** sign in at the project level, outside any identity tenant.
- Clients use the Firebase JS SDK. The patient app sets `auth.tenantId` from `identityTenantId` in its `tenant.json` and keeps the session in SecureStore.
- The API verifies **ID tokens** (`packages/auth/src/identity-platform.ts`): RS256 signature against Google's cached public keys, issuer and audience for the project, expiry and `auth_time`. No credentials are needed to verify.
- The API manages identity tenants and deletes logins through the Admin SDK (`packages/auth/src/identity-admin.ts`).

## Application user
```
Identity Platform login (uid) ──auth_user_id──▶ users { id, tenant_id, role, status }
```
- `PLATFORM_ADMIN` users have `tenant_id = NULL`.
- `users` is unique on `(tenant_id, email)`, **not** on email.

## Tenant-scoped identity (ADR-006) — confirmed
A person can be a patient of Maria **and** of Carlos. Those are two separate accounts (separate data, consent, passwords), because each nutritionist is an independent business.

Implemented with identity tenants: Maria's app signs in to Maria's identity tenant, Carlos's app to Carlos's, so the same email makes two independent logins. On every request the API also checks that the token's identity tenant matches the user's tenant in the database (patients) or is empty (nutritionists), so a login from practice A never acts on practice B. The identity tenant is **not** the only boundary: the API still resolves the user and tenant from the database.

Locally (dev auth) there are no identity tenants, so dev subjects are namespaced with `tenantUsername(tenantId, email)` from `@limon/tenant`.

## Flows
**Nutritionist signup (implemented):** project-level sign-up → verified token → `POST /api/v1/auth/register/nutritionist`. The API creates the practice's identity tenant first, then one transaction creates Tenant, TenantBranding, User, Nutritionist (owner), TenantApp×2 (iOS/Android, `DRAFT`) and audit entries. If the transaction fails, the identity tenant is deleted again. The endpoint refuses if the uid is already registered. In practice our team creates practices with `admin`; `admin identity-tenant <slug>` creates the identity tenant for a practice that has none.

**Patient self-signup (implemented):** the patient downloads their nutritionist's app from the store → signs up in the practice's identity tenant → confirms the email link → `POST /api/v1/auth/register/patient` with `X-App-Key`. Registration is the only call that accepts an unverified email.

- The login must come from the identity tenant of the app's practice.
- The tenant comes from the **app key**, never from the body, so a patient can only be created in the tenant whose app they installed.
- If the tenant is **invite only**, the body must carry the patient's single-use `inviteCode`, which is redeemed in the same transaction. See [mobile-white-label.md](mobile-white-label.md#admission-modes-who-can-sign-up).
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
- Patient app: the Firebase session, in `expo-secure-store` (Keychain/Keystore). The API client asks for a fresh ID token on every request.
- Dashboard: foundation uses `sessionStorage` (dev only). Production: Identity Platform sign-in with httpOnly Secure SameSite session cookies set by a Next.js route handler ([MVP.2](../roadmap/mvp-2.md), D5).
