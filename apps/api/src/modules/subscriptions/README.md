# subscriptions

Two unrelated billing relationships (never mixed):

| | Nutritionist → Platform | Patient → Nutritionist |
|---|---|---|
| Entity | `PlatformSubscription` | `PatientSubscription` |
| Provider | Stripe Billing | `APPLE_APP_STORE` / `GOOGLE_PLAY` (in-app) or `STRIPE` (out-of-app) |
| Drives | `Tenant.status` (lifecycle) | patient entitlement (`ENTITLED_PERMISSIONS`) |

Implemented: `entitlement.service.ts` — derives access from `patient_subscriptions`.

Deferred (boundary only), each writes `patient_subscriptions` after verifying the provider signature:
- `apple-notifications.controller` — App Store Server Notifications V2 (signed JWS), plus receipt validation on purchase.
- `google-notifications.controller` — Play Real-Time Developer Notifications via Pub/Sub, verified with the Play Developer API.
- `stripe-webhook.controller` — out-of-app sales, signature-verified.

Rules:
- A client may never assert entitlement; purchases are verified server-side and linked to the
  authenticated patient of that tenant.
- Store subscriptions are per store account. Because each tenant app is published from its own
  developer account (ADR-009), provider events must be routed to the right tenant by app/package id.
