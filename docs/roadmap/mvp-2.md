# MVP.2: engagement, onboarding and the nutritionist dashboard

**Planned:** 2026-10-18 · **Window:** Mon 2026-10-19 → Fri 2026-11-27 (6 weeks, week 5 has 4 days) · **Team:** 1 developer · **Environment:** `preproduction` only

## Goal

Make the patient app something a patient **uses every day**, and give the nutritionist a place to see it working:

1. Every designed screen built, plus the missing ones (onboarding, entry screens, new MVP.2 screens).
2. Meal check-off: the patient marks each meal as eaten (or not), which feeds the Inicio streak and adherence ring.
3. Notifications across every feature: meals, water, the weekly weigh-in, and nudges based on what the patient did or didn't log.
4. A first nutritionist dashboard (`apps/dashboard`): patients, their adherence and progress, notification settings within platform limits, and analytics.

### What changes from MVP.1

- **There is no launch date.** MVP.1 and MVP.2 are tested in `preproduction` only. A real tenant launches once everything has been tested end to end. The App Store / Play submission and Google's 14-day closed test leave the critical path until then.
- **Payments are paused.** [Patient payments with Stripe](stripe-payments.md) (MVP.1 week 7) comes back after MVP.2. Until then, testers get access through the manual admin subscription (`a56cc6a`).
- **The nutritionist dashboard moves forward** from Jan–Feb 2027 to here, in a reduced form (see [Phase 6](#phase-6--nutritionist-dashboard-v0)). Some things wait until later: the recipe editor, meal plan override, Stripe Connect self-onboarding and add-on upgrades.

### Out of scope

Payments (back to MVP.1 afterwards) · store submission · AI assistant · booking · chat · recipe editor in the dashboard · the platform admin dashboard.

## Where things stand (Oct 18)

### Patient app

| Area | State |
|---|---|
| Screens 1–7 (Inicio, Comidas, Detalle de comida, Recetas, Detalle de receta, Progreso, Perfil) | Built from the mockups |
| Screens 8–17 (Editar perfil, sign-in, sign-up, confirm email, invite code, onboarding, subscription, shopping list, water detail, service unavailable) | Working, but **not designed**: they use the tokens and components, with no mockup |
| Inicio streak, "3/5 comidas", adherence ring | Blocked: there's no meal check-off |
| Notifications | None. `expo-notifications` isn't installed, which needs a new development build |
| Meal times | **Not stored.** Onboarding asks for meals per day only, so there's no time to remind at |
| Time zone | Fixed to `America/Mexico_City` (`meal-plans/week.ts`, `water.service.ts`). Fine for the pilot, but reminders should use the device's time zone |

### Nutritionist dashboard (`apps/dashboard`)

It's the skeleton from the initial setup (`447b5a0`) and has had no feature work since:

| Area | State |
|---|---|
| Stack | Next.js 15 App Router, React 19, shares `@limon/api-client`, `@limon/types`, `@limon/ui`, `@limon/validation`. Plain `globals.css`, no design system, English copy |
| Sign-in | **Dev only**: `POST /dev/token` with a typed subject, token in `sessionStorage`. No Identity Platform sign-in. Nutritionists are meant to sign in at the project level, outside any identity tenant ([GCP phase 4](gcp-migration.md#phase-4--authentication-cognito--identity-platform-oct-1314-the-largest-piece)). The production plan (httpOnly cookies set by a route handler) isn't built |
| Register | Form → dev token → `POST /auth/register/nutritionist` (creates tenant + nutritionist + apps). The real flow is our team running `admin`, so this page may go |
| Pages | Overview (tenant name, status, role) and Patients (a list from `GET /patients`) work. Meal plans, Recipes, Protocols, Payments, Subscriptions, My app and Settings are placeholders |
| API for nutritionists | The `NUTRITIONIST` role has `patients:read/write`, `recipes:write`, `meal-plans:write`, `branding:manage`, but only `GET/POST /patients`, `GET /patients/:id` and `PATCH /tenants/current/branding` use them. **No route lets a nutritionist read a patient's plan, logs or progress** |
| Deployment | Not deployed. Terraform has the `api` Cloud Run service only. There's a `Dockerfile` |

## Decisions to make

| # | Decision | Options | When |
|---|---|---|---|
| D1 | Meal-log model | **Decided 2026-10-18**, see [Phase 1](#phase-1--meal-log-design-and-check-off) | Done |
| D2 | Local vs server notifications, per notification | See [Phase 3](#phase-3--notification-research-local-vs-server) | Week 1 spike, decided before Phase 4 |
| D3 | Push provider | **Expo Push Service** (one API for both platforms, receipts, free) or **FCM directly** (Firebase is already in the project through Identity Platform) | With D2 |
| D4 | Actions on the notification ("Sí, comí") | Ship them, or open the app on tap only | Research spike in Phase 3 |
| D5 | Dashboard sign-in | Firebase JS SDK on the client + an httpOnly session cookie set by a route handler, or tokens in memory only | Week 1 |
| D6 | What analytics to track | See [Phase 7](#phase-7--analytics) | Before Phase 4, so events are recorded from the first notification |
| D7 | Dashboard design | Use the patient app's tokens (`@limon/ui`) on the web, or a separate light admin style | Week 1 |

## Glossary: what push needs per tenant

Each tenant's app is published from **the nutritionist's own** Apple and Google accounts ([ADR-009](../architecture/adr/ADR-009-store-account-provisioning.md)), so each app has its own push credentials:

- **APNs** (Apple Push Notification service): the only way to send a push to an iPhone. It needs an **APNs key** (a `.p8` file) created in the nutritionist's Apple Developer account. One key can serve every app on that account.
- **FCM** (Firebase Cloud Messaging): the same thing for Android. Each Android app is registered in a Firebase project and gets a `google-services.json`. FCM can also deliver to iOS by holding the APNs key.
- **EAS** (Expo Application Services): Expo's build and submit service, which the app already uses (`eas.json`). EAS stores the APNs key and FCM credentials for each app, and the **Expo Push Service** sends through them using one Expo push token per device.

Local notifications (scheduled on the phone) need **none** of this. Only server pushes do.

To-do: add "create the APNs key and register the Android app in Firebase" to the [nutritionist store-account onboarding](mvp-roadmap.md#nutritionist-onboarding-store-accounts).

## Timeline

```
Week          1      2      3      4      5      6
              Oct19  Oct26  Nov2   Nov9   Nov16  Nov23
Meal log      ███▌
Notif. spike  ███
Onboarding+UI        ████   ██
Local notif.                ███
Server push                        ████
Dashboard     █             █      ██     ████
Analytics                          █      ██
Hardening                                        ████
```

> Nov 16 is a public holiday in Mexico (Revolution Day, observed). Week 5 has 4 working days.

### Week 1 · Oct 19 – 23 — Decisions and foundations

- Meal-log design session (D1) → model, migration, API.
- Notification spike (D2, D3, D4).
- `expo-notifications` into a new development build. APNs key + Firebase Android app for the test tenant.
- Dashboard: Identity Platform sign-in (D5) and a `dashboard` Cloud Run service in Terraform.

### Week 2 · Oct 26 – 30 — Check-off and onboarding

- Meal check-off in the app (Comidas, Detalle de comida, Inicio tiles and ring).
- Design the new and missing screens (Phase 2), then build onboarding, including meal times and the permission primer.

### Week 3 · Nov 2 – 6 — Local notifications

- Meal, water and weigh-in reminders, scheduled on the phone. Notification settings screen.
- Remaining entry screens restyled.
- Dashboard: patient detail (read-only).

### Week 4 · Nov 9 – 13 — Server push

- Device tokens, the scheduler job, conditional nudges, the weekly summary.
- Dashboard: notification settings within limits. Analytics events recorded.

### Week 5 · Nov 16 – 20 — Dashboard and analytics (4 days)

- Dashboard: patient list with adherence, invite codes, analytics v0.

### Week 6 · Nov 23 – 27 — Hardening

- End-to-end test in `preproduction`: invite → onboarding → plan → check-offs → reminders → weigh-in → the nutritionist sees it.
- Permission denied, offline, logout and account deletion paths. RLS and authorization tests on the new routes.

## Phase 1 · Meal-log design and check-off

This model feeds the streak, adherence, conditional nudges, the dashboard, analytics and later the [AI add-on](ai-addon.md). Answer these questions **before** writing the migration.

### Decisions (2026-10-18)

| # | Question | Decision |
|---|---|---|
| 1 | States | `EATEN`, `SKIPPED`, `OTHER` ("Comí / No comí / Otra cosa"). No answer is **no row**, never a state, so a real skip is never confused with forgetting |
| 2 | Ate something else | Optional free text (one line, e.g. "tacos con la familia"). No catalog search |
| 3 | Portion | Not asked in MVP.2: `EATEN` means the plan portion |
| 4 | Extras off the plan | Not in MVP.2: only planned meals are logged |
| 5 | Hunger / how they felt | Not in MVP.2 |
| 6 | How late | Today and yesterday. Older days are read-only |
| 7 | Future meals | Any meal of today, even dinner at noon; never a future day |
| 8 | "On time" for the streak | A meal counts for its day if logged within the late window (by the end of the next day). No timing pressure |
| 9 | Regenerating a day | Logged meals are **kept**; only unlogged slots get new meals. The generator fills the rest of the day against the target minus the kept meals |
| 10 | Swaps | The log records the meal **with its swaps** at log time |
| 11 | Slot with no recipe | Can be logged as `OTHER` only (with the optional text), so the day can still be complete |
| 12 | Adherence | % of the week's planned meals so far: `EATEN` = 1, `OTHER` = 0.5, `SKIPPED` / not logged = 0. Shown as "12 de 15 comidas" |
| 13 | Streak day | Every meal of the day answered, **in any state**. It rewards honest logging; adherence shows quality |
| 13b | Grace day | One missed day per week (Monday–Sunday) doesn't reset the streak |
| 14 | Calories today (Inicio) | Logged `EATEN` meals only, against the target. `OTHER` adds no kcal and shows as a note |
| 15 | Nutritionist | Weekly adherence and streak in the patient list; the patient detail shows each day's meals with their state and the `OTHER` text |
| 16 | Patient history | The current week in the Comidas day strip (check-offs on past days, read-only beyond yesterday). No new screen |
| 17 | Preference model | `meal_logs` stays its own table. The AI add-on can read it later (`EATEN` a weak positive, `SKIPPED` / `OTHER` weak negatives); nothing is written to `MealFeedback` |

### What these mean for the build

- **FatSecret only lets us store IDs** ([Nutrition data](mvp-roadmap.md#nutrition-data-fatsecret--smae)), so the "snapshot" can't hold kcal or macros. It holds what's needed to recalculate them: recipe id, servings and the swapped food ids at log time. Kcal is worked out on read, the same way the plan's meals are today, through the ≤ 24 h cache. To-do: confirm with the FatSecret terms whether calculated daily totals (not per-food values) may be stored, which would make adherence and the dashboard cheaper to read.
- **Regenerate-a-day changes:** `MealPlanMeal` rows with a log are no longer deleted. Each slot already has its share of the day's target, so the new meals fill the rest of the day without recalculating. Comidas still shows "Cambiar el menú de este día" while some slots are unlogged.
- **The streak and adherence are calculated on read** from `meal_logs` and the plan, not stored, so changing a rule later doesn't need a data fix.
- **The `OTHER` text is free text written by the patient,** so treat it as health data: never logged, never in audit metadata, and capped in length.
- Using logs as training data later needs to be covered by the consent and the privacy notice (see [AI add-on](ai-addon.md)).

### To-do

- [x] Answer the design questions (above).
- [x] `meal_logs` model and migration `0019_meal_logs` (tenant-scoped, RLS, composite tenant keys):
  - `tenantId`, `patientId`, `date`, `slot`, `mealType`, unique on (`tenantId`, `patientId`, `date`, `slot`). **Keyed by the day and slot, with no foreign key to the plan meal**: the answer belongs to the slot, so it survives a regenerated day or week without a nullable key.
  - `status` (`EATEN | SKIPPED | OTHER`), `note` (only with `OTHER`, ≤ 140 characters, checked in the database too)
  - snapshot: `recipeId` (null only for an empty slot, which only allows `OTHER`), `servings`, `swaps` (`[{ recipeIngredientId, foodId }]`)
  - `source` (`APP | NOTIFICATION`), `loggedAt`, `updatedAt`
- [x] API, behind `meal_plan` and paywalled (`self:meal-plans:*`):
  - `PUT /meal-plans/meals/:mealId/log` (`{ status, note?, source? }`; today or yesterday, which may be last week's meal on a Monday) returns the answer and the progress. `DELETE` undoes it.
  - `GET /meal-plans/current` gives each meal its `log` (or null).
  - `GET /meal-plans/progress`: today (meals, answered, eaten, kcal of the eaten meals, target), the week (score, counted, adherence) and the streak (days, whether this week's forgiven day is used). Worked out on read (`meal-log-stats.ts`, unit-tested); the streak looks back 365 days.
  - Swapping an ingredient of a meal already checked off updates the check-off's swaps.
  - Check-offs aren't audited, like water: they're the patient's own diary, and frequent.
- [x] Regenerate-a-day keeps logged meals (decision 9): only the unlogged slots get new recipes (the kept ones count for variety), and a day with every meal answered returns 409. The audit entry records `keptSlots`.
- [x] App: the meal card's tile is the check-off button for today's and yesterday's meals (empty ring until answered; ✓ eaten, ≈ something else, – skipped, with the answer in the caption). It opens a sheet: "Comí" and "No comí" save at once, "Comí otra cosa" shows the optional note first, and an answer can be cleared. Optimistic, with undo on failure. The meal detail has the same check-off as a row at the top.
- [x] Inicio: the inner ring is the week's adherence; tiles for the streak, meals eaten today and calories eaten. Without a weight goal the outer ring shows today's calories. Four tiles go in a 2×2 grid.
- [x] Close the UI brief's open question about meal check-off.
- Known gap: on a Monday, Sunday's meals can still be logged (API), but Comidas only shows the current week. The app needs a way to reach them (a "¿Y ayer?" prompt on Inicio, or the notification).

**Done when:** a patient logs a day of meals, the Inicio tiles and the ring update, and regenerating a day doesn't lose a log.

## Phase 2 · Screens and onboarding

### New and missing screens

| Screen | Status | Note |
|---|---|---|
| Onboarding (redesigned) | to design | Steps from today's questionnaire, **plus meal times** and the notification primer |
| Notification primer | new | Shown before the iOS system prompt, which can only be shown once |
| Notification settings | new | From Perfil: per category (meals, water, weigh-in, summaries), quiet hours, a master switch |
| Meal check-off | new | In the meal card and as a sheet ("¿Qué comiste?") |
| Weekly summary | new | Adherence, water, weight change, opened from the Sunday notification |
| Weigh-in reminder target | existing | Progreso's "Registrar peso" sheet, opened from the notification |
| Sign-in, sign-up, confirm email, invite code | to design | |
| Editar perfil, subscription, shopping list, water detail, service unavailable | to design | |

### Onboarding

- [ ] Design the flow: welcome → about you (today's questionnaire) → **meal times** (pre-filled from meals per day, editable) → weigh-in day (when the tenant allows a choice) → notification primer → plan ready.
- [ ] **Meal times:** store a default time for each slot on the profile. They're used for reminders and shown in Comidas ("Desayuno · 8:00"). Editable from Editar perfil.
- [ ] **Permission primer:** explain what reminders do, using the clinic's name, with a "Ahora no" option. Only "Sí" triggers the system prompt. If the patient declines, offer again later in context (after the first check-off, from settings), never on every launch. Android 13+ also needs the runtime permission.
- [ ] Keep the existing gates in `RootNavigator` (onboarding before the paywall, paywall before the app).

**Done when:** a new patient goes from invite code to their first plan with meal times saved and a notification choice made.

## Phase 3 · Notification research: local vs server

Each notification is a separate task. For each one, decide where it's scheduled, what triggers it and what happens on tap.

### Comparison

| | Local (scheduled on the phone) | Server push |
|---|---|---|
| Needs | `expo-notifications` only | Device tokens, APNs/FCM credentials per tenant, a scheduler job, a sender |
| Works offline | Yes | Needs a connection to receive |
| Knows what the patient did | Only what's on the phone when it schedules. It can cancel today's lunch reminder after a check-off in the app, but not after a log on another device | Yes, it reads the database at send time |
| Content changes without an app update | No | Yes |
| Limits | iOS keeps at most **64** pending local notifications per app, so reschedule a rolling window (e.g. the next 3 days) on every app open | Rate limits from APNs/FCM, receipts to check, tokens that expire |
| Analytics | Delivery isn't reported; only taps (when the app opens) | Sent, delivered (receipts), tapped |
| Dashboard can change it | Only when the app next syncs its settings | Immediately |

### First notification (decided 2026-10-19)

Only the **meal check** ships first, to test on a physical Android phone:

- **Local**, scheduled on the phone. No server push, so no APNs key or Firebase Android app yet.
- **Once per meal**, 30 minutes after the meal's usual hour: "¿Comiste tu desayuno?" No reminder at the meal time itself.
- **Default times** until meal times are stored (Phase 2): breakfast 8:00, lunch 14:00, dinner 20:00, snacks halfway between the meals around them (`mealHours` in `features/home/next-meal.ts`).
- Skipped when the meal is already answered, and cancelled on check-off. Rescheduled from the plan on every Inicio visit and when Comidas loads. Cleared on sign-out and account deletion.
- Tapping it opens the meal detail, or Comidas when the meal has no recipe.
- The permission is asked the first time the plan loads, with no primer yet (Phase 2).

### Candidate notifications

| Notification | Trigger | Proposed | Open questions |
|---|---|---|---|
| Meal reminder ("Es hora de tu comida") | Meal time | Local | Before the meal or at it? Show the dish name? |
| Meal check ("¿Ya comiste?") | N minutes after the meal time, **only if not logged** | Local, cancelled on check-off; server if logs on other devices or the dashboard matter | How long after? Once or twice? |
| Water | Every N hours inside waking hours, skipped when on target | Local | Spread evenly, or tied to meals? |
| Weekly weigh-in | Weigh-in day, morning | Local | Fixed day per tenant, or patient's choice within the tenant's options? |
| Missed weigh-in | Day after, if not logged | Server | |
| Weekly summary | Sunday evening | Server | Sent before or after the new plan is generated? |
| New plan ready + shopping list | Weekly plan job | Server | The weekly plan job doesn't exist yet (worker-app.ts, MVP week 4) |
| Re-engagement | No log for N days | Server | After how many days? Stop after how many tries? |
| Message from the nutritionist | Dashboard action | Server | In MVP.2, or later? |

### Research spike (D4: actions on the notification)

- [ ] iOS notification categories and Android actions in `expo-notifications` ("Sí, comí", "No", "Otra cosa").
- [ ] Can the action call the API **without opening the app**? That needs a valid Identity Platform token in the background (Firebase refreshes it while the app runs, not necessarily when it's woken by an action). Options: open the app briefly; a short-lived, single-purpose signed token in the notification payload (server push only); or queue the answer on the phone and send it on the next open.
- [ ] What each option means for security (a token in a payload sits on the lock screen and in OS logs).

**Done when:** each candidate notification has a decision (local or server, trigger, copy key, tap destination), and D3 and D4 are recorded.

## Phase 4 · Local notifications

- [ ] Install `expo-notifications` and build a new development build for each test tenant.
- [ ] A scheduler on the phone: from the plan, meal times, settings and today's logs, schedule the next few days and reschedule on app open, after a check-off and after a settings change. Respect the 64-notification iOS limit.
- [ ] Tapping a notification opens the right screen (meal detail, water, "Registrar peso").
- [ ] Notification settings screen (Phase 2), stored on the server so the dashboard and server pushes see them.
- [ ] Cancel everything on logout and account deletion.

**Done when:** with the phone offline, a patient gets their meal, water and weigh-in reminders at the right times, and a meal reminder doesn't fire after that meal is checked off.

## Phase 5 · Server push

- [ ] Per tenant: APNs key and Android Firebase app (see the [glossary](#glossary-what-push-needs-per-tenant)), stored by EAS (Expo Push) or in Secret Manager (FCM directly), per D3.
- [ ] `device_tokens` table (tenant, patient, token, platform, app id, last seen). Registered after permission is granted and on every app open; deleted on logout, account deletion, and when the provider reports the token invalid.
- [ ] Sender in the worker: Cloud Scheduler (every 5–15 min) → Pub/Sub → a job that finds due notifications per tenant, checks settings, quiet hours and caps, sends, and records the result. Idempotent per patient, notification and day, so a retried job never sends twice.
- [ ] Delivery receipts: drop invalid tokens and record failures.
- [ ] Use the patient's device time zone instead of the fixed `America/Mexico_City` for anything sent at a local time.

**Done when:** a patient who hasn't logged lunch gets one nudge, never two, and a deleted account gets nothing.

## Phase 6 · Nutritionist dashboard v0

### Foundations

- [ ] Sign-in with Identity Platform at the project level (D5). Remove `sessionStorage` tokens. Keep `/dev/token` for local development only.
- [ ] Cloud Run service `dashboard` in Terraform, on a subdomain (e.g. `app.projectlimon.com`).
- [ ] Spanish (es-MX) copy and a design direction (D7).
- [ ] Remove or hide the placeholder pages that MVP.2 doesn't fill (Payments, Subscriptions, Protocols, Meal plans, Recipes).

### Features

- [ ] **Patients:** a list with last activity, adherence this week and the latest weight change. Patient detail (read-only): profile summary, goal, weight chart, meal logs and adherence, water. Needs **new API routes for nutritionists** that read one patient's data (the `patients:read` permission exists, the routes don't), each written to `audit_logs`.
- [ ] **Invite codes:** create and list single-use codes (today our team does this).
- [ ] **Notification settings:** the nutritionist sets defaults within platform limits (below). Stored in `tenant_features.config`, validated in `@limon/validation`.
- [ ] **Analytics** (Phase 7).

### Notification limits

There are three levels, each one stricter than or equal to the one above:

| Level | Sets | Examples |
|---|---|---|
| Platform (us, in code) | Hard limits no one can exceed | At most N pushes a day per patient; quiet hours at least 22:00–07:00; weigh-in reminders at most once a week; no weight or health details on the lock screen |
| Nutritionist (dashboard) | Defaults and allowed options inside the platform limits | Weigh-in day (fixed, or patient's choice); intensity (light, normal, intensive); which categories are on |
| Patient (app) | Their own choice inside the nutritionist's options | Turn a category off, move quiet hours, lower the intensity. **A patient can always turn notifications off**, whatever the nutritionist sets |

To-do: settle the platform numbers (N per day, the meal-check delay, re-engagement tries) during the Phase 3 spike.

**Done when:** a nutritionist signs in on `preproduction`, sees a test patient's week of check-offs and weigh-ins, changes the weigh-in day, and the patient's next reminder follows it.

## Phase 7 · Analytics

Decide what's worth tracking **before** Phase 4, so the first notifications already produce data. Candidates:

| Question for the nutritionist | Metric |
|---|---|
| Are my patients following the plan? | Weekly adherence per patient and across the practice; meals skipped by meal type (e.g. breakfast skipped most) |
| Who needs attention? | Patients with no logs in N days; adherence dropping week over week; missed weigh-ins |
| Are they progressing? | Weight change toward the goal; share of patients on track |
| Do reminders help? | Notification tap rate per category; check-offs within N minutes of a reminder vs without; patients who turned a category off |
| Is the app being used? | Daily / weekly active patients; onboarding completion; notification permission granted |

Questions to answer:

- [ ] Which of these does the nutritionist actually act on? (Ask the pilot nutritionists.)
- [ ] Calculated on read from existing tables (logs, body logs, water) vs. a separate `events` table for things the tables don't hold (notification sent, tapped, permission granted). Proposal: both. Product metrics come from the domain tables; notification and app events go in a small events table.
- [ ] Privacy: analytics stay **inside the tenant** (RLS). No third-party analytics SDK receives health data. An aggregate view across tenants for us belongs to the [platform admin dashboard](admin-dashboard.md), without health data.

## Notification copy

- Write several variants for each notification in `es-MX.ts`, picked in rotation so they don't repeat.
- Tone: supportive, never shaming. No "you failed", "you missed again", or guilt about food or weight.
- **Never** put weight, kcal or health details in the title or body (lock-screen privacy, LFPDPPP sensitive data). "Es hora de registrar tu peso", not "Llevas 82.4 kg".
- Use the clinic's name where it helps ("Tu nutrióloga en {clinic} te recuerda…").
- Back off: after N ignored reminders of one category, reduce the frequency and offer to adjust settings.
- Get the copy reviewed by a pilot nutritionist, especially the weigh-in and re-engagement messages (eating-disorder risk; see [Risks](#risks)).

## Cut line

If the schedule slips, drop these in order:

1. Actions on the notification (open the app on tap instead)
2. Re-engagement and missed weigh-in pushes
3. Dashboard analytics beyond the patient list's adherence column
4. Weekly summary screen (keep the notification, open Progreso)
5. Dashboard invite codes (our team keeps creating them)

Never cut: the meal-log model, the permission primer, the patient's off switch, the platform limits, lock-screen privacy, and audit entries on nutritionist reads.

## Risks

### 1. Scope for one developer (high)
Four streams in 6 weeks: check-off, onboarding and screens, notifications, and a dashboard that is still a skeleton. Mitigations: the decisions in week 1, the cut line, and a read-only dashboard first.

### 2. Notification fatigue (high)
Too many reminders make people turn them off or uninstall, and iOS only asks for permission once. Mitigations: the primer, per-category settings, platform caps, back-off, and measuring opt-outs (Phase 7).

### 3. Eating-disorder and wellbeing risk (medium)
Frequent "did you eat?" and weigh-in nudges can harm vulnerable patients, and plans still have no professional review in the app. Mitigations: supportive copy, the weigh-in limited to once a week, an easy off switch, nutritionist review of the copy, and the dashboard letting the nutritionist see who is struggling.

### 4. Push credentials per tenant (medium)
Each tenant's app needs its own APNs key and Firebase Android app from the nutritionist's accounts. Mitigation: add it to the store-account onboarding checklist and set it up for the test tenant in week 1.

### 5. Background actions and sign-in (medium)
Answering a notification without opening the app needs a valid token in the background. Mitigation: the Phase 3 spike, with "open on tap" as the fallback.

### 6. Store review (low, later)
App Store guideline 4.5.4: the app must work without push, and nothing promotional goes out without opt-in. The off switch and the primer cover it.

## Definition of MVP.2 done

- Every screen in the patient app follows a design (mockup or the new screen designs).
- A test patient onboards, sets meal times, chooses notifications, checks off a week of meals, gets reminders and a weekly weigh-in, and the Inicio streak and adherence are right.
- A test nutritionist signs in to the dashboard on `preproduction`, sees that patient's adherence and progress, and changes notification settings within the platform limits.
- The patient can turn any category off, and no notification shows health details on the lock screen.
- RLS and authorization tests pass for the new tables and the nutritionist routes.
