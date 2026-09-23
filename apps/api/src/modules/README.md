# API modules

Each module owns one domain and follows the same layering:

```
<module>.routes.ts      HTTP only: parse/validate input (Zod), pick permission, call service, shape response
<module>.service.ts     Business rules. Receives TenantContext explicitly. Opens withTenant() transactions.
<module>.repository.ts  Prisma queries. Takes a TenantTx + tenantId. No business logic.
<module>.types.ts       Module-internal types (shared contracts live in @limon/types)
```

Rules:
- Controllers never import Prisma. Repositories never import Fastify.
- Services never read tenantId/userId/role from input — only from `TenantContext`.
- Tenant-owned tables are only touched through `withTenant()` (RLS-bound transaction).
- Cross-module calls go service → service, never into another module's repository.

| Module | Status |
|---|---|
| auth, tenants, patients, apps | foundation implemented |
| apps/provisioning | boundary only |
| users, nutritionists, recipes, foods, meal-plans, protocols, progress, conversations, subscriptions, payments, ai, files, notifications | placeholder |

Notes for placeholders:
- **ai**: Bedrock is called only from here. Must build patient context via TenantContext + patient authorization
  first; the mobile app never calls Bedrock. Prompts/responses must not be logged with PHI.
- **payments / subscriptions**: two separate relationships — `PlatformSubscription` (Stripe Billing, nutritionist → platform)
  and `PatientSubscription` (Stripe Connect, patient → nutritionist). Webhooks verify Stripe signatures and enqueue
  `ProcessSubscriptionEvent`; tenant status changes go through `tenant-lifecycle.service.ts`.
- **files**: use `TenantStorage` (signed URLs, tenant-prefixed keys). Never public objects.
