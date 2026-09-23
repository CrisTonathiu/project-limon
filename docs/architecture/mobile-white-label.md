# Mobile White-Label Strategy

**One source codebase + tenant build configuration = independent store app.**

## Two kinds of configuration — never mixed

| | Build-time | Runtime |
|---|---|---|
| Where | `apps/patient/tenants/<slug>/tenant.json` → `app.config.ts` | `GET /api/v1/apps/bootstrap` → `TenantThemeProvider` |
| Contains | app name, bundle ID, package name, icon, splash, scheme, app keys, version, EAS project | colors, logo URL, support email, display name |
| Changes require | new store build + review | nothing (live) |
| Type | `TenantBuildConfig` | `TenantAppConfig` |

Select a tenant: `APP_TENANT=maria-nutrition npx expo config` / `eas build`.

## How an app identifies its tenant
Each build embeds a public **app key** (`TenantApp.appKey`, one per platform). The app sends it as `X-App-Key` on every request.

- It is **not a secret** (anyone can extract it from the binary) and **not authorization**.
- Unauthenticated, it only unlocks `/apps/bootstrap` (already-public branding).
- Authenticated, the API requires that the app's tenant equals the user's tenant (from DB). A Maria patient signing into the Carlos app gets `TENANT_MISMATCH`.

Why an opaque app key instead of sending the bundle ID? Bundle IDs are trivially spoofable too, and the key decouples API identity from store identifiers (which can change, e.g. transfers between developer accounts).

## Tenant suspended but app still published
`Tenant.status` and `TenantApp.status` are independent. When a tenant is `SUSPENDED`, the app stays in the store, bootstrap returns `TENANT_SUSPENDED`, and the app shows the "Service unavailable" screen. No store action is needed to cut access.

## TenantApp lifecycle
`DRAFT → BUILDING → SUBMITTED → PUBLISHED → DISABLED → REMOVED` (`DRAFT` added so a freshly-registered tenant isn't falsely "building").

## App provisioning (boundary only)
`apps/api/src/modules/apps/provisioning/` defines `AppProvisioningService`; `.github/workflows/mobile-build.yml` is the pipeline placeholder.

Future flow: signup → TenantApp rows (done) → branding configured → generate `tenant.json` + icon/splash from S3 → EAS Build → sign → submit (App Store Connect API / Play Developer API) → status callbacks → `PUBLISHED`.

At scale, generated tenant configs should come from the API/S3 at build time instead of being committed folders; `app.config.ts` is the only place that changes.

## Store accounts (decided — ADR-009)
Each tenant app is published from **that nutritionist's own developer account**, enrolled with a platform-provisioned mailbox (`maria@apps.<domain>`) so the platform can operate builds and submissions. Tracked in `TenantStoreAccount`; credentials live in Secrets Manager.

Consequences for onboarding: identity verification per nutritionist, an annual Apple fee per account, a D-U-N-S number for organization accounts, and Google Play's testing requirements for new personal accounts. Build the onboarding timeline around this.

## Still to decide
1. **Signing credentials** per tenant app (EAS-managed vs Secrets Manager).
2. **OTA updates** (EAS Update): channels per tenant or a shared runtime version.
3. **Push notifications**: APNs/FCM credentials per app bundle.
4. **In-app purchases** are configured per store account — see [ADR-008](adr/ADR-008-patient-payments.md).
