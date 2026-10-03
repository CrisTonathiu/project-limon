import type { Allergen, MealType } from '@limon/types';
import { splitDailyTarget, type SlotTarget } from './meal-split.js';

/**
 * Weekly meal plan generator v1: rule-based, no AI. Pure: the caller loads the tenant's
 * recipes with their macros (through the FatSecret cache) and the patient's profile, so
 * this is unit-tested directly.
 *
 * For each day × meal slot it picks one recipe:
 *   1. Hard filters: the slot's meal type, no allergen the patient declared, no disliked food.
 *      Recipes without macros are skipped too, since they can't be portioned.
 *   2. Portion: servings scaled so the meal's kcal lands on the slot's share of the target,
 *      in 0.05 steps and within sensible bounds.
 *   3. Score (lower is better): kcal and protein distance after scaling, a penalty for
 *      recipes eaten in the last 3 days, a boost for favourites, and a small seeded jitter
 *      so plans vary between patients and weeks but the same seed gives the same plan.
 */

export type CandidateRecipe = {
  id: string;
  mealTypes: MealType[];
  /** Catalog food ids of the ingredients. */
  foodIds: string[];
  /** Union of the ingredients' allergens. */
  allergens: string[];
  /** Null when FatSecret has no complete data for an ingredient. */
  perServing: { kcal: number; proteinG: number } | null;
};

type PortionableRecipe = CandidateRecipe & { perServing: NonNullable<CandidateRecipe['perServing']> };

export type GeneratorInput = {
  target: { kcal: number; proteinG: number };
  mealsPerDay: number;
  recipes: CandidateRecipe[];
  allergies: Allergen[];
  dislikedFoodIds: string[];
  favouriteRecipeIds: string[];
  /** Same seed, same plan, e.g. `${patientId}:${weekStart}`. */
  seed: string;
  days?: number;
};

export type PlannedMeal =
  | { mealType: MealType; recipeId: string; servings: number; kcal: number; proteinG: number }
  /** No recipe passed the hard filters for this slot. */
  | { mealType: MealType; recipeId: null };

export const GENERATOR_RULES = {
  days: 7,
  /** A recipe eaten on day d isn't offered again before day d + 3. */
  varietyWindowDays: 3,
  servings: { min: 0.5, max: 2.5, step: 0.05 },
} as const;

/** Score weights. Distances are relative (0.1 = 10% off the slot target). */
const WEIGHT = {
  protein: 0.5,
  /** Larger than any realistic distance, so a repeat is only picked when nothing else fits. */
  repeatSameDay: 4,
  repeatInWindow: 2,
  favourite: 0.1,
  jitter: 0.05,
};

export function generateMealPlan(input: GeneratorInput): PlannedMeal[][] {
  const slots = splitDailyTarget(input.target, input.mealsPerDay);
  const eligible = eligibleRecipes(input);
  const favourites = new Set(input.favouriteRecipeIds);
  const random = seededRandom(input.seed);
  /** Recipe id → last day it was planned. */
  const lastPlanned = new Map<string, number>();

  return Array.from({ length: input.days ?? GENERATOR_RULES.days }, (_, day) =>
    slots.map((slot): PlannedMeal => {
      let best: { recipe: PortionableRecipe; score: number } | null = null;
      for (const recipe of eligible) {
        if (!recipe.mealTypes.includes(slot.mealType)) continue;
        // Drawn for every candidate in a fixed order, so the sequence (and the plan) is reproducible.
        const score = scoreRecipe(recipe, slot, day, lastPlanned, favourites) + random() * WEIGHT.jitter;
        if (!best || score < best.score) best = { recipe, score };
      }
      if (!best) return { mealType: slot.mealType, recipeId: null };

      const { recipe } = best;
      lastPlanned.set(recipe.id, day);
      const servings = portionServings(slot.kcal, recipe.perServing.kcal);
      return {
        mealType: slot.mealType,
        recipeId: recipe.id,
        servings,
        kcal: Math.round(recipe.perServing.kcal * servings),
        proteinG: Math.round(recipe.perServing.proteinG * servings * 10) / 10,
      };
    }),
  );
}

/** Servings that bring a recipe closest to the slot's kcal, in steps and within bounds. */
export function portionServings(slotKcal: number, kcalPerServing: number): number {
  const { min, max, step } = GENERATOR_RULES.servings;
  const steps = Math.round(slotKcal / kcalPerServing / step);
  // Rounded through the step count so 0.05 multiples don't pick up float noise (1.1500000000000001).
  return Math.min(Math.max(Math.round(steps * step * 100) / 100, min), max);
}

function eligibleRecipes(input: GeneratorInput) {
  const allergies = new Set<string>(input.allergies);
  const disliked = new Set(input.dislikedFoodIds);
  return input.recipes
    .filter(
      (r): r is PortionableRecipe =>
        r.perServing !== null &&
        r.perServing.kcal > 0 &&
        !r.allergens.some((a) => allergies.has(a)) &&
        !r.foodIds.some((f) => disliked.has(f)),
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function scoreRecipe(
  recipe: PortionableRecipe,
  slot: SlotTarget,
  day: number,
  lastPlanned: ReadonlyMap<string, number>,
  favourites: ReadonlySet<string>,
): number {
  const servings = portionServings(slot.kcal, recipe.perServing.kcal);
  const kcalDistance = Math.abs(recipe.perServing.kcal * servings - slot.kcal) / slot.kcal;
  const proteinDistance = slot.proteinG > 0 ? Math.abs(recipe.perServing.proteinG * servings - slot.proteinG) / slot.proteinG : 0;

  let score = kcalDistance + WEIGHT.protein * proteinDistance;
  const last = lastPlanned.get(recipe.id);
  if (last === day) score += WEIGHT.repeatSameDay;
  else if (last !== undefined && day - last < GENERATOR_RULES.varietyWindowDays) score += WEIGHT.repeatInWindow;
  if (favourites.has(recipe.id)) score -= WEIGHT.favourite;
  return score;
}

/** mulberry32 seeded from an FNV-1a hash of the seed string. */
function seededRandom(seed: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
