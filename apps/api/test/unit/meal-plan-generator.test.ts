import { describe, expect, it } from 'vitest';
import { generateMealPlan, portionServings, type CandidateRecipe, type GeneratorInput } from '../../src/modules/meal-plans/meal-plan-generator.js';
import { splitDailyTarget } from '../../src/modules/meal-plans/meal-split.js';

const recipe = (id: string, mealTypes: CandidateRecipe['mealTypes'], kcal: number, proteinG: number, extra: Partial<CandidateRecipe> = {}): CandidateRecipe => ({
  id, mealTypes, foodIds: [], allergens: [], perServing: { kcal, proteinG }, ...extra,
});

/** Enough recipes per slot for a week without repeats inside the 3-day window, spread across kcal. */
const catalog: CandidateRecipe[] = [
  ...[320, 380, 410, 450, 500].map((k, i) => recipe(`breakfast-${i}`, ['BREAKFAST'], k, k / 20)),
  ...[480, 520, 560, 610, 650].map((k, i) => recipe(`lunch-${i}`, ['LUNCH'], k, k / 15)),
  ...[400, 430, 470, 520].map((k, i) => recipe(`dinner-${i}`, ['DINNER'], k, k / 16)),
  recipe('enchiladas', ['LUNCH', 'DINNER'], 550, 32),
  ...[120, 150, 180, 210].map((k, i) => recipe(`snack-${i}`, ['SNACK'], k, k / 25)),
];

const base: GeneratorInput = {
  target: { kcal: 2000, proteinG: 110 },
  mealsPerDay: 4,
  recipes: catalog,
  allergies: [],
  dislikedFoodIds: [],
  favouriteRecipeIds: [],
  seed: 'patient-1:2026-10-19',
};

const dayKcal = (day: ReturnType<typeof generateMealPlan>[number]) => day.reduce((sum, m) => sum + (m.recipeId ? m.kcal : 0), 0);

describe('splitDailyTarget', () => {
  it.each([3, 4, 5])('shares out the whole target for %i meals a day', (meals) => {
    const slots = splitDailyTarget({ kcal: 2000, proteinG: 100 }, meals);
    expect(slots).toHaveLength(meals);
    expect(slots.reduce((s, x) => s + x.kcal, 0)).toBeCloseTo(2000);
    expect(slots.reduce((s, x) => s + x.proteinG, 0)).toBeCloseTo(100);
  });

  it('uses the 25 / 35 / 10 / 30 split for 4 meals', () => {
    expect(splitDailyTarget({ kcal: 2000, proteinG: 100 }, 4).map((s) => [s.mealType, s.kcal])).toEqual([
      ['BREAKFAST', 500], ['LUNCH', 700], ['SNACK', 200], ['DINNER', 600],
    ]);
  });

  it('refuses a meal count outside 3–5', () => {
    expect(() => splitDailyTarget({ kcal: 2000, proteinG: 100 }, 6)).toThrow(RangeError);
  });
});

describe('portionServings', () => {
  it('scales to the slot in 0.05 steps', () => {
    expect(portionServings(500, 400)).toBe(1.25);
    expect(portionServings(700, 610)).toBe(1.15);
  });

  it('stays within 0.5–2.5 servings', () => {
    expect(portionServings(100, 600)).toBe(0.5);
    expect(portionServings(2000, 300)).toBe(2.5);
  });
});

describe('generateMealPlan', () => {
  it('fills 7 days, each meal and each day within ±10% of its target', () => {
    for (const meals of [3, 4, 5]) {
      const plan = generateMealPlan({ ...base, mealsPerDay: meals });
      const slots = splitDailyTarget(base.target, meals);
      expect(plan).toHaveLength(7);
      for (const day of plan) {
        expect(day.map((m) => m.mealType)).toEqual(slots.map((s) => s.mealType));
        day.forEach((m, i) => {
          if (!m.recipeId) throw new Error('unfilled slot');
          expect(Math.abs(m.kcal - slots[i]!.kcal) / slots[i]!.kcal).toBeLessThanOrEqual(0.1);
        });
        expect(Math.abs(dayKcal(day) - 2000) / 2000).toBeLessThanOrEqual(0.1);
      }
    }
  });

  it('only puts a recipe in a slot of one of its meal types', () => {
    const byId = new Map(catalog.map((r) => [r.id, r]));
    for (const m of generateMealPlan(base).flat()) {
      expect(m.recipeId && byId.get(m.recipeId)!.mealTypes).toContain(m.mealType);
    }
  });

  it('never repeats a recipe within 3 days when the catalog allows it', () => {
    const plan = generateMealPlan(base);
    plan.forEach((day, d) => {
      const window = plan.slice(Math.max(0, d - 2), d + 1).flat().map((m) => m.recipeId);
      expect(new Set(window).size).toBe(window.length);
    });
  });

  it('repeats rather than leaving a slot empty when the catalog is small', () => {
    const plan = generateMealPlan({ ...base, mealsPerDay: 3, recipes: [recipe('b', ['BREAKFAST'], 600, 30), recipe('l', ['LUNCH', 'DINNER'], 700, 40)] });
    expect(plan.flat().every((m) => m.recipeId !== null)).toBe(true);
  });

  it('leaves out recipes with a declared allergen or a disliked food', () => {
    const recipes = [
      ...catalog,
      recipe('shrimp', ['LUNCH', 'DINNER'], 600, 45, { allergens: ['crustaceans'] }),
      recipe('cilantro', ['LUNCH', 'DINNER'], 600, 45, { foodIds: ['food-cilantro'] }),
    ];
    const ids = generateMealPlan({ ...base, recipes, allergies: ['crustaceans'], dislikedFoodIds: ['food-cilantro'] })
      .flat()
      .map((m) => m.recipeId);
    expect(ids).not.toContain('shrimp');
    expect(ids).not.toContain('cilantro');
  });

  it('skips recipes without macros, and leaves a slot empty when nothing is left', () => {
    const plan = generateMealPlan({
      ...base,
      recipes: [...catalog.filter((r) => !r.mealTypes.includes('SNACK')), recipe('mystery-snack', ['SNACK'], 0, 0, { perServing: null })],
    });
    for (const day of plan) expect(day.find((m) => m.mealType === 'SNACK')).toEqual({ mealType: 'SNACK', recipeId: null });
  });

  it('prefers favourites among recipes that fit about as well', () => {
    const count = (plan: ReturnType<typeof generateMealPlan>) => plan.flat().filter((m) => m.recipeId === 'breakfast-3').length;
    expect(count(generateMealPlan({ ...base, favouriteRecipeIds: ['breakfast-3'] }))).toBeGreaterThan(count(generateMealPlan(base)));
  });

  it('gives the same plan for the same seed, and a different one for another week', () => {
    expect(generateMealPlan(base)).toEqual(generateMealPlan({ ...base, recipes: [...catalog].reverse() }));
    expect(generateMealPlan(base)).not.toEqual(generateMealPlan({ ...base, seed: 'patient-1:2026-10-26' }));
  });
});
