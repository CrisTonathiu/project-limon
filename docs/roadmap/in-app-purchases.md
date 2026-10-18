# Patient payments with in-app purchases (Apple and Google)

**Planned:** 2026-10-17 · **Status:** alternative to [Patient payments with Stripe](stripe-payments.md); **one of the two will be chosen** · **Target:** MVP weeks 6–8, see the [estimate](#estimate) · **Environment:** `preproduction`, Apple **sandbox** and Google Play **license testers** · **First tenant:** `carlos-nutrition`

This plan sells the patient subscription **inside the app**, through Apple In-App Purchase (StoreKit) and Google Play Billing. Each app is published from the nutritionist's own developer accounts ([ADR-009](../architecture/adr/ADR-009-store-account-provisioning.md)), so **the stores pay the nutritionist directly**. Project Limon still charges each tenant separately, from its own Stripe account. Admin views stay in the [Platform admin dashboard](admin-dashboard.md) roadmap.

## Goal

The preproduction scenario this plan must make work, end to end:

1. A patient of `carlos-nutrition` signs in and sees the paywall, with the **price shown in the app** ("MXN 499 al mes").
2. They tap **"Suscribirme"** and confirm with Face ID (iOS) or their Google account (Android).
3. The app unlocks within seconds, and the same account is unlocked on the other platform too.
4. Renewals, failed payments, cancellations and refunds handled by the store reach our database without anyone touching it.

The same reliability rules as the Stripe plan apply: race conditions, idempotent requests, retried and duplicate notifications, failed requests between the store and us, and reconciliation back to the store's truth.

## Stripe plan vs this plan

| | Stripe, outside the app | In-app purchases |
|---|---|---|
| **App Review risk** | High. No price, button or link allowed in the app, and the exception it relies on is contested (see Risk 1). | **Low.** This is the purchase method Apple 3.1.1 and Google Play require. |
| **Purchase experience** | Tap → email → browser → card form → back to the app | **One tap** + Face ID or Google account, without leaving the app |
| **Fee per payment** | Stripe Mexico ≈ 3.6 % + MXN 3, plus IVA | **15 %** (Apple Small Business Program, and Google for every subscription). The store also deducts IVA. |
| **Example: MXN 499 / month** | ≈ MXN 475 to the nutritionist, before their own taxes | ≈ MXN 366 to the nutritionist: 499 includes 16 % IVA (≈ 430), minus 15 % |
| **Who collects and pays IVA** | The nutritionist | **The store**, as reseller |
| **Chargebacks, refunds** | The nutritionist's Stripe account | **The store** decides and absorbs them. We're notified. |
| **Failed renewals** | Stripe Smart Retries | The store's billing retry, **grace period** and (Google) account hold |
| **Cancellation** | Our emailed portal link | The store's subscription settings. The app links there. |
| **Payment methods in Mexico** | Cards | Cards, carrier billing, and **store balance**: App Store and Google Play gift cards are sold for cash in convenience stores |
| **Pause or cancel when a tenant is suspended** | Yes, by API | **Google: yes by API. Apple: no server API** (see [task 7.2](#phase-7--account-deletion-tenant-suspension-and-refunds-1-day)) |
| **Refund a payment made after an account was deleted** | Yes, by API | **Google: yes. Apple: only the patient can request it from Apple** |
| **Price changes** | Ours: email + Inicio notice, applied at renewal | The store's flow (notices, consent for increases), plus our email and Inicio notice, **with the amount** |
| **When the nutritionist is paid** | Stripe payouts, days | Monthly. Apple ≈ 30–45 days after the end of its fiscal month; Google around mid-month for the previous month. |
| **Nutritionist onboarding** | A Stripe account | Apple **Paid Applications Agreement** + bank + tax forms, and a Google **payments profile**. On Google, monetized apps show the developer's **physical address** publicly, which for an individual may be their home. |
| **Integrations to build** | One (Stripe) | Two (StoreKit + Play Billing), each with a client side and a server side |
| **Engineering estimate** | ≈ 13 days | ≈ 12 days ([estimate](#estimate)) |

Most of the reliability design carries over unchanged: the inbox table, the single writer under a lock, refetching instead of trusting payloads, the sweeper, reconciliation, platform alerts and payment records. Only the provider calls change.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Build or buy | **Build it ourselves**, with Apple's official server library (`@apple/app-store-server-library`) and the Google Play Developer API (`androidpublisher` v3). Fallback: **RevenueCat**, if the schedule slips. | The hard part, verifying Apple's signatures and reading subscription state, is in Apple's library. Google's notifications arrive through **Pub/Sub, which we already run**. Building it keeps the same inbox/reconciliation design we control, and avoids a third party in the privacy notice. RevenueCat would save about 4–5 days of server work, but still needs the same per-tenant store credentials, and charges a share of revenue above its free tier. |
| Client library | **`react-native-iap`** (StoreKit 2 and Play Billing Library 7+), in an **EAS development build** | In-app purchases don't work in Expo Go. Google retires old Play Billing Library versions every year, so the library must stay current (a yearly task). |
| Linking a purchase to a patient | A random **account token** per patient (`patients.store_account_token`, a UUID), passed as Apple `appAccountToken` and Google `obfuscatedExternalAccountId` | It comes back inside every signed transaction and notification, so the server knows which patient bought it without trusting the client. It isn't the patient id, so it reveals nothing to the stores. |
| Products | **One monthly auto-renewing subscription per app**, id `limon.subscription.monthly`. The price is a store price point in MXN, chosen with the nutritionist. Apple **Family Sharing off**. | It's a personal service. Family Sharing would let one purchase unlock other people's accounts, and adds revocation cases. |
| Grace period | **On** in both stores: Apple Billing Grace Period (16 days proposed) and Google's grace period + account hold | Patients keep access while the store retries a failed renewal. That maps to our existing `GRACE_PERIOD` status, which already counts as active. |
| Google notifications | The Real-Time Developer Notifications topic **`play-rtdn`** in our GCP project, **pushed to the private `worker`** (IAM only) | Same pattern as the `jobs` topic: no public endpoint, no auth code, retries and a dead-letter topic for free. |
| Apple notifications | App Store Server Notifications **V2**, to the public `POST /v1/webhooks/apple` on `api` | Apple needs a public HTTPS URL. Each notification is a JWS signed by Apple, which we verify. |
| Google credentials | **No key files.** The `worker` service account is invited into each nutritionist's Play Console, with permission to view financial data and manage orders and subscriptions. | Cloud Run already runs as that account, so there's nothing to leak or rotate. |
| Apple credentials | One **In-App Purchase key** (`.p8`, key id, issuer id) per nutritionist's developer account, in Secret Manager as `apple-iap-key-<slug>`, referenced from `tenant_store_accounts.api_credential_ref` | The App Store Server API only accepts keys from the account that owns the app. |
| Stripe | **Not used for patients** in this plan. It can come back later for in-person or website sales (allowed once in-app purchase exists, Apple 3.1.3(b)). Tenant billing stays on Project Limon's Stripe account. | One payment path for the MVP. |
| Tax receipts, trials | No CFDI, no free trials (same as the Stripe plan) | |

## The flow

```
Patient app (StoreKit / Play Billing)          API "api"                         worker                     Apple / Google
  │ GET /v1/subscriptions/me ───────────────────▶ entitlement + accountToken + productId
  │ show localized price (from the store) ◀─────────────────────────────────────────────────────────────────┤
  │ tap "Suscribirme" → store purchase sheet (appAccountToken / obfuscatedAccountId = accountToken) ───────▶│
  │ ◀─ signed transaction (Apple JWS) / purchaseToken (Google) ─────────────────────────────────────────────┤
  ├─ POST /v1/subscriptions/me/purchases (Idempotency-Key = transaction id / token)
  │                                      ├─ verify with the store, check accountToken = this patient
  │                                      ├─ syncStoreSubscription() under a lock ─── refetch status ────────▶│
  │                                      ├─ Google: acknowledge purchase (within 3 days, or it's refunded) ──▶│
  │ ◀── entitlement: active ─────────────┤
  ├─ finishTransaction() only now (Apple) │
  │                                       │
  │       Apple ─ POST /v1/webhooks/apple (signed, retried at 1, 12, 24, 48, 72 h) ─▶ inbox ─▶ job ─▶ worker: refetch, sync
  │       Google ─ Pub/Sub play-rtdn ─ push ─────────────────────────────────────────────────────▶ worker: inbox, refetch, sync
  │       Cloud Scheduler ─▶ worker: sweeper (5 min) · reconciliation (hourly): Apple notification history,
  │                                   Google subscriptionsv2.get + voided purchases
  ▼
 app launch: unfinished transactions / unacknowledged purchases → POST again (safe: idempotent)
```

Three independent paths write a subscription: the **app's purchase report**, the **store notification**, and **reconciliation**. They all call one function, `syncStoreSubscription()`, which refetches the state from the store under a per-subscription lock.

## What can go wrong, and which task covers it

| # | Failure | Without protection | Covered by |
|---|---|---|---|
| I1 | The app crashes, or loses its connection, after the purchase but before telling us | The patient paid and has no access | 3.2 (unfinished transactions re-sent on launch), 4.x (store notification), 6.2 (reconciliation) |
| I2 | The app reports the same purchase twice (retry, two launches) | Duplicate rows or double processing | 3.2 (Idempotency-Key = transaction id / token), 1.3 (unique key), 5.1 (lock) |
| I3 | The app's report and the store notification arrive at the same moment | Lost update | 5.1 (advisory lock, refetch inside the lock) |
| I4 | A forged or replayed purchase sent to our API | Free access | 3.2 (verify with the store, check bundle and environment, account token must match the caller) |
| I5 | One store account is used by two of the tenant's patient accounts (shared phone, family Apple ID) | The subscription unlocks the wrong account, or both | 3.2 (the account token decides; restore on another account → `409 OWNED_BY_OTHER_ACCOUNT`) |
| I6 | Google purchase never acknowledged | **Google refunds it automatically after 3 days** | 3.2 (server acknowledges, idempotent), 6.2 (reconciliation acknowledges stragglers), alert |
| I7 | Apple sends the same notification again, or retries for up to 72 h | Double processing, stale state | 4.1 (`notificationUUID` primary key), 5.1 (refetch, never trust the payload) |
| I8 | Our Apple endpoint is down longer than Apple's retries | Missed renewals, refunds, expirations | 6.2 (Apple's notification history API, 180 days) |
| I9 | Google notifications pile up or fail | Missed state changes | 4.2 (Pub/Sub retries + DLQ), 6.2 (poll each live token; voided-purchases list) |
| I10 | A resubscription or plan change gives Google a **new token** that replaces the old one (`linkedPurchaseToken`) | Two rows for one subscription, or the old row stays live | 5.1 (mark the linked token replaced) |
| I11 | A renewal notification is late | A paying patient is locked out at renewal | 6.3 (renewal leeway), 6.2 |
| I12 | A refund or chargeback through the store | The patient keeps access after getting their money back | 4.x (Apple `REFUND`, Google voided purchase / `SUBSCRIPTION_REVOKED`), 6.2 (voided-purchases list) |
| I13 | Subscribed on iOS **and** Android | Charged twice | 3.1 (the paywall hides the button once entitled on any platform), 5.2 (alert `DOUBLE_STORE_SUBSCRIPTION`) |
| I14 | App Review buys in the sandbox against our **production** server | "Purchase doesn't work", and a rejection | 3.3 (production accepts sandbox transactions from the review account) |
| I15 | The patient deletes their account with a live Apple subscription | Apple keeps charging them, and we can't cancel it | 7.1 (tell them before deleting, link to the store's subscription settings) |
| I16 | The tenant is suspended | Patients keep paying for an app that refuses them | 7.2 (Google: cancel or defer by API; Apple: alert + manual path) |
| I17 | A sandbox notification reaches production, or the reverse | Fake access in production | 4.1 / 4.2 (environment check) |

## Data model (summary)

```
tenant_store_products          tenant_id, platform, product_id, base_plan_id (Google), active                 (RLS)
patients                       + store_account_token (uuid, unique)
patient_subscriptions          provider = APPLE_APP_STORE | GOOGLE_PLAY (already in the enum)
                               provider_subscription_id = Apple originalTransactionId | Google purchaseToken
                               + environment (SANDBOX | PRODUCTION), auto_renew, store_state,
                                 linked_purchase_token, replaced_at, acknowledged_at, last_synced_at
store_notifications            provider, notification_id (PK together), type, subtype, tenant_id,
                               subscription_ref, signed_at, environment, status, attempts, last_error        (platform table)
store_reconcile_cursors        tenant_app_id, last_notification_at, last_run_at                              (platform table)
payments / payment_transactions, platform_alerts   as in the Stripe plan (phase 8 there), sources = store transactions
```

## To-do

Every task gives **what**, **why** and **what it solves** (the I-numbers).

### Phase 0 · Store setup per tenant (manual, ~0.5 day per tenant, plus the stores' waiting time)

- [ ] **0.1 Apple: agreements, banking, tax.**
  - *What:* in App Store Connect → Business, the nutritionist accepts the **Paid Applications Agreement** and adds a bank account and tax forms (W-8BEN for a Mexican individual).
  - Enroll in the **App Store Small Business Program**, for 15 % instead of 30 % in the first year.
  - *Why:* without the agreement, products can't be sold or even tested in sandbox on that account. The banking and tax review can take days, so **start in week 5**.
- [ ] **0.2 Apple: the product.**
  - *What:*
    - a subscription group "Programa" with one auto-renewable subscription, `limon.subscription.monthly`, at the agreed MXN price point;
    - a Spanish display name and description;
    - Family Sharing off;
    - **Billing Grace Period** on;
    - the review screenshot of our paywall and review notes.
  - *Why:* the first subscription is reviewed **together with an app version**, so it must be ready for the TestFlight/App Review build.
- [ ] **0.3 Apple: notifications and API key.**
  - *What:*
    - App Store Server Notifications **Version 2**: both the production and sandbox URLs → `https://api.projectlimon.com/v1/webhooks/apple`.
    - Create an **In-App Purchase key** in Users and Access → Integrations, and store it in Secret Manager as `apple-iap-key-<slug>`. Save the reference in `tenant_store_accounts.api_credential_ref`, and record the app's **Apple ID** (`tenant_apps.app_store_id`).
    - Create **sandbox tester** accounts.
  - *Why:* notifications are the main signal. The key lets the server read subscription status and notification history. The Apple ID is needed to verify production signatures.
- [ ] **0.4 Google: payments profile and product.**
  - *What:*
    - Set up a **payments profile** (merchant account) in Play Console. Check what address Google will show on the listing, and tell the nutritionist before they agree.
    - Create a subscription `limon.subscription.monthly` with an auto-renewing monthly **base plan** at the MXN price.
    - Turn on the **grace period** and **account hold**.
    - Add **license testers**.
  - *Why:* same as Apple. Billing only works for builds uploaded to a Play track. The closed-testing track from MVP week 6 already exists, so use it.
- [ ] **0.5 Google: notifications and API access.**
  - *What:*
    - Terraform: a topic `play-rtdn`, publisher role for `google-play-developer-notifications@system.gserviceaccount.com`, a **push subscription to the worker** (`/store/google-rtdn`, OIDC, backoff 10–600 s, 5 attempts, dead-letter to `jobs-dlq`).
    - In each app's Monetization setup, set the topic `projects/limon-preproduction/topics/play-rtdn` and send a test notification.
    - Invite `limon-worker@…` and `limon-api@…` into the Play Console with **View financial data** and **Manage orders and subscriptions**.
  - *Why:* one topic serves every tenant (the message carries the package name), and no key file exists.

**Done when:** a sandbox tester (Apple) and a license tester (Google) can see the product with its MXN price in a development build of the Carlos app, and both stores' test notifications reach us.

### Phase 1 · Schema (~0.5 day)

- [ ] **1.1 `tenant_store_products`** `(tenant_id, platform, product_id, base_plan_id, active)`, unique `(tenant_id, platform) WHERE active`.
  - *Why:* the server tells the app which product to sell and refuses purchases of anything else for that tenant.
- [ ] **1.2 `patients.store_account_token`** (UUID, unique, generated on first `GET /subscriptions/me`).
  - *Why:* the purchase carries it, and every later event maps back to the patient through it.
  - *Solves:* I4, I5.
- [ ] **1.3 `patient_subscriptions` additions.**
  - *What:* `environment`, `auto_renew`, `store_state` (the raw state, for support), `linked_purchase_token`, `replaced_at`, `acknowledged_at`, `last_synced_at`. The existing unique `(provider, provider_subscription_id)` keeps one row per Apple original transaction or Google token. There is no cross-platform unique index: a second subscription on the other store must still be **recorded**, so it can be detected and handled (5.2).
  - *Solves:* I2, I10, I13.
- [ ] **1.4 `store_notifications` (the inbox)**, primary key `(provider, notification_id)`: Apple's `notificationUUID`, or the Pub/Sub `messageId` for Google. Statuses as in the Stripe plan (`RECEIVED | ENQUEUED | PROCESSED | IGNORED | FAILED`). No payload stored beyond the ids we need. It's a platform table, accessed like `stripe_webhook_events`.
  - *Solves:* I7, I9.
- [ ] **1.5 `store_reconcile_cursors`**, plus the RLS policies and isolation tests for the new tenant tables.

**Done when:** the migration and RLS tests pass locally and on preproduction.

### Phase 2 · Store clients on the server (~1.5 days)

- [ ] **2.1 `AppleStoreGateway`** (`apps/api/src/infrastructure/apple-store.ts`).
  - *What:* wraps `@apple/app-store-server-library`:
    - `SignedDataVerifier`, with Apple's root certificates shipped in the image, the tenant's bundle id, the app's Apple ID, and the environment;
    - one `AppStoreServerAPIClient` per tenant, built from that tenant's key and cached.

    Methods: `verifyNotification`, `verifyTransaction`, `getAllSubscriptionStatuses(transactionId)`, `getTransactionHistory`, `getNotificationHistory(since)`, `requestTestNotification`. A 10 s timeout, and retries on 5xx and 429. Add a fake for tests.
  - *Why:* every Apple claim, from the app or from a notification, is signed. Verifying the chain is what makes a forged purchase worthless.
  - *Solves:* I4, I17.
- [ ] **2.2 `GooglePlayGateway`** (`apps/api/src/infrastructure/google-play.ts`).
  - *What:* `androidpublisher` v3 with Application Default Credentials (the service account). Methods: `getSubscription(packageName, token)` (subscriptionsv2), `acknowledge`, `cancel`, `revoke` (refund + end access), `defer`, `listVoidedPurchases(since)`. Add a fake for tests.
  - *Why:* a Google notification carries only a token. Every state comes from this API.
- [ ] **2.3 Config:** `APPLE_ROOT_CERTS_PATH`, `PLAY_RTDN_ENABLED`, and a check that the store environment matches `APP_ENV` (sandbox-only in preproduction, with the App Review exception in 3.3).

### Phase 3 · Purchase in the app and server verification (~2.5 days)

- [ ] **3.1 Paywall** (`SubscriptionScreen`, following `docs/ui/UI-BRIEF.md`).
  - *What:*
    - Load the product from the store, which shows the localized price including IVA.
    - Show what the subscription includes, the price, "se renueva cada mes", links to the terms and the privacy notice, **"Restaurar compras"** and **"Gestionar suscripción"** (Apple's manage-subscriptions sheet; Google's subscriptions deep link). Apple 3.1.2 requires all of these on a subscription paywall.
    - Hide "Suscribirme" when `GET /subscriptions/me` says the patient is already entitled on any platform.
  - *Solves:* I13, and App Review's paywall checks.
- [ ] **3.2 `POST /v1/subscriptions/me/purchases`.**
  - *What:*
    - The body is `{ platform, signedTransaction | purchaseToken, productId }`, with the header `Idempotency-Key` = Apple transaction id / Google token.
    - Permission `SELF_SUBSCRIPTION_WRITE`, not entitlement-gated.
    - The server:
      1. verifies with the store (Apple: `verifyTransaction`, then `getAllSubscriptionStatuses`; Google: `getSubscription`);
      2. checks that the bundle id or package name is this tenant's app, the product is this tenant's active product, and the **account token equals the caller's** `store_account_token`;
      3. runs `syncStoreSubscription` (5.1);
      4. on Google, **acknowledges** the purchase if it isn't yet (idempotent: an already-acknowledged purchase is fine);
      5. returns the entitlement.
    - If the account token belongs to **another patient** → `409 OWNED_BY_OTHER_ACCOUNT` ("Esta suscripción pertenece a otra cuenta de este nutriólogo").
    - On the app side:
      - **Apple:** call `finishTransaction` only after a 2xx. Listen to `Transaction.updates` on every launch, and re-send anything unfinished.
      - **Google:** on every launch, `queryPurchases` and re-send any purchase whose `acknowledged` is false.
  - *Why:* the store keeps an unfinished purchase until we confirm it. Re-sending on launch is safe, because the endpoint is idempotent and the database has a unique key. Google refunds an unacknowledged purchase after 3 days, so acknowledging on the server, and again in reconciliation, protects the nutritionist's revenue.
  - *Solves:* I1, I2, I4, I5, I6.
- [ ] **3.3 App Review and the environment.**
  - *What:* the production server verifies a transaction against **production first, then sandbox**. A sandbox purchase in production is accepted **only** for the App Review build (record `environment = SANDBOX`, log it, and let it expire normally). Preproduction accepts sandbox only.
  - *Why:* Apple's reviewers buy with sandbox accounts while the app talks to the production server. Rejecting sandbox there is a common cause of "purchase doesn't work" rejections.
  - *Solves:* I14, I17.
- [ ] **3.4 Restore.** "Restaurar compras" calls `AppStore.sync()` / `queryPurchases`, re-sends every current entitlement to 3.2, then refreshes the session.

**Done when:**
- a sandbox purchase unlocks the iOS app, and the same patient signed in on Android is unlocked too;
- killing the app right after Face ID and relaunching unlocks it, with no second charge;
- a second patient account on the same Apple ID gets `409` on restore;
- a Google purchase shows as acknowledged in Play Console.

### Phase 4 · Store notifications (~1.5 days)

- [ ] **4.1 Apple: `POST /v1/webhooks/apple`** (public, on `api`).
  - *What:*
    1. Verify the `signedPayload`.
    2. Route `bundleId` → tenant through `tenant_apps.bundle_id`. Unknown → `IGNORED`, then 200.
    3. Check the environment.
    4. `INSERT … ON CONFLICT DO NOTHING` on `notificationUUID`.
    5. Publish `ProcessSubscriptionEvent { provider: 'APPLE', notificationId }` and set `ENQUEUED`.
    6. Return 200, or 500 if the insert or the publish fails.

    Types handled: `SUBSCRIBED`, `DID_RENEW`, `DID_FAIL_TO_RENEW` (with subtype `GRACE_PERIOD`), `GRACE_PERIOD_EXPIRED`, `EXPIRED`, `DID_CHANGE_RENEWAL_STATUS`, `REFUND`, `REFUND_REVERSED`, `REVOKE`, `PRICE_INCREASE`. Others → `IGNORED`.
  - *Why:* when we don't answer 200, Apple retries **5 times, at 1, 12, 24, 48 and 72 hours**. Storing first and answering fast keeps that from happening. Duplicates stop at the primary key.
  - *Solves:* I7, I12, I17.
- [ ] **4.2 Google: `POST /store/google-rtdn`** (private, on `worker`, pushed by Pub/Sub).
  - *What:* decode the message. A `testNotification` → log and 204. A `subscriptionNotification` → route `packageName` → tenant, insert `(GOOGLE, messageId)` into the inbox, and process it **in the same request** (the worker is already the job runner). 204 on success, 500 to retry (Pub/Sub backoff, then `jobs-dlq` after 5 attempts).
  - Types handled: `PURCHASED`, `RENEWED`, `RECOVERED`, `IN_GRACE_PERIOD`, `ON_HOLD`, `CANCELED`, `RESTARTED`, `EXPIRED`, `REVOKED`, `PAUSED`, `PENDING_PURCHASE_CANCELED`, `PRICE_CHANGE_CONFIRMED`. They all lead to the same refetch.
  - *Solves:* I9, I12.
- [ ] **4.3 Processor** (`ProcessSubscriptionEvent`, provider-aware). Same steps as the Stripe plan's 5.2:
  1. lock the inbox row `FOR UPDATE SKIP LOCKED`, and skip it if `PROCESSED`;
  2. resolve the tenant and re-check its status;
  3. run `syncStoreSubscription`;
  4. mark it `PROCESSED` in the same transaction.

**Done when:** Apple's `requestTestNotification` and Play Console's test notification are both recorded; replaying an Apple notification changes nothing; a Google message that keeps failing ends up in `jobs-dlq`.

### Phase 5 · The single writer and status mapping (~1 day)

- [ ] **5.1 `syncStoreSubscription(tenantId, provider, ref)`.**
  - *What:*
    1. Take `pg_advisory_xact_lock` on `provider + originalTransactionId | purchaseToken`.
    2. **Inside the lock**, refetch: Apple `getAllSubscriptionStatuses`, Google `subscriptionsv2.get`.
    3. Resolve the patient from the account token in the signed data. A missing token (bought before the app set it) → match through a row we already have, or refuse and alert.
    4. Upsert with the mapped status, `currentPeriodEnd` (Apple `expiresDate`, Google `lineItems[].expiryTime`), `auto_renew`, `environment` and `last_synced_at`. For Google, if `linkedPurchaseToken` is set, mark that older row `replaced_at = now` (no longer live).
    5. Write the payment records (Stripe plan task 8.1, with store transactions as the source).
  - *Why:* same reasoning as the Stripe plan's 5.3: whoever writes second also read second, so a stale state can't win.
  - *Solves:* I2, I3, I10, I11.
- [ ] **5.2 Status mapping.**

  | Apple (subscription status) | Google (`subscriptionState`) | Ours | Access? |
  |---|---|---|---|
  | `1` active | `ACTIVE` | `ACTIVE` | yes |
  | auto-renew off, still active | `CANCELED` (before expiry) | `ACTIVE`, with `cancelAtPeriodEnd` | yes, until the period ends |
  | `4` billing grace period | `IN_GRACE_PERIOD` | `GRACE_PERIOD` | yes |
  | `3` billing retry (after grace) | `ON_HOLD` (account hold) | `PAST_DUE` | no |
  | — | `PAUSED` | `PAST_DUE` | no (pausing stays off in Play Console) |
  | — | `PENDING` (e.g. a slow payment method) | `PENDING` | no |
  | `2` expired | `EXPIRED` | `EXPIRED` | no |
  | `5` revoked, or a `REFUND` notification | `REVOKED`, or a voided purchase | `REFUNDED` | no |

  If the patient has a live subscription on **both** stores, raise `DOUBLE_STORE_SUBSCRIPTION`. Tell the patient by email to cancel one, through that store. A Google one can be refunded and revoked by our team through the API, after confirming with the nutritionist.
  - *Solves:* I12, I13.

### Phase 6 · Sweeper and reconciliation (~1 day)

- [ ] **6.1 Sweeper** (the same `/maintenance/payments-sweep` job as the Stripe plan): re-enqueue inbox rows stuck in `RECEIVED` or `ENQUEUED`.
- [ ] **6.2 Reconciliation, hourly** (`/maintenance/store-reconcile`).
  - *What:*
    - **Apple:** for each tenant iOS app, `getNotificationHistory` since the cursor (Apple keeps 180 days). Insert every notification we don't have into the inbox and enqueue it.
    - **Google:** there is no history API, so `subscriptionsv2.get` for every live row, every row past `currentPeriodEnd`, and every row not synced in 24 h. Acknowledge anything unacknowledged. Daily, `listVoidedPurchases` since the cursor, to catch refunds and chargebacks.
    - Log drift counts. Drift raises `RECONCILE_DRIFT`.
  - *Why:* the stores' notifications are best effort too. Apple stops retrying after 72 hours, and a broken Pub/Sub permission silently stops Google's.
  - *Solves:* I6, I8, I9, I11, I12.
- [ ] **6.3 Renewal leeway** in `entitlement.service.ts`: 6 hours past `currentPeriodEnd` for store rows, as in the Stripe plan.

**Done when:** pointing the Apple sandbox URL at a wrong path for an hour and then fixing it recovers every missed notification through the history API; a Google subscription renewed while notifications were off is corrected within the hour.

### Phase 7 · Account deletion, tenant suspension and refunds (~1 day)

- [ ] **7.1 Account deletion.**
  - *What:* before the patient confirms deletion, if they have a live **Apple** subscription, show: "Tu suscripción la cobra Apple y seguirá activa. Cancélala antes de eliminar tu cuenta.", with the **Gestionar suscripción** button. Apple requires apps to tell users how billing continues when they delete their account.

    For a live **Google** subscription, the deletion job calls `cancel` (no more renewals) through the API.

    A purchase or renewal arriving for a deleted patient raises `ORPHANED_STORE_PAYMENT` (with the process steps, as in the Stripe plan's 8.3):
    - **Google:** `revoke`, which refunds and ends it, automatically.
    - **Apple:** we can't refund. The email, sent to the address we still hold for legal records, explains how to request a refund from Apple at reportaproblem.apple.com.
  - *Why:* we can't cancel or refund an Apple subscription from the server. The only protection is telling the patient at the right moment.
  - *Solves:* I15.
- [ ] **7.2 Tenant suspended.**
  - *What:*
    - **Google:** for each live subscription, `cancel` (no more renewals). Patients have no access anyway while the tenant is suspended.
    - **Apple:** there is no server API to pause or cancel. Raise `TENANT_SUSPENDED_STORE_SUBSCRIPTIONS` listing the affected patients, and email each of them to cancel through Apple. The tenant owns the developer account, so it can also stop the subscription product in App Store Connect.
    - **Decide, open question:** what removing the subscription from sale does to existing Apple subscribers. Confirm with Apple's documentation before relying on it.
  - *Why:* the nutritionist sells through their own store account. With the stores we can only protect patients where the store gives us an API.
  - *Solves:* I16.
- [ ] **7.3 Refund requests.** Patients ask Apple or Google directly. On Apple, the app can open StoreKit's refund request sheet from "Gestionar suscripción". Refund outcomes reach us through `REFUND` / voided purchases (4.x, 6.2).

### Phase 8 · Price changes (~0.5 day)

- [ ] **8.1 Change the price in the stores**, with the nutritionist:
  - App Store Connect lets you keep the current price for existing subscribers or move them to the new one. For increases, Apple notifies subscribers and, above its limits, asks for their consent. We receive `PRICE_INCREASE` notifications.
  - Google Play price migration: existing subscribers are moved to the new price, with opt-in or opt-out depending on the size of the increase. We receive `PRICE_CHANGE_CONFIRMED`.
- [ ] **8.2 Our notices** (your requirement): a Resend email per patient and an Inicio card, **with the amount**, since in-app purchases may show prices. Use the same exactly-once notice table as the Stripe plan's 9.2.

### Phase 9 · Terms, privacy notice and App Review (~0.5 day of engineering)

- [ ] **9.1 Terms:**
  - the subscription is billed by Apple or Google, renews monthly, and is cancelled in the store's subscription settings;
  - refunds are requested from the store;
  - the price includes IVA;
  - Apple's standard licence agreement applies, or link our own.
- [ ] **9.2 Privacy notice (Mexico):**
  - Apple and Google process the payment under their own privacy policies; we receive transaction ids, status and amounts, never card details;
  - the stores receive no data from us beyond the random account token.
- [ ] **9.3 App Review notes:** a sandbox-ready review account, and where the paywall is. The subscription product is submitted with the version.

### Phase 10 · Tests and drills (~1 day, alongside)

- [ ] **Unit tests:**
  - the status mapping for both stores;
  - the environment rules;
  - the account-token check;
  - the `linkedPurchaseToken` replacement.
- [ ] **Integration tests** (fake gateways, real Postgres):
  - the app report and the notification arriving together;
  - the same report 5× in parallel;
  - a replayed Apple notification;
  - a Google message that keeps failing → DLQ;
  - a second patient account restoring → `409`;
  - a deleted patient's renewal → alert + Google revoke;
  - RLS isolation.
- [ ] **Store testing:**
  - **Apple sandbox:** monthly renews every 5 minutes, up to 12 times. Use the sandbox account settings to test interrupted purchases and billing retry.
  - **Google license testers:** test cards that always approve or always decline, accelerated renewals, and Play Billing Lab for grace period and account hold.
  - Run both on a development build and on TestFlight / the closed track.
- [ ] **Monitoring:**
  - Apple signature failures;
  - unknown bundle or package;
  - inbox rows stuck > 15 min;
  - drift > 0;
  - unacknowledged Google purchases older than 24 h;
  - `jobs-dlq`.

**Done when:** every row of the [failure table](#what-can-go-wrong-and-which-task-covers-it) has a passing test or a drill run on preproduction.

## Runbook

| Situation | What to do |
|---|---|
| A patient paid but has no access | Ask them to tap "Restaurar compras". If that fails, run `store sync-patient <slug> <patientId>`, which refetches from both stores. |
| An unacknowledged Google purchase | Reconciliation acknowledges it within the hour. If the alert persists, check the worker service account's Play Console permissions. |
| Apple notifications stopped | Check the URL in App Store Connect and the `apple.webhook.*` logs. Fix it, then run `/maintenance/store-reconcile`, which replays from the notification history. |
| Google notifications stopped | Check the `play-rtdn` publisher grant and the push subscription. Reconciliation polls in the meantime. |
| A double subscription across stores | Email the patient to cancel one. A Google one can be revoked by our team after confirming with the nutritionist. |
| Apple key rotation | Create a new In-App Purchase key in App Store Connect, add it as a new secret version, deploy, then revoke the old key. |

## Going live

- [ ] Each nutritionist's agreements, banking and tax forms (Apple) and payments profile (Google) are approved. **Start in week 5**: Apple's banking and tax review takes days.
- [ ] The products are approved with the first App Store version, and the Google subscription is active.
- [ ] The production `api` is the Apple production notification URL. Preproduction keeps the sandbox URL.
- [ ] Nothing from sandbox carries over. Sandbox transactions never exist in production.

## Estimate

About **12 working days**:

| Phases | Days |
|---|---|
| 0 (ours) + 1 | 1 |
| 2 | 1.5 |
| 3 | 2.5 |
| 4 | 1.5 |
| 5 | 1 |
| 6 | 1 |
| 7 | 1 |
| 8 | 0.5 |
| 9 | 0.5 |
| 10 | 1, spread out |

Proposed split:

- **Week 6:** phases 0–2.
- **Week 7:** phases 3–5. The [Goal](#goal) scenario works by the end of week 7.
- **Week 8:** phases 6, 7, 9 and 10.
- **After launch:** phase 8.

The nutritionists' store paperwork, not the code, is the likeliest delay.

## Later

- **Stripe for sales outside the app** (in person, the nutritionist's website), next to in-app purchase. It writes the same `patient_subscriptions` table; the Stripe plan's design applies.
- Introductory offers or free trials (Apple introductory offers, Google offers on the base plan).
- Responding to Apple's `CONSUMPTION_REQUEST`, which gives Apple usage information when a patient asks for a refund.

## Out of scope here

- Tenant → Project Limon billing (Project Limon's own Stripe account).
- The admin dashboard UI ([Platform admin dashboard](admin-dashboard.md)).
- CFDI receipts, more than one plan per tenant, upgrades and downgrades.
