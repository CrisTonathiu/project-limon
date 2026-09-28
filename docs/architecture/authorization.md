# Authorization

## Pipeline
Implemented in `apps/api/src/middleware/tenant-context.ts` (pure, unit-tested) and wired per route with `requireTenant(container, permission)`.

```
Request
  │ 1 Authenticate      verify Cognito access token → sub
  │ 2 Resolve user      users by cognito_user_id (DB)         → FORBIDDEN if unknown/disabled
  │ 3 Resolve tenant    user.tenant_id (DB)                   → TENANT_NOT_FOUND
  │ 4 App identity      X-App-Key → tenant_apps.tenant_id     → APP_NOT_RECOGNIZED / TENANT_MISMATCH
  │                     (required for PATIENT role)
  │ 5 Tenant status     accessFor(status, audience)           → TENANT_SUSPENDED
  │ 6 Permission        hasPermission(role, permission)       → FORBIDDEN
  │ 7 Entitlement       patients only, paid-content perms     → SUBSCRIPTION_REQUIRED (402)
  ▼ 8 TenantContext     passed explicitly to services → withTenant() → RLS
```

**Security model:** `App Identity + Authenticated User + Tenant Membership + Tenant Status = Authorized Request`.

## Never trusted from clients
`tenantId`, `userId`, `role`, subscription/tenant status. Request schemas are `.strict()`; the API has `/tenants/current`, not `/tenants/:id`, for tenant users.

## Roles → permissions
`packages/auth/src/permissions.ts`. Handlers ask for **permissions**, not roles, so adding roles (e.g. `ASSISTANT`, `CLINIC_ADMIN`) is a policy change only. `PLATFORM_ADMIN` intentionally has no tenant-data permissions.

## Tenant status → access
| Status | Nutritionist | Patient |
|---|---|---|
| TRIAL, ACTIVE, PAST_DUE, CANCELING | full | full |
| SUSPENDED | read-only (export, fix billing) | none |
| DELETION_PENDING, DELETED | none | none |

## Patient entitlement
Patients pay for access. `ENTITLED_PERMISSIONS` (recipes, own meal plans, AI chat) additionally require an active subscription, derived server-side from `patient_subscriptions` (`ACTIVE`, `TRIALING` or `GRACE_PERIOD`, and not past `currentPeriodEnd`).

Deliberately **not** gated: profile (`self:patient:read`) and subscription (`self:subscription:read`), so an unpaid patient can sign in, see the paywall and restore a purchase. The client never asserts entitlement — only verified store notifications and webhooks write subscription rows ([ADR-008](adr/ADR-008-patient-payments.md)).

## Resource ownership
Resource lookups include `tenantId`; a resource from another tenant returns **404**, indistinguishable from non-existent. Patient self-access (`/patients/me`) resolves by `userId` from context, never from a path param.

Next steps (deferred): per-patient assignment rules when a tenant has multiple nutritionists; object-level policies for AI context retrieval.
