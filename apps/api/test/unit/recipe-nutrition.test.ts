import type { FoodDetail, Nutrients } from '@limon/types';
import { describe, expect, it } from 'vitest';
import { macrosPerServing } from '../../src/modules/recipes/recipe-nutrition.js';

const nutrients = (n: Partial<Nutrients>): Nutrients => ({
  calories: null, carbohydrate: null, protein: null, fat: null, saturatedFat: null, polyunsaturatedFat: null,
  monounsaturatedFat: null, transFat: null, cholesterol: null, sodium: null, potassium: null, fiber: null,
  sugar: null, addedSugars: null, vitaminA: null, vitaminC: null, vitaminD: null, calcium: null, iron: null, ...n,
});
const food = (id: string, metricAmount: number | null, metricUnit: string | null, n: Partial<Nutrients>): FoodDetail => ({
  fatsecretFoodId: id, name: id, type: 'Generic', brand: null,
  servings: [
    { fatsecretServingId: 'other', description: '1 cup', metricAmount: 240, metricUnit: 'g', numberOfUnits: 1, measurementDescription: 'cup', isDefault: false, nutrients: nutrients({}) },
    { fatsecretServingId: 's1', description: '', metricAmount, metricUnit, numberOfUnits: 1, measurementDescription: null, isDefault: true, nutrients: nutrients(n) },
  ],
});

// Egg: 100 g → 143 kcal, 12.6 P, 0.7 C, 9.5 F. Tortilla: 26 g → 57 kcal, 1.5 P, 11.6 C, 0.7 F. Milk per 240 ml.
const foods = new Map([
  ['egg', food('egg', 100, 'g', { calories: 143, protein: 12.6, carbohydrate: 0.7, fat: 9.5 })],
  ['tortilla', food('tortilla', 26, 'g', { calories: 57, protein: 1.5, carbohydrate: 11.6, fat: 0.7 })],
  ['milk', food('milk', 240, 'ml', { calories: 122, protein: 8, carbohydrate: 11.7, fat: 4.8 })],
]);

describe('macrosPerServing', () => {
  it('scales each ingredient by its grams and divides by the servings', () => {
    const r = macrosPerServing(
      [
        { grams: 200, fatsecretFoodId: 'egg', fatsecretServingId: 's1' }, // 2 × egg serving
        { grams: 104, fatsecretFoodId: 'tortilla', fatsecretServingId: 's1' }, // 4 × tortilla serving
      ],
      2,
      foods,
    );
    // Total: 286 + 228 kcal, 25.2 + 6 P, 1.4 + 46.4 C, 19 + 2.8 F → halved.
    expect(r).toEqual({ calories: 257, protein: 15.6, carbohydrate: 23.9, fat: 10.9 });
  });

  it('counts ml servings as 1 g per ml', () => {
    expect(macrosPerServing([{ grams: 120, fatsecretFoodId: 'milk', fatsecretServingId: 's1' }], 1, foods)).toEqual({
      calories: 61, protein: 4, carbohydrate: 5.9, fat: 2.4,
    });
  });

  it.each([
    ['a food FatSecret didn’t return', { grams: 10, fatsecretFoodId: 'missing', fatsecretServingId: 's1' }, foods],
    ['a serving that no longer exists', { grams: 10, fatsecretFoodId: 'egg', fatsecretServingId: 'gone' }, foods],
    ['a serving without a metric size', { grams: 10, fatsecretFoodId: 'x', fatsecretServingId: 's1' }, new Map([['x', food('x', null, null, { calories: 1, protein: 1, carbohydrate: 1, fat: 1 })]])],
    ['a serving measured in oz', { grams: 10, fatsecretFoodId: 'x', fatsecretServingId: 's1' }, new Map([['x', food('x', 1, 'oz', { calories: 1, protein: 1, carbohydrate: 1, fat: 1 })]])],
    ['a missing macro', { grams: 10, fatsecretFoodId: 'x', fatsecretServingId: 's1' }, new Map([['x', food('x', 100, 'g', { calories: 1, protein: 1, carbohydrate: 1 })]])],
  ])('is unknown with %s, rather than undercounting', (_case, ingredient, map) => {
    expect(macrosPerServing([{ grams: 100, fatsecretFoodId: 'egg', fatsecretServingId: 's1' }, ingredient], 1, map)).toBeNull();
  });

  it('is unknown for a recipe without ingredients', () => {
    expect(macrosPerServing([], 2, foods)).toBeNull();
  });
});
