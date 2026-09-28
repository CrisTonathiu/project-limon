# MVP Roadmap

**Window:** Mon 2026-09-28 → Fri 2026-11-27 (9 weeks: 8 build + 1 launch buffer) · **Team:** 1 developer · **Market:** Mexico, Spanish (es-MX) only

## Goal

Ship **one** Limon patient app (iOS + Android) that a nutritionist can sell to their patients:
a patient joins their nutritionist, pays a monthly subscription through Stripe, and gets a
weekly meal plan generated from the nutritionist's recipes, a shopping list, a water tracker and
a goal tracker. Our team turns each module on or off per nutritionist with feature flags.

### In scope

| Module | Feature flag | What ships |
|---|---|---|
| Authentication | always on | Sign up / sign in (Cognito, already built), consent capture (already built) |
| Admission | `invite_only` | Open sign-up, or invite only with a single-use code per patient |
| Patient registration | always on | Onboarding questionnaire (sex, birth date, height, weight, activity level, meals per day, allergies / dislikes), profile editing |
| Recipes | `recipes` | Default recipe library copied into each tenant; tenant copies can be edited; nutrition values from FatSecret MX |
| Weekly meal plan | `meal_plan` | Plans generated automatically each week from the tenant's recipes; favourite meals; regenerate a day |
| Food swaps (SMAE) | `food_swaps` | Swap an ingredient for an equivalent from the same SMAE group, with the portion recalculated |
| Shopping list | `shopping_list` (requires `meal_plan`) | Generated from the week's plan, grouped by category, items can be checked off |
| Water tracker | `water_tracker` | Daily target, quick add, history, local reminders |
| Goal tracker | `goal_tracker` | Patient sets a goal (lose / gain / maintain weight); logs weight, body measurements and body fat; progress charts |
| Subscriptions | always on | Stripe Checkout + Stripe Connect, webhook → `PatientSubscription` → entitlement (gating already built) |

### Out of scope for the MVP (see [After the MVP](#after-the-mvp))

Nutritionist web dashboard · per-tenant store builds · AI assistant · calendar / booking · chat · CFDI invoicing · self-serve plan upgrades.

## Key decisions this roadmap relies on

