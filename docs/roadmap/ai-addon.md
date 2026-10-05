# AI Add-on (`ai_assistant`)

**Window:** Q2 2027 (Apr – Jun) · **Status:** planned · **Feature flag:** `ai_assistant` (already in `FeatureKey`; the patient app's `AiChat` screen is behind it)

## Goal

Serve each patient the weekly meals they're most likely to enjoy and stick to, without
breaking the nutrition rules. The MVP generator is rule-based: it picks recipes by fit to the
slot's calories and protein, variety and a fixed boost for favourites. The add-on learns
what each patient likes and uses that to choose among the recipes that already fit.

## Scope

| Part | What it does | Priority |
|---|---|---|
| **Preference-aware generation** | Learn each patient's taste from their feedback and rank recipes with it | Core. Everything below is secondary |
| Patient assistant | Recipe questions, swap suggestions, "why this meal?" in the `AiChat` screen | Second |
| Nutritionist plan drafting | Draft a week for the nutritionist to review in the dashboard (needs the dashboard, Jan – Feb 2027) | Third |
| Usage-metered billing | Charge tenants for the add-on by usage | With whichever part ships first |

## How preferences reach the plan

Preferences are a ranking signal, never a constraint. The generator keeps its hard rules:

1. Allergies and disliked foods remove recipes (unchanged).
2. Portions keep each meal within ±10 % of its slot target, and the guardrails hold (unchanged).
3. **Among the recipes that pass 1 and 2**, the preference score replaces today's fixed
   favourite boost (`WEIGHT.favourite` in `meal-plan-generator.ts`), next to the existing fit and variety terms.

This keeps the add-on safe to turn off: with the flag off, the generator falls back to the
rule-based score.

## Data we collect today

| Signal | Where | Notes |
|---|---|---|
| ♥ Favourite (positive) | `meal_feedback`, `rating = 1`, per patient × recipe × week | Live since the favourites endpoint (`PUT /meal-plans/favourites/:recipeId`) |
| What was served | `meal_plans` + `meal_plan_meals` | One plan per week is kept. Regenerating a day **overwrites** that day's rows |
| Patient context | `patient_profiles`, `patient_disliked_foods` | Sex, age, activity, meals per day, allergies, dislikes, energy target |
| Recipe features | `recipes`, `recipe_ingredients`, `foods` | Meal types, ingredients (grams), SMAE group per food, tags, time. Macros come from FatSecret and may not be stored, so features use grams and SMAE groups, not nutrient values |

## Data gaps to close before the pilot

The model can only learn from history we have, so these should land **before the MVP pilot
starts** (late Nov 2026), not in Q2 2027. Each is small.

1. **Keep un-♥ as a signal.** Today `DELETE /meal-plans/favourites/:recipeId` deletes the
   rows. Set `rating = 0` instead (the column allows −1..1 and the generator only boosts `1`).
2. **Record recipes rejected by "Cambiar el menú de este día".** The day's previous recipes
   are thrown away. Write them to `meal_feedback` as `rating = -1` (or a separate event
   table if we want to tell "regenerated" from an explicit dislike later).
3. **Keep a history of what was served.** Regenerating a day replaces `meal_plan_meals`, so
   "served but not liked" is lost for those days. Either stop deleting the old rows (mark
   them replaced) or log served meals separately.

Optional, if cheap: whether the patient opened the recipe from the plan (a weak positive).

## Approach

Start simple and only add complexity once there's data to justify it. At pilot scale
(≈ 10–50 patients per tenant), there won't be enough data to train a large model.

1. **Per-patient content model.** Score a recipe by how close its features (ingredients,
   SMAE groups, meal type, tags) are to the recipes the patient ♥ and away from the ones they
   rejected. Cheap, explainable ("because you liked …") and works from a patient's first likes.
2. **Collaborative signal**, once there are enough patients: "patients who liked X also
   liked Y". Decide first whether it learns within a tenant only or across tenants (see
   [Privacy](#privacy-and-legal)).
3. **Measure before switching:** compare favourite rate and regenerate rate between the rule
   based score and the preference score (A/B per patient, behind the flag).

The patient assistant and plan drafting use an LLM (Claude) over the tenant's recipes and the
patient's plan. They don't need trained models.

## Privacy and legal

- Feedback is linked to health data (the profile). Using it to train models must be stated
  in the **aviso de privacidad** (week 8 of the MVP). Add it now so pilot data can be used later.
- Account deletion erases `meal_feedback` (this must stay). Models must not keep
  per-patient data after deletion: recompute per-patient scores from the tables instead of
  storing them in a model, and only keep aggregate, non-identifying weights.
- Learning across tenants needs a decision: each nutritionist's patients are their clients.
  Default to per-tenant until the terms with nutritionists allow pooling.

## Open questions

- Is a ♥ per recipe enough, or do patients need an explicit "don't show me this again" (−1)?
- Cross-tenant learning: allowed by the nutritionist terms or not?
- Pricing: flat add-on or metered (LLM calls)? See [Tenant pricing options](mvp-roadmap.md#tenant-pricing-options).
- Does a nutritionist see and override what the model learned about a patient (dashboard)?

## Before Q2 2027

- [ ] Data gaps 1–3 above, before the pilot.
- [ ] Training use of feedback mentioned in the aviso de privacidad (MVP week 8).
- [ ] Decide cross-tenant learning in the nutritionist terms.
- [ ] Nutritionist dashboard shipped (needed for plan drafting and overrides).
