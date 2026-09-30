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
| Store accounts for nutritionists without a business | **Individual** (Apple) / **personal** (Google) accounts | No registered business or D-U-N-S number needed. The seller shows as the nutritionist's legal name, and Google adds a 14-day closed test before the app can go public. See [Nutritionist onboarding](#nutritionist-onboarding-store-accounts). |
| Patient payments | **Stripe** (Connect, so the money goes to the nutritionist) | See [App Store risk](#1-stripe-vs-app-store-rules-high) — the app itself must not sell anything. |
| Tenant billing | Base rate + add-ons | Pricing model still open — see [Tenant pricing options](#tenant-pricing-options). Invoice manually through Stripe Billing during the pilot. |
| Recipe ownership | Global default library → **copied** into each tenant at provisioning | Nutritionists edit their own copies; updates to the library never overwrite tenant edits. |
| Nutrition data | **FatSecret Premier (Mexico region, Spanish)** for nutrients; **SMAE 5th ed. (v2.0, 2024)** for equivalents | FatSecret values differ from other sources, so it stays the source. Mexico data needs the paid Premier plan, and FatSecret only lets us store **IDs**: nutrients are fetched live and cached ≤ 24 h. See [Nutrition data](#nutrition-data-fatsecret--smae) and [Risks](#2-nutrition-data-fatsecret-premier-high). |
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

- [ ] **FatSecret:** create the free Basic account and API key, whitelist the dev machine's IP, try `foods.search` v3 / `food.get` v4 (US data, English — enough to build against). Ask sales for a **Premier quote for Mexico only** and whether a contract can allow storing nutrient values. Premier must be active **before week 3's recipe curation**.
- [ ] **SMAE:** buy the *Sistema Mexicano de Alimentos Equivalentes*, 5th ed. v2.0 (2024; Pérez Lizaur et al., ISBN of the 5th ed. 9786072938403, about MX$350). Ask the publisher about using the equivalent tables (group and grams per equivalent) in a commercial app.
- [ ] **Stripe:** open the Stripe Mexico account, enable Connect (Express), and decide the patient payment flow (see Risk 1).
- [ ] **Store accounts:** each pilot nutritionist starts enrolling in Apple Developer + Google Play (ADR-009), as an **individual / personal** account unless they have a registered business. Follow [Nutritionist onboarding](#nutritionist-onboarding-store-accounts); Apple identity checks can take days, so start this now.
- [x] **Admission modes:** `invite_only` flag (open or invite only), per-patient single-use invite codes, admin command to issue them.
- [x] **Feature flags:** `tenant_features` table (`tenant_id`, `feature_key`, `enabled`, `config` JSON). `/auth/me` returns the effective flags (dependencies such as `shopping_list` → `meal_plan` applied), the API guard `requireFeature(c, FeatureKey.MEAL_PLAN)` returns `FEATURE_DISABLED`, and the app hides disabled screens. Toggle with `pnpm --filter @limon/database admin features <slug> --enable … --disable …`.
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

Needs FatSecret Premier (Mexico) active, so curated foods use Mexican `food_id`s.

- [ ] Data model — **only what we may store** (see [Nutrition data](#nutrition-data-fatsecret--smae)):
  - `Food`: our own id, Spanish display name we write ourselves, FatSecret `food_id` + default `serving_id`, grams per serving, **SMAE group and grams per equivalent** (from the book), shopping category. **No nutrient values.**
  - `Recipe`: meal types (breakfast / lunch / dinner / snack), servings, time, image, tags.
  - `RecipeIngredient`: food, quantity, unit (converted to grams).
- [x] **Nutrition service** (`modules/foods`): FatSecret client (OAuth 2.0 token reuse, `foods.search` v1 / `food.get` v4, `region`/`language` when on Premier) and the **shared Postgres cache** `fatsecret_food_cache`: every API task and the worker share it, rows expire and are deleted 24 h after fetch, and the worker refreshes foods older than 6 h every 15 min. A FatSecret outage of up to ~18 h, or a restart, doesn't affect lookups. Calls scale with distinct foods (~300 → ~1,200/day), not patients. Recipe macros are computed on demand, never stored.
- [ ] **Global library + copy-on-provision:** add `default_recipes` (not tenant-scoped, read-only). When a tenant is created, copy it into tenant-scoped `recipes` with `source_default_recipe_id` kept for traceability.
- [ ] Curation script: FatSecret search (MX) → pick the food and serving → save the IDs and grams; the SMAE group and grams per equivalent are entered by hand from the book.
- [ ] Internal admin API + CSV import to create and edit tenant recipes.
- [ ] App: recipe list (filter by meal type) and recipe detail (ingredients, steps, macros), with the FatSecret attribution if the contract requires it.

**Done when:** a new tenant automatically gets the default library, an edited tenant recipe differs from the default, and recipe macros come from FatSecret MX through the 24 h cache with nothing else stored.

### Week 4 · Oct 19 – 23 — Weekly meal plan generator

- [ ] Split the daily target across meals (e.g. 25 / 35 / 10 / 30 %).
- [ ] **Generator v1 (deterministic, testable):** for each day × meal slot, pick a recipe from the tenant catalog.
  - Hard filters: meal type, allergies, disliked foods.
  - Scoring: closeness to the slot's kcal and protein after portion scaling, variety (no repeat within 3 days), and a boost for favourites.
- [ ] Portion scaling: scale servings so each meal lands within ±10% of its slot target.
- [ ] A worker job builds next week's plan every Sunday (SQS worker already exists). It refreshes the nutrient cache for the catalog's foods first, then generates every plan from that cache. "Regenerate this day" on demand.
- [ ] Plans store recipe ids and portion factors only; the day totals shown in the app are recomputed from the cache.
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
- [ ] **Start Google's closed test (by Fri Nov 6 at the latest):** upload the current Android build to each pilot's Play closed-testing track and get **at least 12 testers** opted in (their first patients). Google only grants production access after 14 continuous days, so this is the last week that still allows a week-9 launch.

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
- [ ] TestFlight with the pilot nutritionists; keep the Play closed test running (testers must stay opted in) and apply for production access once 14 days have passed.

### Week 9 · Nov 23 – 27 — Launch buffer

- [ ] Submit to the App Store and Google Play; respond to review feedback.
- [ ] Finish onboarding 1–2 pilot nutritionists (store accounts started in week 1): tenant, branding, flags, recipe tweaks, Stripe Connect, invite codes.
- [ ] Fix pilot bugs; hold scope.

### Parallel track — default recipe content (weeks 1–5)

The generator is only as good as the catalog. Target **≥ 80 default recipes** by the end of week 4: at least 20 per main meal type plus 20 snacks, spread across calorie ranges, with common allergens covered by alternatives. This is content work (ideally by a partner nutritionist), not engineering. If it slips, meal plans become repetitive.

## Nutrition data (FatSecret + SMAE)

| What | Source | Stored by us? |
|---|---|---|
| Calories, macros and micronutrients | FatSecret Premier, `region=MX`, `language=es` | **No.** Fetched with `food.get` v4 and cached ≤ 24 h |
| Food and serving identifiers | FatSecret (`food_id`, `serving_id`) | Yes, indefinitely (allowed) |
| Spanish display names, grams per serving, shopping category | Written by us during curation | Yes |
| SMAE group and grams per equivalent (for swaps) | SMAE 5th ed. v2.0, entered by hand | Yes |

Where to get SMAE: *Sistema Mexicano de Alimentos Equivalentes*, 5th edition (v2.0 updated in 2024 with 88 new foods and a dishes section), by Ana Bertha Pérez Lizaur et al. Sold at El Sótano, Gonvill, Librería León, Librería Científica, Nutritienda MX and Medi-ción (about MX$350–440).

## Nutritionist onboarding (store accounts)

Every nutritionist publishes their own app (Apple 4.2.6, ADR-009). Many don't have a registered business, so the default is an **individual** account on each store. No company, D-U-N-S number or organization paperwork is needed.

| | Apple Developer (Individual) | Google Play (personal) |
|---|---|---|
| Needs | Government ID; an Apple ID with two-factor authentication on the nutritionist's phone | Government ID |
| Cost | US$99 per year | US$25 once |
| Shown in the store | App name is theirs to choose ("Nutrición María"); the **seller is their legal name** | Their developer name |
| Catch | Only the account holder can manage signing certificates. Extra users get App Store Connect access only (up to 10) | New personal accounts must run a **closed test with ≥ 12 testers for 14 continuous days** before publishing |

Because patients pay through Stripe outside the app, the apps are free: no Apple paid-apps agreement and no Google payments profile, so no tax or banking forms with the stores.

**Steps per nutritionist (≈ 3 weeks, mostly Google's closed test):**

1. We create their operations mailbox (`<name>@apps.<domain>`, ADR-009).
2. They enroll in the Apple Developer Program as **Individual** with that mailbox, their ID and their phone for two-factor.
3. They create a Google Play **personal** developer account.
4. We get build access. On Apple, an **App Store Connect API key** created during onboarding lets EAS build, sign and submit without needing their two-factor code each time. On Google, we are added as an admin user.
5. Their first **12 patients join the Android closed test**. The 14-day clock starts when the 12th tester opts in.
6. They open a **Stripe Connect Express** account as an individual, with their bank account (CLABE) and likely their RFC. Most practicing nutritionists already have an RFC because they issue receipts.

**Open question (confirm with the first pilot):** whether an Individual Apple account can create the App Store Connect API key EAS needs for signing. If it can't, every signing session needs a two-factor code from the nutritionist. Workable for the pilots, but it doesn't scale.

**Later:**
- A nutritionist who forms a company can move their app to an organization account; both stores support app transfers, so patients keep the same app.
- Nutritionists who won't enroll at all could be offered a cheaper plan: one app under our account where patients pick their nutritionist (the "picker" model Apple 4.2.6 allows). That's a product decision for after the pilot.

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

### 2. Nutrition data: FatSecret Premier (high)
- **Cost:** Mexico data and Spanish are **Premier only**, priced on request by country. The free Basic and Premier Free plans are US-only and English-only. Get the quote in week 1; it's a fixed monthly cost to add to the baseline below.
- **Schedule:** curation in week 3 needs Mexican `food_id`s, so Premier must be active by Oct 12. Until then, build against Basic (US data) — the code is the same, only the IDs differ.
- **Storage:** only IDs may be kept; nutrients, names and serving details can be cached 24 h at most, on every plan. The design above follows this. Ask sales whether a contract can allow storing nutrient values; if yes, the cache can become a table.
- **Dependency:** plan generation and recipe macros need FatSecret to be reachable. Mitigations: the 24 h cache, refreshing it before the Sunday plan job, and showing plans without macros (instead of failing) if FatSecret is down.
- **Access:** OAuth 2.0 keys only work from whitelisted IPs (up to 15 ranges). In AWS that's the NAT gateway's fixed outbound IP; add it before the staging deploy.
- **SMAE:** a published, copyrighted book. We store only per-food facts (group, grams per equivalent), not the book's tables; still confirm with the publisher.

### 3. Auto-generated plans without professional review (medium)
Patients set their own goals and plans are generated automatically, with no nutritionist in the loop in the MVP. Mitigations: the week 2 guardrails, a clear disclaimer, and a "your nutritionist can adjust this" message. The nutritionist override arrives with the dashboard.

### 4. Solo capacity (medium)
Eight weeks leaves no slack for illness or store rejections. Hold the cut line, and don't start the next week's module until the current one's "done when" passes.

### 5. Recipe content (medium)
See the parallel track above.

### 6. Store onboarding for each nutritionist (high)
Launch depends on steps the nutritionist has to do: identity checks, two-factor on their phone, and 12 real testers for 14 days on Google. A pilot who starts late misses week 9. Mitigations: start enrollment in week 1, have their first patients ready as testers, start the closed test by Nov 6, and confirm the Apple API-key question with the first pilot. See [Nutritionist onboarding](#nutritionist-onboarding-store-accounts).

## Tenant pricing options

For the MVP features, **cloud cost per patient is almost zero.** The cost is the **fixed** baseline of running the platform. Rough list-price estimates for one production environment in `us-east-1` (verify with the AWS Pricing Calculator):

| Item | ≈ USD / month |
|---|---|
| Aurora Serverless v2 (0.5 ACU min) + storage | 50 |
| NAT gateway | 35 |
| ALB + WAF | 30 |
| ECS Fargate (API + worker, small tasks) | 20–40 |
| CloudWatch, Secrets Manager, S3, SES | 15–30 |
| FatSecret Premier (Mexico) | quote pending |
| **Baseline** | **≈ 150–200 + FatSecret** |

Per active patient: API requests, a few KB of rows, and Cognito (the first 10k MAU are free) — well under **US$0.05/month**. FatSecret calls scale with the number of distinct foods in the shared 24 h cache, not with patients. Stripe fees (~3.6% + MX$3 + IVA per charge) are real per-patient costs, but they are paid out of the nutritionist's revenue.

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
| Build automation | Feb – Mar 2027 | Automated per-tenant build and submit pipeline (the MVP pilots are built by hand), OTA updates per tenant, guided store-account onboarding, CFDI invoicing (e.g. Facturapi) |
| AI add-on (`ai_assistant`) | Q2 2027 | Preference-aware plan generation trained on `meal_feedback`; patient assistant (recipe Q&A, swaps); nutritionist plan drafting; usage-metered billing |
| Booking add-on (`booking`) | Q2 2027 | Calendar, availability, video-call links, reminders |

## Definition of MVP done

- Each pilot nutritionist's own app is live on the App Store and Google Play, in Spanish.
- At least 1 pilot nutritionist is onboarded, with at least 10 patients paying through Stripe.
- Each module can be turned on and off per tenant without a release.
- No cross-tenant data access (RLS tests pass) and the guardrails are enforced server-side.