| Decision | Answer | Consequence |
|---|---|---|
| App distribution | **One branded app per nutritionist**, published from the nutritionist's own developer accounts (ADR-009) | Apple 4.2.6 requires template apps to be submitted by the content owner. Each pilot must enroll with Apple and Google in week 1; builds and submissions are manual for the pilots. |
| Patient payments | **Stripe** (Connect, so the money goes to the nutritionist) | See [App Store risk](#1-stripe-vs-app-store-rules-high) — the app itself must not sell anything. |
| Tenant billing | Base rate + add-ons | Pricing model still open — see [Tenant pricing options](#tenant-pricing-options). Invoice manually through Stripe Billing during the pilot. |
| Recipe ownership | Global default library → **copied** into each tenant at provisioning | Nutritionists edit their own copies; updates to the library never overwrite tenant edits. |
| Nutrition data | FatSecret (Mexico region) for nutrients, SMAE for equivalents | Licensing must be confirmed in week 1 — see [Risks](#2-nutrition-data-licensing-high). |
| Meal plan generation | Rule-based, no AI | Favourites are recorded now so a preference model can be trained later. |
| Nutritionist tools | No dashboard in the MVP | Recipe editing goes through an internal admin API + CSV import that **our team** runs for the nutritionist. An in-app nutritionist screen is a stretch goal. |

## Timeline

```
Week        1     2     3     4     5     6     7     8     9
            Sep28 Oct5  Oct12 Oct19 Oct26 Nov2  Nov9  Nov16 Nov23
Foundation  ████
Onboarding        ████
Recipes                 ████
Meal plans                    ████
Swaps+List                          ████
Trackers                                  ████
Payments                                        ████
Hardening                                             ████
Launch                                                      ████
Content     ░░░░░░░░░░░░░░░░░░░░░░░░ (default recipes, runs in parallel)
```

> Nov 16 is a public holiday in Mexico (Revolution Day, observed). Week 8 has 4 working days.

### Week 1 · Sep 28 – Oct 2 — Foundation and decisions

Close the blockers first so nothing stalls later.

- [ ] **Licensing:** confirm the FatSecret Platform API tier that allows the MX region, Spanish results and **storing** nutrient values in our recipes. Confirm the rights to use SMAE equivalent tables.
- [ ] **Stripe:** open the Stripe Mexico account, enable Connect (Express), and decide the patient payment flow (see Risk 1).
- [ ] **Store accounts:** each pilot nutritionist enrolls in Apple Developer + Google Play (ADR-009). Apple organization accounts need a D-U-N-S number; Google requires a 14-day closed test on new personal accounts, so start this now.
- [x] **Admission modes:** `invite_only` flag (open or invite only), per-patient single-use invite codes, admin command to issue them.
- [ ] **Feature flags:** add a `tenant_features` table (`tenant_id`, `feature_key`, `enabled`, `config` JSON). Return the enabled flags in `/apps/bootstrap` / `/me`, add an API guard (`requireFeature('meal_plan')`) that returns `FEATURE_DISABLED`, and hide the matching app tabs. Toggle flags with an internal admin script.
- [ ] **i18n:** set up es-MX strings (`i18next` / `expo-localization`); no hard-coded UI strings from here on.
- [ ] **Delivery:** staging deploy (CDK), EAS development build on a device, error tracking (Sentry) in the API and the app.

**Done when:** a patient can sign up in their nutritionist's staging app (with an invite code when that nutritionist is invite only), sees the nutritionist's branding, and only the enabled tabs.

### Week 2 · Oct 5 – 9 — Patient registration and profile

- [ ] Onboarding questionnaire (multi-step): sex, birth date, height, current weight, activity level, meals per day (3–5), allergies, disliked foods.
- [ ] `PatientProfile` model plus API (`GET/PUT /patients/me/profile`) with Zod validation.
- [ ] **Energy target:** Mifflin-St Jeor BMR × activity factor, adjusted by goal. Add **safety guardrails:** a calorie floor (e.g. never below 1,200 kcal), a maximum loss rate (about 0.5–1% of body weight per week), and a block or "consult your nutritionist" path for under-18s and pregnancy.
- [ ] Profile screen: edit data, sign out, delete account (ARCO: an email-based request process is enough for the MVP).

**Done when:** a new patient finishes onboarding and has a stored daily kcal and macro target.

### Week 3 · Oct 12 – 16 — Recipe catalog

- [ ] Data model:
  - `Food`: FatSecret `food_id`, SMAE group, nutrients per 100 g, units → grams.
  - `Recipe`: meal types (breakfast / lunch / dinner / snack), servings, time, image, tags.
  - `RecipeIngredient`: food, quantity, unit.
  - Cached per-serving nutrients on the recipe.
- [ ] **Global library + copy-on-provision:** add `default_recipes` (not tenant-scoped, read-only). When a tenant is created, copy it into tenant-scoped `recipes` with `source_default_recipe_id` kept for traceability.
- [ ] FatSecret import script: search → pick → store the food with nutrients and SMAE group (the SMAE group is assigned manually during curation).
- [ ] Internal admin API + CSV import to create and edit tenant recipes. Nutrients are recalculated on every save.
- [ ] App: recipe list (filter by meal type) and recipe detail (ingredients, steps, macros).

**Done when:** a new tenant automatically gets the default library, and an edited tenant recipe differs from the default.

### Week 4 · Oct 19 – 23 — Weekly meal plan generator

- [ ] Split the daily target across meals (e.g. 25 / 35 / 10 / 30 %).
- [ ] **Generator v1 (deterministic, testable):** for each day × meal slot, pick a recipe from the tenant catalog.
  - Hard filters: meal type, allergies, disliked foods.
  - Scoring: closeness to the slot's kcal and protein after portion scaling, variety (no repeat within 3 days), and a boost for favourites.
- [ ] Portion scaling: scale servings so each meal lands within ±10% of its slot target.
- [ ] A worker job builds next week's plan every Sunday (SQS worker already exists). "Regenerate this day" on demand.
- [ ] ♥ Favourite a meal → `meal_feedback` (patient, recipe, rating, week). This is the training data for future AI.
- [ ] App: week view → day view → meal detail, with daily totals against the target.

**Done when:** a patient with any valid profile gets a full 7-day plan within ±10% of their daily kcal, respecting allergies. Unit tests cover the generator.

### Week 5 · Oct 26 – 30 — SMAE food swaps and shopping list

- [ ] **Swaps:** on a meal ingredient, list foods from the same SMAE group. Convert the portion by equivalents: `new grams = (old grams / old grams per equivalent) × new grams per equivalent`. Store the swap on that plan meal only, never on the recipe.
- [ ] **Shopping list:** aggregate the week's ingredients (after swaps and portion scaling), normalize units, and group by category (produce, protein, dairy, grains, pantry). Round to shoppable quantities.
- [ ] Check off items (state kept per week); regenerate the list when the plan changes.

**Done when:** swapping an ingredient updates the meal's macros and the shopping list totals.

### Week 6 · Nov 2 – 6 — Water and goal trackers

- [ ] **Water:** daily target (default 35 ml/kg, editable), quick-add buttons (250 / 500 ml, custom), today's progress ring, 7- and 30-day history, local reminders (`expo-notifications`, no push server needed).
- [ ] **Goal:** the patient creates a goal (type, target weight, target date). The API validates it against the guardrails.
- [ ] Logs: weight, body measurements (waist, hip, chest, arm, thigh), body fat %. Show charts over time and progress toward the goal.
- [ ] **Home screen:** today's meals, water progress, latest weight, and a goal progress card, each shown only if its flag is enabled.

**Done when:** all four trackers work offline-tolerant (optimistic UI, retry) and respect their feature flags.

### Week 7 · Nov 9 – 13 — Payments (Stripe)

- [ ] Stripe Connect Express onboarding link per nutritionist (sent by our team). Save the account id on the tenant.
- [ ] One Stripe Price per tenant (their monthly patient fee), created on the connected account. The platform fee is collected via `application_fee_percent` if the pricing option uses it.
- [ ] Patient payment flow (web, outside the app — see Risk 1): Stripe Checkout (cards) → webhook (`checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed`) → `PatientSubscription` rows → existing entitlement gating.
- [ ] Stripe customer portal for cancellation and card updates (web).
- [ ] Tenant billing: create the base + add-on Prices in Stripe Billing and invoice the pilot tenants manually.

**Done when:** a test patient pays in Stripe test mode, gains access within seconds, and loses access after cancellation at the end of the period.

### Week 8 · Nov 16 – 20 — Hardening (4 days)

- [ ] Finish the Spanish copy, the privacy notice (aviso de privacidad) and terms, in-app links, and App Store privacy labels.
- [ ] End-to-end happy path: signup → onboarding → plan → swap → list → trackers → pay. Test with RLS cross-tenant isolation checks.
- [ ] Security pass on new endpoints (authorization, feature guards, rate limits), then production deploy and backups check.
- [ ] Empty states, loading and error states, accessibility basics.
- [ ] TestFlight + Play closed testing with the pilot nutritionists.

### Week 9 · Nov 23 – 27 — Launch buffer

- [ ] Submit to the App Store and Google Play; respond to review feedback.
- [ ] Onboard 1–2 pilot nutritionists: tenant, branding, flags, recipe tweaks, Stripe Connect, invite codes.
- [ ] Fix pilot bugs; hold scope.

### Parallel track — default recipe content (weeks 1–5)

The generator is only as good as the catalog. Target **≥ 80 default recipes** by the end of week 4: at least 20 per main meal type plus 20 snacks, spread across calorie ranges, with common allergens covered by alternatives. This is content work (ideally by a partner nutritionist), not engineering. If it slips, meal plans become repetitive.

## Cut line

If the schedule slips, drop these in order and ship them in v1.1:

1. Body measurement charts (keep logging, show a list)
2. SMAE swaps (keep the data model, hide the UI with the `food_swaps` flag)
3. Water reminders
4. Regenerate a single day
5. Stretch: an in-app nutritionist recipe editor (never in the critical path)

Never cut: admission modes, feature flags, guardrails, payments/entitlement, the Spanish copy and the privacy notice.

## Risks

### 1. Stripe vs App Store rules (high)
Apple 3.1.1 and Google Play Billing require store billing for digital content sold **inside** the app ([ADR-008](../architecture/adr/ADR-008-patient-payments.md)). Mexico has no external-link exception. To use Stripe safely:

- The app must contain **no** purchase button, prices, or links to pay. It only shows "your access is inactive, contact your nutritionist".
- Patients pay **outside the app**: the nutritionist sends a Stripe Checkout link (WhatsApp, email, website, in person). This is allowed under Apple 3.1.3(b) *multiplatform services*.
- Recommended order: pay link → the webhook creates a pending entitlement tied to the email → the patient signs up in their nutritionist's app with that email → access is granted.

App Review may still question it. Test it with an early TestFlight external build in week 7, not week 9.

### 2. Nutrition data licensing (high)
FatSecret's free tier restricts caching and storing of nutrient data, and the MX region and Spanish results need a paid (Premier) tier. The SMAE tables are a published, copyrighted work. Resolve both in week 1. The fallback is to store only the FatSecret ids and fetch nutrients live, which is slower and costs more calls.

### 3. Auto-generated plans without professional review (medium)
Patients set their own goals and plans are generated automatically, with no nutritionist in the loop in the MVP. Mitigations: the week 2 guardrails, a clear disclaimer, and a "your nutritionist can adjust this" message. The nutritionist override arrives with the dashboard.

### 4. Solo capacity (medium)
Eight weeks leaves no slack for illness or store rejections. Hold the cut line, and don't start the next week's module until the current one's "done when" passes.

### 5. Recipe content (medium)
See the parallel track above.

## Tenant pricing options

For the MVP features, **cloud cost per patient is almost zero.** The cost is the **fixed** baseline of running the platform. Rough list-price estimates for one production environment in `us-east-1` (verify with the AWS Pricing Calculator):

| Item | ≈ USD / month |
|---|---|
| Aurora Serverless v2 (0.5 ACU min) + storage | 50 |
| NAT gateway | 35 |
| ALB + WAF | 30 |
| ECS Fargate (API + worker, small tasks) | 20–40 |
| CloudWatch, Secrets Manager, S3, SES | 15–30 |
| **Baseline** | **≈ 150–200** |

Per active patient: API requests, a few KB of rows, and Cognito (the first 10k MAU are free) — well under **US$0.05/month**. FatSecret calls happen when recipes are curated, not per patient. Stripe fees (~3.6% + MX$3 + IVA per charge) are real per-patient costs, but they are paid out of the nutritionist's revenue.

Per-patient cost only becomes significant with the **AI add-on** (tokens per message), which should be metered on its own later.

So the patient count affects **fairness, support load and margin** more than cloud cost. The options:

| # | Model | Example | Pros | Cons |
|---|---|---|---|---|
| A | **Patient bands** | Base MX$X up to 50 active patients, higher base up to 150, up to 400… plus add-ons | Simple to sell, predictable, no metering code (nightly count + soft limit) | Jumps at band edges |
| B | **Base + included + overage** | Base covers 50 active patients, MX$Y per patient above that | Fair and smooth | Needs Stripe metered billing and usage reporting |
| C | **Base + revenue share** | Low base + platform takes N% of each patient payment through Connect `application_fee_percent` | Scales automatically with patients; almost no extra code since Stripe Connect is already in the flow; cost follows success | Nutritionists may resist a percentage; less predictable revenue |
| D | **Pure per patient** | MX$Y per active patient per month, no base | Lowest barrier to start | Doesn't cover the fixed baseline or per-tenant overhead for small tenants |

**Recommendation:** **A** for the pilot. It needs no billing code: bands are set manually in Stripe Billing, and a nightly job counts active patients (a patient with an active subscription that month) and alerts us when a tenant passes its band. Revisit **C** once Connect is proven, because it removes the counting problem entirely. Whatever the choice, price the base to cover the per-tenant overhead (onboarding, support, future store accounts), not cloud cost.

## After the MVP

| Phase | Window (estimate) | Scope |
|---|---|---|
| v1.1 | Dec 2026 | Anything past the cut line, pilot feedback, ARCO request flow in-app, analytics |
| Nutritionist dashboard | Jan – Feb 2027 | Recipe editor, patient list and progress, meal plan review/override, invite codes, Stripe Connect self-onboarding, feature/add-on self-upgrade |
| White-label builds | Feb – Mar 2027 | Per-tenant builds (ADR-009), EAS pipeline, OTA updates per tenant, CFDI invoicing (e.g. Facturapi) |
| AI add-on (`ai_assistant`) | Q2 2027 | Preference-aware plan generation trained on `meal_feedback`; patient assistant (recipe Q&A, swaps); nutritionist plan drafting; usage-metered billing |
| Booking add-on (`booking`) | Q2 2027 | Calendar, availability, video-call links, reminders |

## Definition of MVP done

- The app is live on the App Store and Google Play in Spanish.
- At least 1 pilot nutritionist is onboarded, with at least 10 patients paying through Stripe.
- Each module can be turned on and off per tenant without a release.
- No cross-tenant data access (RLS tests pass) and the guardrails are enforced server-side.
