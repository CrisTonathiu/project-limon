# ADR-008: Patient payments are provider-agnostic

**Status:** Proposed — provider choice pending · 2026-09-17

## Context
Patients download their nutritionist's app, sign up, and pay to get access. Two constraints collide:

- **Store billing rules.** Apple guideline 3.1.1 requires In-App Purchase for digital content and services consumed in the app; Google Play Billing has an equivalent rule. Meal plans, recipes and AI chat are digital content. Store fees are roughly 15–30%. The "person-to-person services" exception (Apple 3.1.3(d)) covers *real-time* one-to-one services, so live consultations might qualify while on-demand content does not. Mexico has no external-link entitlement comparable to the 2025 US ruling.
- **Money should reach the nutritionist.** Store revenue is paid to the developer account holder. Because each app is published from that tenant's own developer account (ADR-009), store billing pays the nutritionist directly — which matches the product, and leaves the platform fee to be collected separately through the tenant's platform subscription.

## Decision
Model the patient subscription without committing to a provider. `PatientSubscription` has `provider` (`APPLE_APP_STORE` | `GOOGLE_PLAY` | `STRIPE`), `providerSubscriptionId`, `productId`, a normalized `status`, and `currentPeriodEnd`.

Access is an **entitlement derived server-side** from that row (`entitlement.service.ts`) and enforced in the authorization pipeline via `ENTITLED_PERMISSIONS`. A client never asserts entitlement; only verified store notifications and webhooks write subscription rows.

Recommendation: store billing for in-app access, Stripe for out-of-app sales (web, in person). Confirm with the fee model before building checkout.

## Alternatives considered
- **Stripe Connect only, inside the app** — likely rejected at App Review for digital access; risks the whole white-label channel.
- **Free apps, sell access on the web only** — avoids fees but adds signup friction and still cannot link to purchase from inside the iOS app.
- **Treat everything as person-to-person consultations** — narrow exception; does not cover meal plans, recipes or AI chat.

## Consequences
+ The paywall, entitlement checks and app gating work today, before a provider is chosen.
+ Switching or adding providers is additive: a webhook/notification handler that writes the same table.
− Store fees materially affect pricing and the platform's own margin; needs a commercial decision.
− Store notifications arrive per developer account, so routing them to the right tenant depends on ADR-009's account model.
− Refunds, grace periods and billing retries must be mapped onto the normalized status enum per provider.
