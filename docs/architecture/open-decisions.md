# Open Decisions

## Resolved (2026-09-17)

| # | Decision | Answer | Where it lives |
|---|---|---|---|
| 1 | Store developer account ownership | Platform provisions a mailbox on its own domain per tenant and enrols a developer account for that tenant | [ADR-009](adr/ADR-009-store-account-provisioning.md), `TenantStoreAccount` |
| 2 | Identity scope | **Tenant-scoped only.** Same email may be a patient of several nutritionists; separate accounts | [ADR-006](adr/ADR-006-tenant-scoped-identity.md), `tenantUsername()` |
| 3 | Market | **Mexico only** for now | see "Mexico compliance" below |
| 4 | Patient onboarding | **Self-signup in the tenant's app, then pay for access** | `POST /auth/register/patient`, entitlement gating |

## Mexico compliance — ⚠ these DO apply

"No regulations apply" isn't accurate for Mexico, and the gaps are cheap to close now but expensive later:

| Rule | What it requires | Status |
|---|---|---|
| **LFPDPPP** (rewritten March 2025) | Health data is *sensitive personal data*: a privacy notice (aviso de privacidad) and **express consent**, plus ARCO rights (access, rectification, cancellation, opposition) | Consent capture implemented (`patient_consents`, unticked boxes at signup). ARCO request handling **not** built |
| **NOM-004-SSA3-2012** (clinical records) | Clinical records retained a minimum of ~5 years | Drives retention in [tenant-lifecycle.md](tenant-lifecycle.md); deletion job must not delete clinical data earlier |
| **NOM-024-SSA3-2012** | Standards for electronic health record systems | Assess whether nutrition records fall in scope |
| **SAT / CFDI** | Mexican tax invoices for both billing relationships | Not built; affects the payments module |

Still to confirm: who is the *responsable* (data controller) for patient data — the nutritionist, with the platform as *encargado* (processor), is the assumption baked into the tenant model. This should be written into the nutritionist contract and the privacy notice.

## Still open

| # | Decision | Default in code | Why it matters |
|---|---|---|---|
| 5 | **Patient payment provider** | Provider-agnostic model; nothing charges yet | Apple 3.1.1 / Google Play Billing generally require store billing for in-app digital access (~15–30% fee). Stripe Connect is only safe for out-of-app sales. See [ADR-008](adr/ADR-008-patient-payments.md) |
| 6 | AWS region | `us-east-1` | `mx-central-1` exists (Mexico) and may be preferable for latency and data-residency optics; verify Bedrock/Cognito feature availability there first |
| 7 | Retention periods | 30 days suspended → deletion | Must be reconciled with the ~5-year clinical-record retention above |
| 8 | Multiple nutritionists per tenant (clinics) | Schema allows it; no assignment rules | Would need per-patient access rules |
| 9 | Global reference food database | Tenant-private only | Would be the one non-tenant-scoped domain table |
| 10 | Custom web domains per tenant | Not supported | Affects CloudFront/ACM design |
| 11 | Spanish localization | UI strings are English placeholders | Mexico-only product; i18n (es-MX) needed before launch, including consent documents |
