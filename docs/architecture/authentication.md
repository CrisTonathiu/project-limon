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
**Nutritionist signup (implemented, temporary):** nutritionists won't register themselves; the team will create their accounts with a forced password change on first sign-in ([admin dashboard, Phase 6](../roadmap/admin-dashboard.md#phase-6--nutritionist-accounts-created-by-the-team-later)). Until then: project-level sign-up → verified token → `POST /api/v1/auth/register/nutritionist`. The API creates the practice's identity tenant first, then one transaction creates Tenant, TenantBranding, User, Nutritionist (owner), TenantApp×2 (iOS/Android, `DRAFT`) and audit entries. If the transaction fails, the identity tenant is deleted again. The endpoint refuses if the uid is already registered. In practice our team creates practices with `admin`; `admin identity-tenant <slug>` creates the identity tenant for a practice that has none.

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
- Dashboard: a **Firebase session cookie**, httpOnly, so page scripts never hold a credential ([MVP.2](../roadmap/mvp-2.md), D5). See below.

## Dashboard session (D5, decided 2026-10-21)
```
browser ── Firebase JS SDK, project level, in-memory ──▶ ID token
        ── POST /api/session { idToken } ──▶ dashboard server: verifyIdToken + createSessionCookie
        ◀── Set-Cookie: __Host-limon_session (httpOnly, Secure, SameSite=Strict, 12 h)
browser ── /api/v1/… + cookie ──▶ dashboard proxy ── Authorization: Bearer <session cookie> ──▶ API
```
- **Sign-in** (`apps/dashboard/features/auth/client-auth.ts`): Firebase signs in at the project level with in-memory persistence and signs out again once the cookie is set. An unconfirmed email gets a new link instead of a session.
- **Session route** (`app/api/session/route.ts`): accepts only a project-level ID token (a practice's identity tenant is refused) from a sign-in in the last 5 minutes, and mints a 12-hour session cookie with the Admin SDK. With dev auth it fetches a dev token from the API instead, so both modes use the same cookie and proxy. `DELETE` clears the cookie.
- **Proxy** (`app/api/v1/[...path]/route.ts`): forwards the method, body and content headers to `API_BASE_URL` with the cookie as the bearer credential; nothing else from the browser (no client `Authorization`, cookies or tenant headers). The API's CORS doesn't change: the call is server to server.
- **API**: `IdentityPlatformTokenVerifier` accepts session cookies next to ID tokens, told apart by issuer (`session.firebase.google.com/<project>`) and checked against their own public keys (X.509 certificates, cached by max-age). The principal is read the same way, so the tenant check applies unchanged: a project-level login is only valid for a nutritionist.
- **CSRF**: SameSite=Strict, plus every state-changing request (session and proxy) must carry `Origin` equal to `DASHBOARD_ORIGIN`.
- **Unconfirmed emails**: registration needs a session before the email is confirmed, so the session route doesn't check it; the API refuses unverified logins on every route but registration. After registering, the nutritionist confirms the email and signs in again (a session's claims are fixed when minted).
- **Sign-out** clears the cookie on that browser. It isn't revoked server-side: the API verifies offline, so a copied cookie stays valid until it expires (12 h). That's acceptable because page scripts can't read it.
- The `middleware.ts` redirect to `/login` only checks that the cookie exists; the API decides on every call, and a 401 clears the cookie.
- The `dashboard` service account needs permission to mint session cookies (`firebaseauth.users.createSession`, e.g. in `roles/firebaseauth.admin`). Locally with Identity Platform: `gcloud auth application-default login`.
