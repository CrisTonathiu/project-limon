# Platform admin dashboard

**Planned:** 2026-10-17 · **Window:** not scheduled yet, after the MVP's payments work ([Patient payments with Stripe](stripe-payments.md)) · **Users:** Project Limon admins only (`PLATFORM_ADMIN`)

## Goal

One place where the Project Limon team sees what needs attention across **every tenant**: payment alerts, the state of each nutritionist's Stripe account, payment records for customer support, and the health of the payment pipeline. It shows **just enough to help a patient or a nutritionist, never their health data**, and every look at personal data is audited.

This roadmap covers everything shown in the admin dashboard. The data it reads (alerts, payment records, metrics) is produced by the [payments roadmap](stripe-payments.md#phase-8--payment-records-and-platform-alerts-1-day), or by the [in-app purchases roadmap](in-app-purchases.md) if that one is chosen. With in-app purchases, the account views show the tenant's App Store and Google Play setup (agreements, products, notification health) instead of a Stripe account, and the Stripe ids become Apple transaction ids and Google purchase tokens. Until this dashboard exists, the team uses the email alerts from Cloud Monitoring and the `stripe` admin command (`stripe alerts`, `stripe status`, `stripe sync-patient`).

It is **not** the nutritionist dashboard (`apps/dashboard`, Jan–Feb 2027), which shows one tenant's own data to its nutritionist.

## Principles

| Principle | What it means |
|---|---|
| **Data minimization** | Patients appear as an id, a short support reference and a masked email (`c•••@gmail.com`). There are no names, no full emails and **never health data** (profile, plans, weights, conversations). Payment records hold amounts, dates, statuses and Stripe ids only. |
| **Every reveal is audited** | Seeing a patient's full email, the only extra detail, is an explicit action with a reason, written to `audit_logs` (who, when, which patient, why). |
| **Read-only by default** | Actions (re-sync, replay, resend) come in a later phase, each one audited and each one the same code the `stripe` admin command runs. |
| **The platform is a processor** | Project Limon processes patient data for the nutritionist (the controller). Support access must be covered in the nutritionist contract and the privacy notice ([open decision](../architecture/open-decisions.md)). |

## Decisions to make before building

| # | Decision | Options | Proposal |
|---|---|---|---|
| A1 | Where it lives | A section of `apps/dashboard`, or a separate app `apps/admin` | **Separate app** (Next.js, same packages). Different users, a different sign-in, and it can be deployed and locked down separately. |
| A2 | How admins sign in | Identity Platform users at the project level (outside any identity tenant, like nutritionists), with role `PLATFORM_ADMIN` | Yes, with **multi-factor authentication required** (Identity Platform supports TOTP/SMS), plus a short session. |
| A3 | Network access | Public with sign-in only, or behind Identity-Aware Proxy / an IP allow-list | Behind **IAP** if it's available for the Cloud Run setup at the time; otherwise sign-in + MFA. |
| A4 | How it reads across tenants | The API's runtime role is bound to one tenant by RLS on purpose | A **separate read-only database role** (`limon_admin_reader`, `BYPASSRLS`) on a **separate connection**, allowed to read **only** a set of support views. This is the "cross-tenant platform operations" path deferred in `multi-tenancy.md`. |

## To-do

### Phase 1 · Foundations

- [ ] **1.1 Admin API** under `/v1/admin/*`. New `PLATFORM_ADMIN` permissions (`platform:alerts:read`, `platform:alerts:manage`, `platform:payments:read`, `platform:patients:reveal`). Each route writes an audit entry.
  - *Why:* `PLATFORM_ADMIN` today has only `PLATFORM_TENANTS_MANAGE` and, by design, no tenant-data permissions. These new permissions are narrow, so the role still can't reach health data.
- [ ] **1.2 `limon_admin_reader` role and support views** (migration). Views: `admin_alerts`, `admin_tenant_billing` (tenant name, slug, statuses, Stripe account status and requirements), `admin_payments`, `admin_payment_transactions`, `admin_patient_billing` (patient id, support ref, masked email, subscription status). The role gets `SELECT` on the views only, not on the tables.
  - *Why:* the views are the allow-list of columns. A health-data column can't leak through the dashboard, because no view selects one.
- [ ] **1.3 Patient support reference.** A short, non-guessable code per patient (`LMN-7F3K`), shown in the app's Perfil, so a patient can give it to support instead of their email.
- [ ] **1.4 `apps/admin` skeleton**: sign-in with MFA (A2), layout, and access limited per A3.

**Done when:** an admin with MFA signs in, and a test proves `limon_admin_reader` can't select from `patient_profiles`, `meal_plans` or `body_logs`.

### Phase 2 · Alerts inbox

- [ ] **2.1 Alert list**: open alerts first, by severity, then by `last_seen_at`. Filters: type, tenant, status, severity. Each row shows the occurrence count (the payments roadmap deduplicates alerts, so one condition is one row).
- [ ] **2.2 Alert detail**, by type:
  - **Tenant:** name, slug, lifecycle status, platform subscription status.
  - **Stripe account:** id, status (`ENABLED | RESTRICTED | DEAUTHORIZED`), `charges_enabled`, `payouts_enabled`, `disabled_reason`, requirements due and their deadline, and a link to the account in the Stripe Dashboard.
  - **Affected patients:** count, plus a list with the support reference, masked email, subscription status and pause state.
  - **Process steps** for `ORPHANED_PAYMENT_REFUNDED`, `DUPLICATE_SUBSCRIPTION_REFUNDED` and `REFUND_FAILED`: detected (by which path), subscription cancelled, refund created (id, amount), refund result, each with its time.
- [ ] **2.3 Acknowledge and resolve** with a note (`resolved_by`, `note`). Alerts whose condition clears on its own (an account re-enabled) resolve themselves.
- [ ] **2.4 Reveal email** on a patient in an alert: asks for a reason, writes the audit entry, and shows the email for the session only.

Alert types come from the payments roadmap: tenant suspended (collection paused), subscriptions cancelled, Stripe account restricted, account deauthorized, orphaned payment refunded, duplicate subscription refunded, refund failed, tenant link cap reached, webhook signature failures, events stuck, reconciliation drift, price change failed to apply.

**Done when:** each alert type raised in preproduction appears once, with its details, and can be resolved.

### Phase 3 · Payment records (support view)

- [ ] **3.1 Search** by tenant, patient support reference, or Stripe id (customer, subscription, invoice, charge).
- [ ] **3.2 Patient billing timeline**: subscription statuses over time, each invoice (amount, status, paid date) and its transactions (charge, failed attempt with Stripe's `failure_code`, refund, dispute), payment link sends, price-change notices (sent, dismissed, applied). It answers "¿por qué me bloquearon?" and "me cobraron dos veces" without opening Stripe.
- [ ] **3.3 Tenant billing summary**: live, paused and past-due subscription counts; revenue by month (amounts only); refunds and disputes; the active price and any pending price change.

**Done when:** for a test patient, the timeline matches what the nutritionist's Stripe Dashboard shows, and no field outside the views is reachable.

### Phase 4 · Pipeline metrics

- [ ] **4.1 Webhooks:** events by status and type, time from Stripe's `created` to `PROCESSED` (median, p95), signature failures, and events stuck.
- [ ] **4.2 Reconciliation:** drift per run and per tenant (missed events, overdue rows fixed, unknown subscriptions, pause state fixed), over time.
- [ ] **4.3 Payment links:** sends per tenant per hour against each tenant's `max_links_per_hour`, refusals by cap, and the share of requests that end in a payment.
- [ ] **4.4 Refunds and pauses:** orphan refunds (count and amount per tenant), duplicate refunds, pause and resume counts by reason, and how long accounts stay restricted.
- [ ] **4.5 Set the tenant link cap** (`max_links_per_hour`) from the dashboard, audited.

### Phase 5 · Actions (later)

Each one is the same code as the `stripe` admin command, and each one is audited: re-sync a patient, replay a failed event, run reconciliation for one tenant, resend a payment link, and retry a failed price-change application.

### Phase 6 · Nutritionist accounts created by the team (later)

*Decided 2026-10-21:* **nutritionists don't register themselves.** A Project Limon admin creates the practice and the nutritionist's login and gives them credentials. On their first sign-in, the dashboard's only screen is "choose your password". That happens once.

- [ ] **6.1 Create the practice and login.** One audited action (an `admin` command first, a form here later) creates the identity tenant, Tenant, TenantBranding, User, Nutritionist and TenantApps, as `POST /auth/register/nutritionist` does today. It also creates a project-level Identity Platform login with a temporary password (Admin SDK `createUser`) and marks the user `passwordChangeRequired`.
- [ ] **6.2 Forced password change.** The flag lives on `users` in the database, the source of truth for authorization, not in a token claim. While it's set, the API refuses every nutritionist route except `GET /auth/me` and the password change, with a new error code (`PASSWORD_CHANGE_REQUIRED`). The dashboard sends the nutritionist to a "choose your password" screen and nowhere else. After the change, the flag is cleared (audited), the session ends and the nutritionist signs in with the new password.
- [ ] **6.3 Remove self-registration.** Delete the dashboard's `/register` page and `POST /auth/register/nutritionist`, or keep it for `AUTH_PROVIDER=dev` only.

Decisions to make before building:

| # | Decision | Options |
|---|---|---|
| A5 | How the credentials reach the nutritionist | Temporary password handed over by the team (outside email), or an emailed "set your password" link (Admin SDK `generatePasswordResetLink`), which avoids anyone at Project Limon knowing a password |
| A6 | Temporary password lifetime | Expires after N days (then the admin issues a new one), or no expiry |
| A7 | Where the change happens | In the browser (Firebase `updatePassword`, then the API clears the flag once it can confirm the change, e.g. from the login's `tokensValidAfterTime`), or through the API (Admin SDK `updateUser`, the password passes through our server) |
| A8 | Email confirmation | Mark the email verified at creation (the team checked it), or require the confirmation link on first sign-in as today |

**Done when:** a nutritionist created by an admin signs in with the given credentials, can do nothing but choose a password, and after that signs in normally; there's no public way to create a practice.

## Out of scope

- Any view of patients' health data.
- Editing tenant or patient data (the nutritionist dashboard and the admin command cover that).
- Tenant → platform billing views (comes with the separate Project Limon billing account).
