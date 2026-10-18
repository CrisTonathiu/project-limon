# Patient payments with Stripe

**Planned:** 2026-10-17 · **Updated:** 2026-10-17 · **Target:** MVP weeks 6–8, see the [estimate](#estimate) · **Environment:** `preproduction`, Stripe **test mode** · **First tenant:** `carlos-nutrition` · Part of the [MVP roadmap](mvp-roadmap.md#week-7--nov-9--13--payments-stripe)

**Alternative under consideration:** [Patient payments with in-app purchases](in-app-purchases.md) (Apple and Google). Only one of the two will be built; that roadmap opens with a side-by-side comparison.

This roadmap builds the payment flow and the **data** the platform team needs: alerts, payment records and metrics. Showing that data to Project Limon admins is a separate roadmap, the [Platform admin dashboard](admin-dashboard.md). Until that dashboard exists, alerts reach the team by email (Cloud Monitoring, task 13.4) and through the `stripe` admin command.

## Goal

A patient pays a monthly subscription to their nutritionist through Stripe, outside the app, and the app unlocks as soon as the payment is confirmed. The money, the Stripe fees and any chargebacks belong to **the nutritionist's own Stripe account** (Stripe Connect).

The preproduction scenario this roadmap must make work, end to end:

1. A patient of `carlos-nutrition` signs in and sees the paywall.
2. They tap **"Enviar enlace de pago a mi correo"**.
3. An email from Carlos Nutrition arrives with a **"Pagar suscripción"** link.
4. The link opens Stripe Checkout, charging **MXN X / month** to a credit or debit card, on Carlos's connected Stripe account (test mode, test card `4242 4242 4242 4242`).
5. After paying, the patient goes back to the app and the content is unlocked, within seconds.

Beyond the happy path, the flow must be **correct under failure**. Every payment that Stripe accepts must end up as access in our database, and nothing may be charged or granted twice. In particular:

| Concern | What it means here |
|---|---|
| **Race conditions** | Two taps, two devices, two browser tabs, or a webhook and a redirect arriving at once must not create two checkout sessions, two subscriptions or two conflicting database writes. |
| **Idempotent requests** | Every request we send (to Stripe, to the email provider, to Pub/Sub) and every request we receive (from the app, from Stripe) can be retried safely. A retry has the same effect as the first attempt. |
| **Webhook retries and duplicates** | Stripe delivers each event **at least once** and **in no guaranteed order**. The same event can arrive twice, or two copies at once. Processing must be exactly-once in effect. |
| **Failed requests between Stripe and us** | Timeouts, cold starts, deploys, a bad webhook secret, Pub/Sub hiccups. A payment must never be "lost" because one request failed. |
| **State reconciliation** | Our database is a copy of Stripe's truth. It must converge back to Stripe's state on its own, even if webhooks never arrive. |
| **Nobody is charged for a service they can't use** | If a nutritionist leaves the platform, their Stripe account is restricted, or a patient deletes their account, charges stop or are refunded. |

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Who receives the money | **Stripe Connect, direct charges** on the nutritionist's connected account (`Stripe-Account` header). Products, prices, customers and subscriptions live on that account. | The nutritionist is the merchant of record. It matches [ADR-008](../architecture/adr/ADR-008-patient-payments.md) ("money should reach the nutritionist"). |
| Connect account type | **Standard-type accounts**, created with controller properties: `losses.payments: 'stripe'`, `fees.payer: 'account'`, `stripe_dashboard.type: 'full'`, `requirement_collection: 'stripe'`. This **replaces Express**, which the MVP roadmap had assumed. | **Chargebacks and negative balances belong to the nutritionist's account.** Stripe recovers losses from that account, not from Project Limon. With Express, the platform is liable for connected accounts' negative balances. The nutritionist gets the full Stripe Dashboard: payments, disputes, refunds and payouts. |
| Platform billing (tenant → Project Limon) | A **separate Stripe account** owned by Project Limon, which charges every tenant. It is **out of scope here**: separate keys, a separate webhook endpoint, `PlatformSubscription`. | The two money flows never mix. If a pricing option later uses `application_fee_percent`, those fees land in the **Connect platform account**, not in the billing account. Keep that in mind when choosing the [tenant pricing option](mvp-roadmap.md#tenant-pricing-options). |
| Payment methods | **Credit and debit cards only** for the MVP (`payment_method_types: ['card']`). **OXXO** comes later, as an option patients choose ([Later](#later)). | Cards are the only common Mexican method that supports automatic monthly renewal in Stripe. OXXO can't renew automatically, so it needs its own design. |
| Payment page | **Stripe Checkout Sessions** (`mode: subscription`), hosted by Stripe | Stripe handles the card form, 3-D Secure and PCI. Unlike Stripe *Payment Links*, a session carries our `client_reference_id` and metadata, a specific customer, and an expiry, all of which the robustness work below relies on. |
| What the email links to | **Our own stable URL** (`https://api.projectlimon.com/pay/<request>.<signature>`), which redirects to a Checkout Session created or reused on click | A Checkout URL expires after at most 24 h, and an email is read days later. Our URL can also refuse to charge a patient who has already paid or no longer has an account, and reuse one session for every click. |
| Webhooks | **One Connect webhook endpoint**, `POST /v1/webhooks/stripe`, which stores, enqueues and acknowledges (the "inbox" pattern) | Connect events carry `event.account`, which tells us the tenant. The request finishes in milliseconds, so slow work never causes Stripe timeouts and retries. |
| How we apply an event | **Refetch the object from Stripe** and write its current state. The event payload is never trusted as state. | Events arrive out of order and retries can be days old. Writing "Stripe's state now" makes ordering, staleness and duplicates harmless. |
| Failed renewals | **Stripe handles them** for now: Smart Retries and Stripe's own customer emails, configured on each nutritionist's account (task 0.6). Our own failed-payment flow comes [later](#later). | It works on day one, with no code. |
| Background processing | The existing Pub/Sub `jobs` topic → `worker` (`ProcessSubscriptionEvent`, `SendNotification` are already reserved in `packages/tenant/src/jobs.ts`) | Retries with backoff and a dead-letter topic already exist (GCP phase 5). |
| Source of entitlement | Unchanged: `patient_subscriptions` → `entitlement.service.ts` → `ENTITLED_PERMISSIONS` | The paywall and API gating are already built. This roadmap only fills the table. |
| Transactional email | **Resend** (from `pagos@mail.projectlimon.com`) | It was already short-listed in the GCP migration, since GCP has no SES. It has a simple HTTP API with an `Idempotency-Key` header. |
| Stripe API keys | **Restricted keys** (`rk_…`), one for the services and one for the admin command, never the full secret key (task 0.5) | If a key leaks, it can only do what that key allows. |
| Tax receipts | **No CFDI** for patient payments | Decided 2026-10-17. Prices are final amounts in MXN. |
| Free trials | **None** for now | Could be added later. The `trialing` status is already mapped, so adding trials needs no schema change. |
| Preproduction keys | Stripe **test mode** only. The config refuses live keys outside `production`. Nothing from the pilot's test setup is carried over to production ([Going live](#going-live)). | Preproduction must never move real money. |

### ⚠️ The in-app button, prices in the app, and the App Store

[Risk 1](mvp-roadmap.md#1-stripe-vs-app-store-rules-high) of the MVP roadmap says the app must contain **no purchase button, prices or links to pay**. Apple 3.1.1 forbids "buttons, external links, or other calls to action" toward payment outside In-App Purchase, and Google Play has the same rule. A button that **emails a payment link** is still a call to action inside the app. Apple does allow communication **outside** the app, such as email, about other payment methods, sent to users who agreed to receive it (3.1.3).

So:

- The button sits behind a **new tenant feature flag `payment_link_email`**. It is on for `carlos-nutrition` in preproduction and **off in any build sent to App Review**. Store builds send the same email **from the server**: after onboarding, and on request from our team (task 3.4). The backend is identical either way.
- The **price-change notice** on the home screen (task 10.4) shows the **date only**, never the amount, and no link. The amount goes in the email.

Decide before week 8's TestFlight build which trigger the pilot uses.

## The flow

```
Patient app            API (Cloud Run "api")                 worker            Resend      Stripe (Carlos's connected account)
    │ tap "Enviar enlace"   │                                     │                 │                │
    ├─POST /v1/subscriptions/me/payment-link  (Idempotency-Key)   │                 │                │
    │                       ├─ tx: lock patient, caps, create/reuse payment_request │                │
    │                       ├─ publish SendNotification ─────────▶│                 │                │
    │◀── 202 "enviado a c•••@gmail.com"                           ├─ send (Idempotency-Key) ▶│       │
    │                                                             │                 │── email ──▶ patient
    │                                                                                                │
 patient clicks the link ─▶ GET /pay/<id>.<sig>                                                      │
                            ├─ patient and tenant still active? already paid?                        │
                            ├─ tx: lock request; open session exists? reuse : create (Idempotency-Key)─▶│
                            └─ 303 → checkout.stripe.com ────────────────────────────────────────────▶│ patient pays by card
                                                                                                     │
          ┌──────────────── success redirect: GET /pay/<id>.<sig>/done?session_id=… ◀────────────────┤
          │                 └─ syncSubscription() (refetch from Stripe, write)                        │
          │                                                                                          │
          │                 POST /v1/webhooks/stripe ◀────────── event (at least once, any order) ────┤
          │                 ├─ verify signature, INSERT event ON CONFLICT DO NOTHING                  │
          │                 ├─ publish ProcessSubscriptionEvent ──▶ worker: lock event, refetch,      │
          │                 └─ 200                                   syncSubscription() / syncInvoice()│
          │                                                          → PROCESSED, payment records,    │
          │                                                            platform alerts                │
          │  Cloud Scheduler ─▶ worker: sweeper (5 min), reconciliation (hourly), price changes (daily)│
          │  Tenant lifecycle / account.updated ─▶ pause or resume collection ───────────────────────▶│
          ▼
 app: "Ya pagué" / foreground ─▶ POST /v1/subscriptions/me/sync ─▶ GET /v1/subscriptions/me → unlocked
```

Three independent paths write the subscription: the **success redirect**, the **webhook**, and **reconciliation**. Each one alone is enough to grant access. They all go through one function, `syncSubscription()`, which is serialized per subscription (task 5.3), so running two or three of them at once is harmless.

## What can go wrong, and which task covers it

| # | Failure | Without protection | Covered by |
|---|---|---|---|
| F1 | Patient double-taps the button, or the app retries on a flaky network | Two emails, two links, possibly two subscriptions | 3.1 (Idempotency-Key + row lock + one open request per patient) |
| F2 | Two devices request a link at the same moment | Two `payment_requests` rows | 1.3 (partial unique index), 3.1 (lock) |
| F3 | Pub/Sub publish fails right after the database commit | The request exists but no email is ever sent | 3.2 (outbox), 6.1 (sweeper) |
| F4 | The email job retries after Resend already accepted the email | The patient gets two emails, one with a dead link | 3.3 (deterministic signed link + Resend Idempotency-Key) |
| F5 | The patient opens the link in two tabs, or clicks it twice | Two Checkout Sessions, so two possible subscriptions | 4.1 (lock + reuse open session) |
| F6 | Our call to create the Checkout Session times out, but Stripe created it | A retry creates a second session | 2.1, 4.1 (Stripe Idempotency-Key, stable params) |
| F7 | The link is clicked after the patient has already paid | They pay twice | 4.1, 4.2 (entitled check + Stripe-side check) |
| F8 | Two sessions are completed anyway (e.g. an old session in a forgotten tab) | Two live subscriptions, double charge every month | 4.1 (expire old sessions), 1.5 + 5.3 (one-live-subscription index, auto-cancel and refund) |
| F9 | The patient returns to the app before the webhook arrives | "I paid but it's still locked" | 4.3 (success page syncs), 10.2 (Ya pagué / foreground refresh) |
| F10 | Stripe delivers the same event twice, or two copies concurrently | Double processing, conflicting writes | 5.1 (event id primary key), 5.2 (row lock on the event, PROCESSED in the same transaction) |
| F11 | Events arrive out of order (`subscription.updated` before `created`, or an old `past_due` after a newer `active`) | State goes backwards | 5.3 (refetch from Stripe under a per-subscription lock) |
| F12 | The webhook, the success page and reconciliation write the same subscription at once | Lost update, a stale state wins | 5.3 (advisory lock, fetch inside the lock) |
| F13 | The webhook endpoint is down (deploy, cold start, database outage) | Stripe retries, then gives up after 3 days (test mode: a few hours) | 5.1 (fast 2xx), 6.2 (reconciliation from `events.list`) |
| F14 | A wrong webhook secret: every delivery fails its signature check | No payment is ever recorded | 13.4 (alert on signature failures), 6.2 (reconciliation needs no webhooks), 0.5 (overlap during rotation) |
| F15 | The worker crashes halfway through an event | The event is stuck "in progress" | 5.2 (transactional processing), 6.1 (sweeper re-enqueues stale events), Pub/Sub retry + DLQ |
| F16 | A renewal webhook is late | The entitlement check sees `currentPeriodEnd` in the past and locks a paying patient out | 6.3 (renewal leeway), 6.2 (sync of overdue rows) |
| F17 | An event for an unknown connected account, or in the wrong mode (live event in preproduction) | Crashes, or the wrong tenant is written | 5.1 (livemode check), 5.2 (tenant resolution, IGNORED) |
| F18 | A tenant changes their price | Old links charge the old price, or existing patients are charged more without notice | 9.1–9.4 (announced price change, emails, in-app notice, applied at renewal) |
| F19 | The tenant is suspended, or its Stripe account is restricted | Patients keep being charged for an app they can't use, or every renewal fails | 7.1–7.4 (pause and resume collection, alerts) |
| F20 | The nutritionist disconnects their Stripe account from the platform | We lose access to their subscriptions without knowing | 5.2 (`account.application.deauthorized`), 7.3 (critical alert) |
| F21 | A patient pays after deleting their account (old link, or Checkout already open) | Charged for an account that no longer exists | 4.1 (refuse), 5.3 + 8.3 (cancel, refund, log the process) |
| F22 | Open sign-up abused to send many links (spam, card testing) | Mailbox flooding, card-testing fraud on the nutritionist's account | 3.1 (per-patient and **per-tenant hourly caps**), 0.6 (Radar) |
| F23 | A payment question from a patient, and nobody can see what happened | Support needs the Stripe Dashboard of each nutritionist | 8.1 (payment records), 8.2 (platform alerts) |

## Data model (summary)

New and changed tables. Details and reasons are in phases 1, 8 and 9.

```
tenants                       + stripe_account_id (unique), stripe_charges_enabled, stripe_account_status
tenant_billing_plans          tenant_id, stripe_price_id, amount_minor, currency, interval, active,
                              max_links_per_hour                                                          (RLS)
tenant_price_changes          tenant_id, from_plan_id, to_plan_id, announced_at, effective_at, status     (RLS)
patient_billing_customers     tenant_id, patient_id, stripe_account_id, stripe_customer_id                (RLS)
payment_requests              tenant_id, patient_id, status, source, idempotency_key, link_version,
                              link_expires_at, stripe_checkout_session_id, checkout_url,
                              checkout_expires_at, checkout_attempt, email_sent_at                       (RLS)
payment_link_sends            tenant_id, payment_request_id, sent_at, provider_message_id                 (RLS)
patient_price_change_notices  tenant_id, price_change_id, patient_id, subscription_id, email_sent_at,
                              dismissed_at, applied_at                                                    (RLS)
patient_subscriptions         + stripe_customer_id, payment_request_id, last_synced_at,
                                collection_paused_at, collection_paused_reason
                              + partial unique index: one live STRIPE subscription per patient
payments                      + patient_id, patient_subscription_id, stripe_account_id, stripe_invoice_id,
                                refunded_amount_minor, paid_at                                            (RLS, exists)
payment_transactions          type, stripe_object_id (unique), amount_minor, failure_code                 (RLS, exists)
stripe_webhook_events         id (evt_…), type, account_id, object_id, stripe_created_at, livemode,
                              status, attempts, last_error, tenant_id?, received_at, processed_at        (platform table, no payload)
stripe_reconcile_cursors      stripe_account_id, last_event_created_at, last_run_at                       (platform table)
platform_alerts               type, severity, dedupe_key (unique), tenant_id, patient_id?, details,
                              status, occurrences, first_seen_at, last_seen_at                            (platform table)
```

## To-do

Check items off here as they land. Each phase ends with a **Done when**. Every task gives **what** to build, **why**, and **what it solves** (the F-numbers above).

### Phase 0 · Accounts, keys, secrets and DNS (manual, ~0.5 day)

- [ ] **0.1 Stripe Connect platform account, in test mode.**
  - *What:* the Stripe Mexico account from MVP week 1, with Connect enabled. Confirm that **direct charges with subscriptions** are available for Mexican connected accounts created with Standard-type controller properties. Note the **API version** shown in Developers → Overview. The code pins it (task 2.1).

    This account is **not** the separate Project Limon billing account that will charge tenants.
  - *Why:* every later task needs the account. Pinning the API version stops a Dashboard upgrade from silently changing payload shapes. For example, from `2025-03-31` on, `current_period_end` lives on the subscription **item**, not the subscription.
- [ ] **0.2 Webhook endpoint (Connect).**
  - *What:* Developers → Webhooks → add an endpoint **listening to connected accounts**: `https://api.projectlimon.com/v1/webhooks/stripe`. Events:
    - Checkout: `checkout.session.completed`, `checkout.session.expired`.
    - Subscriptions: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
    - Invoices: `invoice.paid`, `invoice.payment_failed`.
    - Charges: `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`.
    - Accounts: `account.updated`, `account.application.deauthorized`.

    Put the signing secret (`whsec_…`) in Secret Manager **`stripe-webhook-secret`**.
  - *Why:* without the "connected accounts" option, events from Carlos's account never reach us. Subscribing to only these events keeps noise and retries down.
- [ ] **0.3 Resend account and sending domain.**
  - *What:* verify `mail.projectlimon.com` in Resend, add its **SPF, DKIM and DMARC** records at Hostinger, and put the API key in Secret Manager **`resend-api-key`**. Add a random 32-byte **`payment-link-secret`** (it signs the links in the email, task 3.3).
  - *Why:* without SPF and DKIM the email lands in spam, or Gmail rejects it. A subdomain keeps a bad sending reputation away from `projectlimon.com`.
- [ ] **0.4 Terraform.**
  - *What:* add the new secrets and the variables `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRETS`, `RESEND_API_KEY`, `PAYMENT_LINK_SECRET`, `EMAIL_FROM`, `PUBLIC_BASE_URL=https://api.projectlimon.com` to `local.service_secrets` / `local.service_env` in `api.tf` (both services share them). Add the Cloud Scheduler jobs from phases 6 and 9 to `jobs.tf`.
  - *Why:* the infrastructure is code. Secret values stay manual, as for FatSecret.
- [ ] **0.5 Restricted API keys and rotation.**
  - *What:* create two **restricted keys** in Developers → API keys. Each is allowed only the resources listed (*Write* includes read; everything else is *None*):

    | Key | Used by | Write | Read |
    |---|---|---|---|
    | `limon-services` → Secret Manager **`stripe-secret-key`** | `api`, `worker` | Checkout Sessions, Customers, Subscriptions, Refunds | Prices, Products, Invoices, Charges, Payment Intents, Disputes, Events, Accounts |
    | `limon-admin` → Secret Manager **`stripe-admin-key`**, readable only by the platform team's own accounts, not by any service account | the `stripe` admin command (task 2.3) | Accounts, Account Links, Products, Prices | Subscriptions, Customers, Events |

    Run each call once in test mode with these keys. A missing permission fails clearly, with `permission_error`.

    For rotation, the webhook verifier accepts a **list** of secrets (`STRIPE_WEBHOOK_SECRETS`, comma-separated), so a rolled secret and the previous one both work during the overlap. The rotation steps are in the [Runbook](#runbook).
  - *Why:* the full secret key can do anything on the platform: read every customer, refund any charge, change the webhook endpoints. A leaked restricted key can only do what it lists. The services never need to create accounts or prices, so a leak from Cloud Run can't create them. The admin key, which can, never sits in a running service.
- [ ] **0.6 Nutritionist Stripe account checklist** (for each tenant, done with the nutritionist during onboarding; with Standard accounts these settings are theirs):
  - *What:*
    - Settings → Billing → **Subscriptions and emails**: turn on **Smart Retries**, **emails to customers about failed payments**, and **receipts for successful payments**. After all retries fail, set the subscription to **"mark as unpaid"** (it maps to `PAST_DUE`, task 5.4).
    - Settings → Public details: the **terms of service URL** (task 12.1) and a support email. Set the **statement descriptor** to the practice name ("CARLOS NUTRICION"), so patients recognise the charge on their statement.
    - Radar: keep Stripe's default rules. Add a rule to block payments when the card's country isn't Mexico (`:card_country: != 'MX'`), unless the nutritionist has patients abroad.
  - *Why:* failed renewals are handled by Stripe for now. A recognisable descriptor and a clear receipt prevent "I don't know this charge" chargebacks, which with Standard accounts cost the nutritionist. The terms URL is needed for Checkout's terms checkbox (task 4.1).
  - *Solves:* F22 (card testing), and fewer disputes.

**Done when:** both restricted keys work for their calls in test mode, Resend shows the domain as verified, Carlos's test account has the checklist done, and `terraform plan` is clean.

### Phase 1 · Schema (~0.5 day)

One migration, `0018_stripe_payments`, plus RLS policies and isolation tests. The tables for payment records, alerts and price changes are described where they're used (phases 8 and 9), but they ship in the same migration.

- [ ] **1.1 Tenant billing settings.**
  - *What:*
    - On `tenants`: `stripe_account_id` (unique, nullable), `stripe_charges_enabled` (boolean) and `stripe_account_status` (`PENDING | ENABLED | RESTRICTED | DEAUTHORIZED`).
    - A new table `tenant_billing_plans (id, tenant_id, stripe_price_id unique, amount_minor, currency char(3), interval, active, max_links_per_hour default 60, created_at)`, with a partial unique index on `(tenant_id) WHERE active`.
  - *Why:* each nutritionist charges their own price ("MXN X / month") on their own account. Stripe prices are immutable, so a price change adds a row and deactivates the old one, which keeps the history of what each patient was charged. The account status stops us from sending links for an account that can't take payments, and drives pausing (phase 7).
  - *Solves:* F18, F19, F22.
- [ ] **1.2 `patient_billing_customers`.**
  - *What:* `(tenant_id, patient_id, stripe_account_id, stripe_customer_id)`, unique on `(tenant_id, patient_id)` and on `(stripe_account_id, stripe_customer_id)`.
  - *Why:* **exactly one** Stripe customer per patient per tenant. It lets us ask Stripe "does this patient already have a subscription?" (task 4.2), and it maps any event's `customer` back to a patient. Without it, every Checkout creates a new customer, and duplicates become invisible.
  - *Solves:* F7, F8, F11 (cross-check), and the reconciliation lookup in 6.2.
- [ ] **1.3 `payment_requests` and `payment_link_sends`.**
  - *What:*
    - `payment_requests`: `id, tenant_id, patient_id, status (REQUESTED | EMAIL_SENT | CHECKOUT_OPEN | COMPLETED | EXPIRED | CANCELED), source (APP | ONBOARDING | ADMIN), idempotency_key, link_version int, link_expires_at, stripe_checkout_session_id, checkout_url, checkout_expires_at, checkout_attempt int, email_sent_at, created_at, updated_at`. Two constraints:
      - unique `(tenant_id, patient_id, idempotency_key)`, so the same app request can't create two rows;
      - partial unique `(tenant_id, patient_id) WHERE status IN ('REQUESTED','EMAIL_SENT','CHECKOUT_OPEN')`, so **at most one open request per patient**.
    - `payment_link_sends`: `(id, tenant_id, payment_request_id, sent_at, provider_message_id)`, one row per email actually sent, indexed on `(tenant_id, sent_at)`.
  - *Why:* the request row is the one record of "this patient asked to pay". It is the anchor for every idempotency key we send to Stripe and Resend, and the row we lock to serialize clicks. The constraints enforce the rules in the database, so they hold even when application code races. The sends table is what the per-patient and per-tenant caps count (task 3.1).
  - *Solves:* F1, F2, F5, F6, F22.
- [ ] **1.4 `stripe_webhook_events` (the inbox).**
  - *What:* `id text primary key` (Stripe's `evt_…`), `type, account_id, object_id, stripe_created_at, livemode, status (RECEIVED | ENQUEUED | PROCESSED | IGNORED | FAILED), attempts, last_error, tenant_id (nullable, filled once resolved), received_at, processed_at`. **No event payload is stored**: we refetch from Stripe (task 5.3), so no patient email or card details sit in our database.

    It is a **platform table**, not under tenant RLS, because an event arrives before we know its tenant. `limon_app` gets `SELECT, INSERT, UPDATE` on it only. A new `SECURITY DEFINER` function, `app_resolve_tenant_by_stripe_account(text)`, returns the tenant id, matching the existing pre-tenant pattern (`app_resolve_tenant_app`). Document the exception in `multi-tenancy.md`.
  - *Why:* the primary key on Stripe's event id is the **deduplication**. A second delivery of the same event hits `ON CONFLICT DO NOTHING` and is recognized. The status column makes processing resumable and observable.
  - *Solves:* F10, F13, F15, F17.
- [ ] **1.5 `patient_subscriptions` additions.**
  - *What:* `stripe_customer_id`, `payment_request_id`, `last_synced_at`, `collection_paused_at`, `collection_paused_reason (TENANT_SUSPENDED | ACCOUNT_RESTRICTED)`. A partial unique index **`(tenant_id, patient_id) WHERE provider = 'STRIPE' AND status IN ('TRIALING','ACTIVE','GRACE_PERIOD')`**. The existing unique `(provider, provider_subscription_id)` already guarantees one row per Stripe subscription, so writes are upserts.
  - *Why:* the database itself refuses a second live subscription for one patient. When it happens (F8), the processor catches the violation and handles it (task 5.3) instead of silently granting two. The pause columns record why Stripe isn't collecting (phase 7).
  - *Solves:* F8, F10, F12, F19.
- [ ] **1.6 `stripe_reconcile_cursors`.**
  - *What:* `(stripe_account_id primary key, last_event_created_at, last_run_at)`. A platform table.
  - *Why:* reconciliation (6.2) only scans events newer than its last run, so each run stays small.
- [ ] **1.7 RLS and tests.**
  - *What:* RLS policies on every new tenant table, using the same pattern as every tenant table. Extend `packages/database/test/integration/tenant-isolation.test.ts` so tenant A can't see B's rows.
  - *Why:* payment data is the most sensitive data after health data.

**Done when:** the migration runs on an empty database and on preproduction (migrate job), and the RLS tests pass, including the new tables.

### Phase 2 · Stripe client and tenant setup (~1 day)

- [ ] **2.1 `apps/api/src/infrastructure/stripe.ts`, a `StripeGateway`.**
  - *What:* a thin wrapper around the `stripe` Node SDK, in the container as `stripe: StripeGateway | null` (null when unconfigured, like `fatsecret`). Settings: `apiVersion` pinned (task 0.1), `timeout: 10_000`, `maxNetworkRetries: 2`. Every method takes the connected account id and **requires an `idempotencyKey` on every create/update call**: the type forbids calling without one.

    Methods: `createCustomer`, `createCheckoutSession`, `expireCheckoutSession`, `retrieveCheckoutSession`, `retrieveSubscription`, `listSubscriptions`, `updateSubscription` (pause, resume, price), `cancelSubscription`, `refundInvoicePayment`, `retrieveInvoice`, `listEvents`, `retrieveAccount`. The admin command has its own small client for accounts and prices, using the admin key. Add a `FakeStripeGateway` for unit and integration tests.
  - *Why:* a timeout doesn't tell us whether Stripe acted. With an idempotency key, a retry returns the **original** result instead of acting twice. Stripe keeps keys for at least 24 h, and the SDK's own network retries reuse the same key. Keys are **derived from our rows** (`customer/{tenantId}/{patientId}`, `checkout/{requestId}/{attempt}`, …), so a retry after a process crash sends the same key too.
  - *Watch out:* Stripe rejects a reused key **with different parameters** (`idempotency_error`). So any parameter that changes over time, such as `expires_at`, is computed once, **stored on the row**, and reused on retry.
  - *Solves:* F6, and every "request to Stripe failed halfway".
- [ ] **2.2 Config.**
  - *What:* in `packages/config`, add `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRETS` (a list), `RESEND_API_KEY`, `PAYMENT_LINK_SECRET`, `EMAIL_FROM` and `PUBLIC_BASE_URL`. `superRefine` checks:
    - keys come in pairs (as for FatSecret);
    - **live keys (`sk_live_`, `rk_live_`) are refused unless `APP_ENV=production`**, and test keys are refused in production;
    - a full `sk_` key is refused outside development, so only restricted keys run on GCP.

    Update `.env.example`.
  - *Why:* fail at boot, not at the first payment. A mixed-up key can't charge real cards from preproduction, and nobody can deploy the all-powerful key by accident.
- [ ] **2.3 Admin commands, `pnpm --filter @limon/api stripe <command> <slug>`** (`apps/api/scripts/stripe.ts`, like `fatsecret.ts`, using the admin key):
  - `connect <slug>`: creates the connected account with Standard-type controller properties (idempotency key `connect-account/{tenantId}`), saves `tenants.stripe_account_id`, and prints an **onboarding link**. Account Links expire within minutes, so the command can be re-run to get a new one. In test mode, finish onboarding with Stripe's test data.
  - `price <slug> --amount 499 --currency mxn --interval month`: the **first** price only. It creates a Product and Price **on the connected account** and inserts the active `tenant_billing_plans` row. Changing an existing price is `price-change` (phase 9).
  - `status <slug>`: account id and status, `charges_enabled`, active price, a pending price change, counts of live and paused subscriptions here and in Stripe.
  - `sync-patient <slug> <patientId>`: runs task 6.4's sync, for support.
  - `alerts [--open]`: lists `platform_alerts` until the admin dashboard exists.
  - *Why:* there is no dashboard in the MVP, so our team sets tenants up. Scripted steps can be repeated, which "clicking in the Dashboard" can't.

**Done when:** `stripe connect carlos-nutrition` and `stripe price carlos-nutrition --amount <X> --currency mxn --interval month` have run, and `stripe status carlos-nutrition` shows `ENABLED` and the price.

### Phase 3 · Request a payment link: button → email (~1.5 days)

- [ ] **3.1 `POST /v1/subscriptions/me/payment-link`.**
  - *What:* a new permission, `SELF_SUBSCRIPTION_WRITE`. Like `SELF_SUBSCRIPTION_READ`, it is **not** entitlement-gated, since an unpaid patient must be able to pay. The endpoint requires the header **`Idempotency-Key`** (a UUID the app generates per tap). In one `withTenant` transaction:
    1. `SELECT … FOR UPDATE` on the patient's row, which serializes all requests from this patient (two devices, two taps).
    2. If a row with this `(patient, idempotency_key)` exists → return it unchanged (a retry).
    3. If the patient is already entitled → `409 ALREADY_SUBSCRIBED`.
    4. If the tenant isn't `TRIAL`/`ACTIVE`, its account isn't `ENABLED`, or it has no active plan → `409 PAYMENTS_NOT_AVAILABLE`.
    5. **Caps**, counted from `payment_link_sends`:
       - per patient, 5 emails per 24 h;
       - per tenant, `max_links_per_hour` (default 60, set per tenant).

       Over a cap → `429 RATE_LIMITED`. A tenant reaching its cap also raises the alert `TENANT_LINK_CAP_REACHED` (task 8.2).
    6. If an **open** request exists → reuse it: resend its email unless one went out in the last 60 s, and bump `link_version` only if the link expired.
    7. Otherwise insert a new `payment_requests` row (`REQUESTED`, `link_expires_at = now + 7 days`).

    After the commit, publish `SendNotification { kind: 'payment_link', paymentRequestId }`. Respond `202 { requestId, sentTo: "c•••@gmail.com", resendAvailableAt }`.
  - *Why:* mobile networks drop responses, and users tap twice. The idempotency key makes a retried request return the same answer. The row lock and the "one open request" index make concurrent requests from two devices collapse into one. The caps stop the button from flooding a mailbox, and stop open sign-up from being used to mass-test stolen cards. A tenant suddenly sending dozens of links an hour is unusual enough to tell the team about.
  - *Solves:* F1, F2, F22.
- [ ] **3.2 Outbox for the email job.**
  - *What:* the database row is written first, then the job is published. If publishing fails, the API still returns 202 (the request is durable), and the **sweeper** (6.1) republishes any `REQUESTED` request with no `email_sent_at` after 2 minutes. Job payloads hold **ids only** (an existing rule in `jobs.ts`).
  - *Why:* we can't commit a Postgres transaction and a Pub/Sub publish atomically (the "dual write" problem). Writing the database first and sweeping makes the email **eventually certain** instead of "usually sent".
  - *Solves:* F3.
- [ ] **3.3 Email handler (`SendNotification` → `payment_link`).**
  - *What:*
    1. Load the request. If `email_sent_at` is already set for the current `link_version` → return (done earlier).
    2. Build the link **deterministically**: `/pay/{requestId}.{sig}`, where `sig = HMAC-SHA256(PAYMENT_LINK_SECRET, requestId + ':' + link_version)`, base64url. Nothing secret is stored, and a retry rebuilds the exact same link.
    3. Send through Resend with `Idempotency-Key: payment-link/{requestId}/{link_version}/{sendCount}`.
    4. Set `status = EMAIL_SENT` and `email_sent_at`, and insert the `payment_link_sends` row.

    The email is in Spanish, with the tenant's name and brand colour, the amount and period ("MXN 499 al mes, se renueva automáticamente"), a "Pagar suscripción" button, "el enlace vence el …", a link to the terms, and "si no lo pediste, ignora este correo". From: `"Carlos Nutrition" <pagos@mail.projectlimon.com>`. It goes to the patient's **verified** login email. Never log the address (the logger already redacts `*.email`).

    Build the email templates (`payment_link`, and later `price_change`) on one shared, tested renderer.
  - *Why:* if the worker crashes after Resend accepted the email but before we mark it sent, Pub/Sub redelivers the job. The idempotency key makes Resend return the first result without sending again. Because the link is deterministic, even if a second email did go out, **both links work**. A random token generated on each attempt would leave the first email with a dead link.
  - *Solves:* F4.
- [ ] **3.4 Server-side trigger for store builds.**
  - *What:* a `requestPaymentLink(ctx, { source })` service function that 3.1 calls. It is also called when a patient finishes onboarding (if the tenant doesn't have `payment_link_email` on), and by `stripe send-link <slug> <patientId>`. The same caps apply to every source.
  - *Why:* the App Store section above. Store builds get the same email without an in-app call to action.

**Done when:** in preproduction, tapping the button 5 times quickly sends **one** email; the 61st link in an hour for one tenant is refused and raises an alert; killing the worker after Resend accepts and before the row update still leaves one working link; disabling Pub/Sub publishing (wrong topic) still delivers the email within ~5 minutes through the sweeper.

### Phase 4 · The pay page and Checkout (~1 day)

These are plain server-rendered HTML routes on the `api` service, outside `/v1`: no JavaScript, Spanish copy, the tenant's name and colour. Headers: `Cache-Control: no-store` and `Referrer-Policy: no-referrer` (the link is a bearer credential).

- [ ] **4.1 `GET /pay/:requestId.:sig`: redirect to Checkout.**
  - *What:*
    1. Verify the HMAC in constant time, then load the request. If it's expired or canceled → an "Este enlace venció, pide uno nuevo en la app" page.
    2. **Account check.** If the patient is deleted (`deletedAt`) or their user is disabled → "Esta cuenta ya no existe", no Stripe call, and cancel the request. If the tenant isn't `TRIAL`/`ACTIVE` or its account isn't `ENABLED` → "Los pagos no están disponibles por ahora".
    3. If the patient is already entitled → "Tu suscripción ya está activa" (no Stripe call).
    4. In one transaction, `SELECT … FOR UPDATE` the request row. If it has a Checkout Session that expires more than 5 minutes from now → **303 to the stored `checkout_url`**.
    5. Otherwise create a session with idempotency key `checkout/{requestId}/{checkout_attempt}`. Get the customer first (create it with key `customer/{tenantId}/{patientId}` and save it in `patient_billing_customers` if missing). The session params:
       - `mode: 'subscription'`, `payment_method_types: ['card']`, and the tenant's **active** price, read now (not at email time);
       - `customer`, `client_reference_id: requestId`, `locale: 'es'`;
       - `consent_collection.terms_of_service: 'required'`, the terms checkbox, using the URL from task 0.6;
       - `metadata` and `subscription_data.metadata`: `{ tenantId, patientId, paymentRequestId }`;
       - `expires_at`: stored before the call, about 1 h;
       - `success_url`: `/pay/{id}.{sig}/done?session_id={CHECKOUT_SESSION_ID}`, and `cancel_url`.
    6. Save the session id, URL and expiry (`CHECKOUT_OPEN`), then 303.

    When a new attempt replaces an expired session, also call `expireCheckoutSession` on the old one, which is harmless if it already expired.
  - *Why:* the account check stops charging someone who deleted their account, before any money moves. The lock makes two tabs or two clicks share **one** session. The idempotency key covers a timeout while creating it. Expiring superseded sessions means no old Checkout page stays payable. `subscription_data.metadata` puts our ids on the **subscription itself**, so every later event can be tied to the patient without a lookup. The terms checkbox records that the patient accepted the renewal and cancellation terms at the moment of paying.
  - *Solves:* F5, F6, F7, F8 (prevention), F18, F21 (prevention).
- [ ] **4.2 Check Stripe before creating a session.**
  - *What:* when the patient already has a Stripe customer, call `listSubscriptions({ customer, status: 'all' })` first. A live one (`active`, `trialing`, `past_due`) means we missed its webhook: run `syncSubscription` (5.3) and show "Tu suscripción ya está activa" instead of a new Checkout.
  - *Why:* our database can be behind Stripe. This is the last check before money moves, so it asks Stripe directly.
  - *Solves:* F7, F13.
- [ ] **4.3 `GET /pay/:requestId.:sig/done?session_id=…`: confirm on return.**
  - *What:* retrieve the session from Stripe on the tenant's account and check that `client_reference_id` is this request. If `status = 'complete'`, call `syncSubscription(session.subscription)` and mark the request `COMPLETED`. Record the terms acceptance from `session.consent` as a `PatientConsent` (`TERMS_OF_SERVICE`, with the current document version).

    Then show "¡Listo! Tu pago se registró. Regresa a la app de Carlos Nutrition." If it isn't complete yet, show "Estamos confirmando tu pago…"; the webhook will finish the job. Never grant access from the query string alone: only from what Stripe returns.
  - *Why:* the patient often comes back faster than the webhook, and a cold `api` instance can delay the webhook further. This path alone makes "access within seconds" true.
  - *Solves:* F9.
- [ ] **4.4 Cancel and error pages.**
  - *What:* `cancel_url` → "No se hizo ningún cargo. Puedes volver a usar el enlace del correo." The request stays open, so the same link works again.
- [ ] **4.5 Rate limit `/pay/*`** (per IP, e.g. 30/min) and log `payment.link.opened` with the request id, never the signature.

**Done when:** opening the link in two tabs at once shows the **same** Checkout session id; opening it after paying shows "ya activa"; opening it after deleting the account shows "ya no existe" and creates no session; and paying, then returning, unlocks `GET /v1/subscriptions/me` **before** the webhook is processed (test this by pausing the worker).

### Phase 5 · Webhooks: receive, deduplicate, process (~1.5 days)

- [ ] **5.1 `POST /v1/webhooks/stripe`: receive and acknowledge.**
  - *What:*
    1. A raw-body content parser **scoped to this route**: signature verification needs the exact bytes, and the JSON parser would change them.
    2. `stripe.webhooks.constructEvent(raw, header, secret)`, trying each secret in `STRIPE_WEBHOOK_SECRETS`, with the default 5-minute tolerance. A bad signature → `400` and the log line `stripe.webhook.signature_failed` (alerted, 13.4).
    3. Reject `event.livemode` that doesn't match the environment (`IGNORED`).
    4. `INSERT … ON CONFLICT (id) DO NOTHING` into `stripe_webhook_events` (`RECEIVED`).
    5. If the row is new or still `RECEIVED` → publish `ProcessSubscriptionEvent { eventId }` and set `ENQUEUED`. If it's already `ENQUEUED`, `PROCESSED` or `IGNORED` → do nothing (a duplicate).
    6. Return `200`. If the database insert fails → `500` (Stripe retries). If only the publish fails → `500` too: Stripe retries, the retry is deduplicated by step 4, and the sweeper is a second net.

    The route makes no Stripe API calls and does no business logic. It is excluded from the per-instance rate limit (or given a high limit).
  - *Why:* Stripe counts a slow response as failed and retries it, and the `api` scales to zero, so cold starts already eat into the time budget. Saving durably first and processing later keeps the endpoint fast and makes every delivery safe to repeat. The event id primary key turns "at least once" into "once" on our side.
  - *Solves:* F10, F13, F14, F17.
- [ ] **5.2 `ProcessSubscriptionEvent` handler (worker).**
  - *What:* in one database transaction:
    1. `SELECT … FROM stripe_webhook_events WHERE id = $1 FOR UPDATE SKIP LOCKED`. If no row comes back, another worker holds it: acknowledge and let it finish (the sweeper covers it if that worker dies). If the status is `PROCESSED` or `IGNORED` → acknowledge.
    2. Resolve the tenant with `app_resolve_tenant_by_stripe_account(event.account)`. Unknown → `IGNORED` and log `stripe.event.unknown_account`. Re-check the tenant status (an existing rule for jobs).
    3. Dispatch on the type:
       - `checkout.session.completed` → `syncSubscription(session.subscription)` and set the request `COMPLETED`;
       - `checkout.session.expired` → move the request from `CHECKOUT_OPEN` back to `EMAIL_SENT`, so the next click creates a fresh session;
       - `customer.subscription.*` → `syncSubscription(subscriptionId)`;
       - `invoice.paid`, `invoice.payment_failed` → `syncSubscription` + `syncInvoice` (payment records, 8.1);
       - `charge.refunded`, `charge.dispute.*` → `syncInvoice` + `syncSubscription`;
       - `account.updated` → `syncAccount` (status, then pause or resume, phase 7);
       - `account.application.deauthorized` → set the account `DEAUTHORIZED` and raise a **critical** alert (7.3).
    4. Set the event `PROCESSED` **in the same transaction** as the state change.

    Transient errors (Stripe 5xx or timeout, database) → increment `attempts`, store `last_error`, throw, and Pub/Sub retries with backoff, sending to `jobs-dlq` after 5 attempts (GCP phase 5). Permanent errors → `FAILED` or `IGNORED`, acknowledged.
  - *Why:* marking the event processed in the same transaction as the write means a crash leaves **both or neither**, never "subscription written but event looks unprocessed", or the reverse. The row lock stops two concurrent deliveries of the same event (two Stripe retries, or a Stripe retry plus a sweeper republish) from both running.
  - *Solves:* F10, F15, F17, F20.
- [ ] **5.3 `syncSubscription(tenantId, accountId, subscriptionId)`: the single writer.**
  - *What:* the **only** function that writes Stripe subscriptions to `patient_subscriptions`. The webhook, the success page, reconciliation and "Ya pagué" all call it.
    1. Open a tenant transaction and take `pg_advisory_xact_lock(hashtext('stripe-sub:' || subscriptionId))`.
    2. **Inside the lock**, fetch the subscription from Stripe (`expand: ['items']`).
    3. Resolve the patient from `subscription.metadata.patientId`, and check that `subscription.customer` equals that patient's `patient_billing_customers` row and that the tenant matches. A mismatch → refuse and alert.
    4. **Deleted patient guard.** If the patient is deleted or their user disabled, and the subscription is live → cancel it right away and refund its latest paid invoice in full. Use idempotency keys `orphan-cancel/{subId}` and `orphan-refund/{invoiceId}`. Store it as `REFUNDED` and record the whole process (task 8.3).
    5. **Write.** Upsert on `(provider, provider_subscription_id)` with the mapped status, `currentPeriodEnd` (from the item, given the pinned API version), `cancelAtPeriodEnd`, `productId` (the price id), `stripeAccountId`, `stripeCustomerId`, `paymentRequestId`, the pause state (`pause_collection`) and `last_synced_at`.
    6. **Duplicate guard.** If the upsert violates the one-live-subscription index, the patient already has another live subscription. Keep the older one and cancel the newer one right away. Refund its first invoice (idempotency keys `dup-cancel/{subId}` and `dup-refund/{invoiceId}`), store it as `CANCELED`/`REFUNDED`, and raise the alert `DUPLICATE_SUBSCRIPTION_REFUNDED`.
  - *Why:* fetching **after** taking the lock means whoever writes second also read second, so it holds Stripe's newer state, and a stale state can't overwrite a newer one. Refetching instead of reading the event payload makes out-of-order and days-late events harmless: they just trigger a fresh read. Keeping the transaction open during one Stripe call (~300 ms, 10 s timeout) is fine at pilot volume; revisit only if it shows up in database metrics.

    Refunds come out of the nutritionist's account (direct charges), and Stripe doesn't return its processing fee on a refund. The terms (task 12.1) say so.
  - *Solves:* F8 (detection and automatic repair), F11, F12, F21.
- [ ] **5.4 Status mapping** (Stripe → `PatientSubscriptionStatus`), in one pure, unit-tested function:

  | Stripe `status` | Ours | Access? | Note |
  |---|---|---|---|
  | `incomplete` | `PENDING` | no | First payment not confirmed yet (e.g. 3-D Secure pending) |
  | `trialing` | `TRIALING` | yes | No trials for now, but mapped |
  | `active` | `ACTIVE` | yes | Also while collection is paused for `ACCOUNT_RESTRICTED` (phase 7) |
  | `past_due` | `GRACE_PERIOD` | yes | Stripe is retrying a failed renewal (Smart Retries); the patient keeps access meanwhile, as the entitlement service intends |
  | `unpaid` | `PAST_DUE` | no | Retries exhausted, subscription kept open (task 0.6 setting) |
  | `paused` | `PAST_DUE` | no | Not used by our flow (that's Stripe's trial-without-card pause, not `pause_collection`) |
  | `canceled` | `CANCELED` | no | `cancelAtPeriodEnd` keeps access until `currentPeriodEnd` while still `active` |
  | `incomplete_expired` | `EXPIRED` | no | First payment never completed |
  | full refund of the latest invoice (`charge.refunded`) | `REFUNDED`, and cancel the subscription | no | **Decide:** whether a refund the nutritionist gives in their Dashboard ends access immediately. Proposed: yes, for a full refund only |

**Done when:** `stripe events resend <evt>` (Stripe CLI) on a processed event does nothing; sending the same event 5 times **concurrently** to the endpoint leaves one `PROCESSED` row and one write; delivering `customer.subscription.updated` (canceled) **before** `checkout.session.completed` ends in the right final state.

### Phase 6 · Sweeper and reconciliation (~1 day)

- [ ] **6.1 Sweeper: `POST /maintenance/payments-sweep`, every 5 minutes (Cloud Scheduler).**
  - *What:* it republishes:
    - `stripe_webhook_events` still `RECEIVED` or `ENQUEUED` after 10 minutes, with fewer than 10 attempts (beyond that → `FAILED` and the alert `STRIPE_EVENTS_STUCK`);
    - `payment_requests` still `REQUESTED` with no email after 2 minutes;
    - pause or resume jobs that haven't completed (phase 7);
    - price-change emails not yet sent (phase 9).

    It also expires `payment_requests` past `link_expires_at`. It runs `SELECT … FOR UPDATE SKIP LOCKED` in batches, so two sweeper runs can't pick the same rows. *(Cloud Scheduler's 3 free jobs are taken by food-cache, weekly-plans and this one; reconciliation and price changes cost ≈ US$0.10/month each.)*
  - *Why:* this closes every "written to the database but its job was lost" gap: a failed publish, a worker crash after locking, or a message that went to the DLQ. Without it, those rows wait forever.
  - *Solves:* F3, F15.
- [ ] **6.2 Reconciliation: `POST /maintenance/stripe-reconcile`, hourly in preproduction** (daily in production, plus on demand).
  - *What:* for each tenant with a `stripe_account_id` that isn't `DEAUTHORIZED`:
    - **(a) Missed events.** `events.list({ created: { gte: cursor − 5 min }, types: [...] })` on the connected account. Insert every event we don't have into `stripe_webhook_events` and enqueue it, then advance the cursor. Stripe keeps events for 30 days, so this recovers anything the webhook missed, even when the webhook never worked.
    - **(b) Overdue rows.** Every local live row whose `currentPeriodEnd` is in the past, or whose `last_synced_at` is older than 24 h → `syncSubscription`.
    - **(c) Unknown subscriptions.** `listSubscriptions({ status: 'all', created: { gte: cursor } })`. Any Stripe subscription with our metadata but no local row → `syncSubscription`.
    - **(d) Pause state.** Every live subscription's `pause_collection` must match what phase 7 expects from the tenant and account status (task 7.4).

    Each run logs one line, `stripe.reconcile { tenantId, missedEvents, overdueFixed, unknownFound, pauseFixed }`. Any non-zero number is **drift**, which means a bug or an outage. A run with drift raises the alert `RECONCILE_DRIFT`, and the counts are kept for the admin dashboard's metrics.
  - *Why:* webhooks are a best-effort notification, not a guarantee. Stripe stops retrying after 3 days (a few hours in test mode), a rotated secret fails every delivery, and an endpoint can be disabled. Reconciliation makes our database **converge to Stripe's state** however events were lost, and the drift count tells us when the primary path is broken.
  - *Solves:* F13, F14, F16, F19, and any bug in the webhook path.
- [ ] **6.3 Renewal leeway in `entitlement.service.ts`.**
  - *What:* for `provider = 'STRIPE'`, treat a live row as active for **6 hours past `currentPeriodEnd`** (one named constant, unit-tested).
  - *Why:* today a row whose period end has passed counts as expired immediately. A renewal is charged at period end and its webhook takes seconds to hours, so without leeway a paying patient can be locked out at midnight on renewal day. Reconciliation's step (b) fixes the row within the hour, and the leeway hides that hour.
  - *Solves:* F16.
- [ ] **6.4 `POST /v1/subscriptions/me/sync` (the "Ya pagué" button).**
  - *What:* `SELF_SUBSCRIPTION_READ`, not entitlement-gated, limited to one call per 10 s per patient. It looks up the patient's Stripe customer, calls `listSubscriptions({ customer })`, runs `syncSubscription` on each, and returns the fresh entitlement. It replaces "Restaurar compras" for Stripe.
  - *Why:* a reconciliation the patient can start, for exactly their own account, at the moment they care.
  - *Solves:* F9, F13.

**Done when:**
- setting a **wrong** webhook secret in preproduction and paying still grants access within the reconciliation interval, and the run logs `missedEvents: 1`;
- a row with `currentPeriodEnd` moved into the past by hand is corrected within the hour;
- the sweeper re-enqueues an event left `ENQUEUED` by a killed worker.

### Phase 7 · Pause and resume collection (~1 day)

When the nutritionist can't provide the service or can't take payments, Stripe must stop charging their patients. Pausing uses Stripe's **`pause_collection: { behavior: 'void' }`**. The subscription stays `active`, but each renewal invoice is voided instead of charged. So nothing is owed for the paused time, and resuming doesn't charge for it later.

- [ ] **7.1 When to pause and resume, and what patients get.**

  | Trigger | Collection | Patient access | Alert |
  |---|---|---|---|
  | Tenant → `SUSPENDED` (its platform subscription ended) | **Pause** every live subscription, reason `TENANT_SUSPENDED` | None: the tenant gate already blocks patients | `TENANT_SUSPENDED_COLLECTION_PAUSED` (warning) |
  | Tenant `SUSPENDED` → `ACTIVE` (reactivated) | **Resume** | Back | resolves the alert |
  | Tenant → `DELETION_PENDING` | **Cancel** every subscription (the deletion path) | None | `TENANT_SUBSCRIPTIONS_CANCELED` (info) |
  | Account `charges_enabled` → false, from `account.updated` (Stripe needs documents, a review, …) | **Pause**, reason `ACCOUNT_RESTRICTED` | **Kept**: it's not the patient's fault. Stripe advances the periods with voided invoices, so entitlement stays active. | `STRIPE_ACCOUNT_RESTRICTED` (critical), escalating after 3 and 7 days |
  | Account `charges_enabled` → true | **Resume** | Unchanged | resolves the alert |
  | `account.application.deauthorized` | **Can't**: we no longer have API access to the account | Kept until `currentPeriodEnd` + leeway, then lost (we can't see renewals any more) | `STRIPE_ACCOUNT_DEAUTHORIZED` (critical) |
  | Tenant `CANCELING` | Nothing (the tenant keeps full access until its period ends) | Unchanged | none |

  - *Why:* without this, a suspended nutritionist's patients keep paying for an app that refuses them, and a restricted account makes every renewal fail, which pushes paying patients to `PAST_DUE` for a problem that isn't theirs. With **Standard accounts**, Stripe can restrict an account for verification reasons we don't control, so this will happen.
  - **Decide:** how long patients keep free access under `ACCOUNT_RESTRICTED` before the team acts (suspend the tenant, or cancel the subscriptions). Proposed: the alert escalates at day 7, and the decision is the team's.
  - *Solves:* F19, F20.
- [ ] **7.2 Pause and resume jobs.**
  - *What:* `tenant-lifecycle.service.ts` transitions and `syncAccount` publish one job per affected subscription: `SetCollectionState { subscriptionId, state: 'paused' | 'active', reason }`. The handler calls `updateSubscription` with `pause_collection` set or cleared. Its idempotency key is `collection/{subscriptionId}/{state}/{triggerId}`, where `triggerId` is the lifecycle event id or the Stripe event id. Then it runs `syncSubscription`, which stores `collection_paused_at` and `collection_paused_reason`.
  - *Why:* one job per subscription means one failing subscription doesn't block the others, and each one is retried and swept on its own. The trigger id in the key makes a retry of the same transition a no-op, while a later, different transition still goes through.
- [ ] **7.3 Alerts with tenant, patient and account details.**
  - *What:* each alert above is a `platform_alerts` row (task 8.2). Its `details` hold:
    - **tenant:** name, slug, lifecycle status, platform subscription status;
    - **Stripe account:** id, `charges_enabled`, `payouts_enabled`, `requirements.disabled_reason`, the number of `requirements.currently_due` items, the `current_deadline`;
    - **affected patients:** count, plus for each one the patient reference, masked email, subscription id, status and pause state, as listed in task 8.2.
  - *Why:* the person acting on it needs to know, without opening Stripe, which practice it is, why Stripe restricted it, by when the nutritionist must act, and how many patients are affected.
- [ ] **7.4 Reconciliation check** (6.2 d): any live subscription whose pause state doesn't match the tenant and account status is corrected through the same job and counted as drift.
  - *Solves:* a lost pause or resume job, or a nutritionist who resumed a subscription by hand in their Dashboard.

**Done when:** suspending `carlos-nutrition` in preproduction pauses every test subscription (the Stripe Dashboard shows "collection paused"), and the next renewal (advanced with a test clock) creates a **voided** invoice; reactivating resumes them; restricting the test account (Stripe's test data for a restricted account) pauses them while the patients keep access, and raises the critical alert.

### Phase 8 · Payment records and platform alerts (~1 day)

The admin dashboard that shows this data is in the [Platform admin dashboard](admin-dashboard.md) roadmap. This phase only **records** it.

- [ ] **8.1 Payment records** (the existing `payments` and `payment_transactions` tables, extended in migration 0018).
  - *What:* `syncInvoice(tenantId, accountId, invoiceId)` refetches the invoice from Stripe and upserts:
    - one **`payments`** row per invoice: `kind = 'PATIENT'`, `patient_id`, `patient_subscription_id`, `stripe_account_id`, `stripe_invoice_id` (unique), `amount_minor`, `currency`, `status` (`PAID | FAILED | REFUNDED | PARTIALLY_REFUNDED | DISPUTED`), `refunded_amount_minor`, `paid_at`;
    - one **`payment_transactions`** row per Stripe object: types `CHARGE`, `FAILED_ATTEMPT` (with Stripe's `failure_code`, e.g. `insufficient_funds`, never card details), `REFUND`, `DISPUTE_OPENED`, `DISPUTE_WON`, `DISPUTE_LOST`. `stripe_object_id` is unique, so a replayed event changes nothing.

    No names, emails or health data are stored in these tables. The patient is only their id.
  - *Why:* support questions ("¿por qué me bloquearon?", "me cobraron dos veces") need a timeline of what Stripe did, across every tenant, without logging into each nutritionist's Stripe Dashboard. The upsert keys make this safe under the same at-least-once delivery as everything else.
  - *Solves:* F23.
- [ ] **8.2 `platform_alerts`.**
  - *What:*
    - A platform table: `id, type, severity (INFO | WARNING | CRITICAL), dedupe_key unique, tenant_id, patient_id (nullable), details jsonb, status (OPEN | ACKNOWLEDGED | RESOLVED), occurrences, first_seen_at, last_seen_at, resolved_at, resolved_by, note`.
    - `raiseAlert(type, dedupeKey, details)` upserts on `dedupe_key` and increments `occurrences`. For example, `account-restricted/{accountId}` stays **one** alert, however many events repeat it. `resolveAlert(dedupeKey)` closes it when the condition clears.
    - Every alert also writes a structured log line (`platform.alert`), so Cloud Monitoring can email the team before the dashboard exists.
    - **Patient details in alerts:** the patient id, a short support reference, the **masked** email (`c•••@gmail.com`), and the Stripe customer and subscription ids. Never the full email, name or health data. Revealing more is an audited dashboard action, in the admin roadmap.
    - Alert types from this roadmap: `TENANT_SUSPENDED_COLLECTION_PAUSED`, `TENANT_SUBSCRIPTIONS_CANCELED`, `STRIPE_ACCOUNT_RESTRICTED`, `STRIPE_ACCOUNT_DEAUTHORIZED`, `ORPHANED_PAYMENT_REFUNDED`, `DUPLICATE_SUBSCRIPTION_REFUNDED`, `TENANT_LINK_CAP_REACHED`, `STRIPE_WEBHOOK_SIGNATURE_FAILURES`, `STRIPE_EVENTS_STUCK`, `RECONCILE_DRIFT`, `PRICE_CHANGE_APPLY_FAILED`, `REFUND_FAILED`.
  - *Why:* the deduplicated upsert follows the same rule as the rest of this roadmap: a retried job can't create a second alert. Keeping alerts in the database, not only in logs, gives the dashboard something to list, acknowledge and resolve.
- [ ] **8.3 Process log for refunds of deleted accounts.**
  - *What:* when 5.3's deleted-patient guard runs, the alert `ORPHANED_PAYMENT_REFUNDED` records every step with a timestamp in `details.steps`: detected (which path: webhook, success page, reconciliation), subscription cancelled (id), refund created (refund id, amount, currency), refund succeeded or failed. A failed refund raises `REFUND_FAILED` (critical). The metrics `payments.orphan_refunds` and `payments.orphan_refund_amount_minor` are counted per tenant.
  - *Why:* a refund is money leaving the nutritionist's account, so the team must be able to show exactly what happened and why.
  - *Solves:* F21.

**Done when:** a paid, refunded and disputed test invoice each produce the right `payments` and `payment_transactions` rows; replaying their events changes nothing; and the deleted-account drill (13.3) produces one `ORPHANED_PAYMENT_REFUNDED` alert with all its steps.

### Phase 9 · Price changes (~1 day; can land after launch, but before the first real price change)

- [ ] **9.1 Announce a change: `stripe price-change <slug> --amount 599 --effective 2026-12-01`.**
  - *What:*
    - It creates the new Price on the connected account and a `tenant_price_changes` row (`from_plan_id`, `to_plan_id`, `announced_at`, `effective_at`, status `ANNOUNCED`).
    - It refuses an `effective_at` sooner than the **notice period in the terms** (proposed 30 days, task 12.1).
    - From `effective_at`, **new** links use the new price. That happens because the new plan becomes the active `tenant_billing_plans` row on that date (the daily job in 9.3).
    - One pending change per tenant at a time.
  - *Why:* existing patients must be told before they're charged more, and the date is fixed in advance so emails, the in-app notice and the actual change all agree.
- [ ] **9.2 Notify every affected patient, by email and in the app.**
  - *What:* a job creates one `patient_price_change_notices` row per live subscription (unique `(price_change_id, patient_id)`) and sends a **`price_change` email through Resend**: old and new amount, the date, "se aplica a partir de tu renovación del …", and how to cancel. The Resend key is `price-change/{changeId}/{patientId}`.

    Patients who subscribe **between the announcement and the effective date** get the same notice. The sweeper finds live subscriptions with no notice row for a pending change. Optionally, send a reminder email 7 days before.
  - *Why:* the per-patient row with a unique key makes the notice exactly-once, even with retries and new subscribers. It is also proof that each patient was told, and when.
- [ ] **9.3 Apply it at each patient's first renewal on or after the effective date.**
  - *What:* a daily job (Cloud Scheduler, `POST /maintenance/price-changes`) does three things:
    1. Activates the new plan on `effective_at`.
    2. For each notice not yet applied whose subscription renews within the next 48 h, and on or after `effective_at`, calls `updateSubscription` to swap the item's price, with `proration_behavior: 'none'` and the idempotency key `price-change/{changeId}/{subscriptionId}`. It sets `applied_at`. The patient's next renewal charges the new amount, and no one is charged mid-period.
    3. Once every notice is applied, marks the change `COMPLETED`.

    A failure raises `PRICE_CHANGE_APPLY_FAILED`. Reconciliation checks that applied subscriptions really carry the new price.
  - *Why:* changing the price just before each renewal, instead of all at once, means every patient pays their current period at the price they agreed to. The 48 h window gives retries time to work before the renewal.
  - *Solves:* F18.
- [ ] **9.4 Expose the pending change to the app.** `GET /v1/subscriptions/me` gains `pendingPriceChange: { id, effectiveAt } | null`. There is no amount (see the App Store section). `POST /v1/subscriptions/me/price-change/:id/dismiss` sets `dismissed_at`.

**Done when:** announcing a change for Carlos emails every test subscriber once (re-running the job sends nothing new); a patient who subscribes afterwards also gets it; with a test clock past the effective date, each subscription's next invoice has the new amount and none were prorated.

### Phase 10 · Patient app (~1 day)

Follows `docs/ui/UI-BRIEF.md`. The subscription screen has no mockup ("to design: use the same tokens and components").

- [ ] **10.1 The "Enviar enlace de pago a mi correo" button** on `SubscriptionScreen`, shown only when the tenant flag **`payment_link_email`** is on (a new `FeatureKey`, enabled for `carlos-nutrition` in the preproduction seed).
  - *What:* the app generates one `Idempotency-Key` per tap intent and **keeps it until a response arrives**, so automatic retries reuse it. The button is disabled while in flight, then shows "Te enviamos el enlace a c•••@gmail.com" and a 60 s "Reenviar" countdown.

    Errors: `409 ALREADY_SUBSCRIBED` → `session.refresh()`; `409 PAYMENTS_NOT_AVAILABLE` → "Tu nutriólogo aún no activa los pagos"; `429` → "Ya enviamos varios enlaces, revisa tu correo o intenta más tarde". Replace the disabled "Suscribirme (aún no disponible)".
  - *Why:* this is the client half of task 3.1's idempotency, plus UI that discourages repeat taps.
- [ ] **10.2 "Ya pagué"** → `POST /v1/subscriptions/me/sync`, then `session.refresh()`. Also refresh automatically when the app returns to the **foreground** while on the paywall (React Native `AppState`), since the patient was just in the browser paying.
  - *Solves:* F9.
- [ ] **10.3 Spanish copy** in `es-MX.ts`: button, sent/resend, errors, the "Ya pagué" result ("Aún no vemos tu pago, intenta en un minuto").
- [ ] **10.4 Price-change notice on Inicio.**
  - *What:* when `pendingPriceChange` is set and not dismissed, Inicio shows a dismissible card: "El precio de tu suscripción cambiará a partir del 1 de diciembre. Te enviamos los detalles a tu correo." There is no amount and no link (App Store section). Dismissing calls the dismiss endpoint. The card disappears by itself once the change is applied to that patient.
  - *Why:* not everyone reads email, and the patient sees the date where they already look every day.

**Done when:** on a preproduction build for Carlos, the full scenario in [Goal](#goal) works on a real phone, and an announced price change shows its card on Inicio.

### Phase 11 · Cancellation and account deletion (~0.5 day)

- [ ] **11.1 Cancel on account deletion** (the MVP week 7 item).
  - *What:* `DELETE /patients/me` cancels the patient's open `payment_requests` and expires their open Checkout Session. It also publishes `CancelStripeSubscription { subscriptionId }` for each live Stripe row. The handler calls `cancelSubscription` with the key `cancel/{subscriptionId}`; cancelling an already-cancelled subscription is a no-op. The webhook then records `CANCELED`. The financial rows stay (`RESTRICT`, legal retention).

    If a payment still completes after this (the patient was already on Checkout), task 5.3's guard refunds it.
  - *Why:* a deleted patient must never be charged again. Done as a job, a Stripe outage can't block or fail the deletion.
  - *Solves:* F21.
- [ ] **11.2 Cancellation by email.**
  - *What:* a "Gestionar mi suscripción" email (cancel, update card), using the 3.3 machinery, links to a Stripe **customer portal** session created on click, as in 4.1. The profile screen says "Te enviamos un correo para gestionar tu suscripción", without a link in store builds.
  - *Why:* the terms (12.1) must offer an easy way to cancel. This was optional before; now it's required before launch.

**Done when:** deleting a test patient with a live subscription shows it cancelled in the Stripe Dashboard within a minute, and a patient can cancel through the emailed portal link.

### Phase 12 · Terms and privacy notice (content work with the lawyer, ~0.5 day of engineering)

- [ ] **12.1 Update the terms of service** (patient-facing, Spanish, for Mexico). Add a subscription section covering:
  - who sells: the nutritionist, as the merchant (their name, as on Stripe);
  - the price, in MXN, and that it **renews automatically every month** until cancelled;
  - cards only;
  - **how to cancel** (the emailed portal link, or by writing to the nutritionist), and that access lasts until the end of the paid period;
  - the refund policy, including automatic refunds for duplicate charges and for payments made after an account was deleted;
  - **price changes:** at least 30 days' notice, by email and in the app, applied from the next renewal on or after the date;
  - failed payments: Stripe retries, and access ends if every retry fails;
  - what happens if the nutritionist leaves the platform or can't take payments: charges stop (collection paused) or the subscription is cancelled;
  - payments are processed by Stripe, and we never see card numbers.

  Bump the document version. The new version is accepted in Checkout (4.1) and recorded as a `PatientConsent`. Host it at a stable URL for the Stripe account setting (0.6). **Ask the lawyer** to check it against PROFECO's consumer-protection rules for subscriptions.
- [ ] **12.2 Update the privacy notice** (aviso de privacidad, under Mexico's LFPDPPP, in the version currently in force). Add:
  - the new processing purpose: billing and payment management;
  - the processors (encargados) and what each receives: **Stripe** (name, email, payment details; it processes cards directly) and **Resend** (email address, to send payment emails);
  - that both process data **outside Mexico (United States)**;
  - the ARCO rights contact.

  Bump the version and record acceptance (`PRIVACY_NOTICE`). **Ask the lawyer** whether existing patients must accept the new version or only be informed. The app's sign-up already records the version.

**Done when:** both documents are approved, published, and their new versions are what Checkout and sign-up record.

### Phase 13 · Tests, failure drills and monitoring (~1 day, alongside each phase)

- [ ] **13.1 Unit tests:**
  - the status mapping and the pause rules (7.1);
  - link signing and verification (tampered, expired, wrong `link_version`);
  - the idempotency-key builders (stable for the same row);
  - the renewal leeway;
  - the config refusing live or full keys;
  - the alert dedupe;
  - the price-change "which renewal" rule.
- [ ] **13.2 Integration tests** (`apps/api/test/integration`, `FakeStripeGateway`, real Postgres):
  - 10 concurrent `POST /payment-link` calls, half with the same key → one request, one job;
  - the tenant hourly cap → `429` and one alert, however many refusals;
  - 2 concurrent `GET /pay/...` → one session created;
  - the same webhook event 5× in parallel → one `PROCESSED`, one upsert;
  - out of order: `subscription.deleted` before `checkout.session.completed` → final `CANCELED`;
  - the success page and the webhook racing → one row, the final state is correct;
  - a second live subscription → the duplicate is cancelled and refunded, and the first is kept;
  - a payment completed for a deleted patient → cancelled, refunded, and one alert with every step;
  - a tenant suspended → one pause job per subscription, and a replayed transition pauses nothing twice;
  - publish failure → the sweeper sends it;
  - an unknown connected account → `IGNORED`;
  - RLS: tenant A's patient can't read B's `payment_requests` or `payments`.
- [ ] **13.3 End-to-end in Stripe test mode:**
  - locally with `stripe listen --forward-connect-to localhost:4000/v1/webhooks/stripe`, and `stripe events resend` for duplicates;
  - **test clocks** for renewals, a paused renewal (a voided invoice) and a price change;
  - the card `4000 0000 0000 0341` (attaches, then fails to charge) to drive `invoice.payment_failed` → `GRACE_PERIOD` → `PAST_DUE`;
  - the disputed-charge test card for a dispute;
  - the drills from the *Done when* of phases 6, 7 and 8 on preproduction, including: delete a test patient while their Checkout page is open, then pay.
- [ ] **13.4 Monitoring** (log-based metrics + email alerts, next to GCP phase 8's alerts; the admin dashboard comes later):
  - any `platform.alert` with severity `CRITICAL`;
  - any `stripe.webhook.signature_failed`;
  - `stripe_webhook_events` not `PROCESSED`/`IGNORED` after 15 min;
  - `stripe.reconcile` drift > 0;
  - `jobs-dlq` messages (already planned).

  Also turn on Stripe's own email for failing webhook endpoints.

**Done when:** every row of the [failure table](#what-can-go-wrong-and-which-task-covers-it) has a passing test or a drill that was run on preproduction.

## Runbook

| Situation | What to do |
|---|---|
| A patient paid but has no access | `stripe sync-patient <slug> <patientId>`. If that fixes it, look for drift in the `stripe.reconcile` logs to find out why the webhook path missed it. |
| Events stuck or `FAILED` | `SELECT id, type, attempts, last_error FROM stripe_webhook_events WHERE status NOT IN ('PROCESSED','IGNORED')`. Fix the cause, set them back to `RECEIVED`, and the sweeper re-enqueues them within 5 minutes. |
| Messages in `jobs-dlq` | Each message holds an event or subscription id. Fix the cause, then reset that event to `RECEIVED`, or re-run the job. |
| A duplicate or orphan refund alert | Check the alert's steps and the nutritionist's Stripe Dashboard: the subscription should be cancelled and the refund succeeded. Contact the patient through the nutritionist. |
| A restricted Stripe account | The alert lists Stripe's `disabled_reason` and what's due. Ask the nutritionist to finish it in their Stripe Dashboard before `current_deadline`. Collection resumes on its own once `charges_enabled` is back. |
| **Rotate the webhook secret** (yearly, when someone with access leaves, or after a suspected leak) | 1. Stripe Dashboard → the endpoint → **Roll secret**, keeping the old one valid for 24 h; during that window Stripe signs every event with both. 2. Add the new value to `stripe-webhook-secret` as `new,old`, then deploy. 3. After the window, set it to `new` alone and deploy. If a step is missed, deliveries fail the signature check, the alert fires, and reconciliation recovers the events. |
| **Rotate a restricted key** (same triggers) | 1. Stripe Dashboard → API keys → the key → **Roll key**, keeping the old one valid for a short time (e.g. 1 h). 2. Add the new value as a new version of `stripe-secret-key` (or `stripe-admin-key`) and deploy `api` and `worker`. 3. Check the logs for Stripe authentication errors, then let the old key expire. After a suspected leak, expire the old key **now** and accept a few minutes of failed calls (requests are retried, and reconciliation catches up). |

## Going live

Nothing from the pilot's test-mode setup is carried over. Test-mode accounts, prices, customers and subscriptions don't exist in live mode, and the `preproduction` project is destroyed after the MVP. For the `production` project:

- [ ] A new live webhook endpoint, new live restricted keys, a new webhook secret, and a new `payment-link-secret`.
- [ ] Each nutritionist completes **real** Stripe onboarding: ID, RFC, bank account (CLABE), and checklist 0.6. **Start this with the pilot nutritionist in week 5 or 6**: Stripe's verification can take days, and it can't be rushed in week 9.
- [ ] `stripe connect` and `stripe price` run again against live mode.
- [ ] The terms and privacy notice (phase 12) are published before the first live payment.

## Estimate

About **13 working days**:

| Phases | Days |
|---|---|
| 0 + 1 | 1 |
| 2 | 1 |
| 3 | 1.5 |
| 4 | 1 |
| 5 | 1.5 |
| 6 | 1 |
| 7 | 1 |
| 8 | 1 |
| 9 | 1 |
| 10 | 1 |
| 11 | 0.5 |
| 12 | 0.5 |
| 13 | 1, spread out |

Week 7 holds 5 days. Proposed split:

- **Week 6, next to the trackers:** phases 0–3.
- **Week 7:** phases 4–6 and 10. The [Goal](#goal) scenario works by the end of week 7.
- **Week 8, hardening:** phases 7, 8, 11, 12 and 13.
- **After launch, before the first real price change:** phase 9.

Pausing (7), cancelling (11) and the legal text (12) must ship **before the first live payment**.

## Later

- **OXXO, optional for patients.** OXXO vouchers are one-off payments and can't renew automatically, so the patient would choose on the pay page: "Tarjeta (se renueva cada mes)" or "Efectivo en OXXO (pagas cada mes)". The OXXO option needs:
  - Checkout in `mode: 'payment'` for one month of access;
  - the asynchronous events (`checkout.session.async_payment_succeeded` / `_failed`), because the patient pays at the store hours or days later;
  - a voucher expiry;
  - a `patient_subscriptions` row with no renewal (`currentPeriodEnd` = paid date + 1 month);
  - a reminder email before it ends.

  The inbox, the single writer and reconciliation all apply unchanged.
- **Our own failed-payment flow**, replacing Stripe's emails: branded Spanish emails, an in-app notice (no link), and an "update your card" email with a portal session.
- **Free trials** (`subscription_data.trial_period_days`). The `TRIALING` status is already mapped.

## Out of scope here

- **Tenant → Project Limon billing**: a separate Stripe account, its own keys and webhook endpoint, and `PlatformSubscription`. Invoiced manually during the pilot.
- The **admin dashboard UI**: see [Platform admin dashboard](admin-dashboard.md).
- Apple In-App Purchase / Google Play Billing (ADR-008, the other providers).
- CFDI receipts (decided: none), plan upgrades and downgrades, more than one currency, and push notifications when access is granted.
