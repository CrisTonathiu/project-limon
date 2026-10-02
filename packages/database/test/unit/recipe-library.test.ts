import { describe, expect, it } from 'vitest';
import { parseLibraryRows } from '../../prisma/recipe-library.js';

const recipe = (over: Record<string, string> = {}) => ({
  key: 'molletes', title: 'Molletes', description: 'Con pico de gallo', meal_types: 'desayuno;cena',
  servings: '2', total_minutes: '15', tags: 'mexicana; vegetariana', steps: 'Untar los frijoles.\nGratinar.\n', image_key: '', notes: '',
  ...over,
});
const ingredient = (over: Record<string, string> = {}) => ({
  recipe_key: 'molletes', food_key: 'bolillo', quantity: '2', unit: 'pieza', grams: '120', note: '',
  ...over,
});
const foods = new Set(['bolillo', 'frijol', 'queso-panela']);

describe('parseLibraryRows', () => {
  it('maps a recipe and its ingredients, in row order', () => {
    const r = parseLibraryRows([recipe()], [
      ingredient(),
      ingredient({ food_key: 'frijol', quantity: '100', unit: 'g', grams: '' }),
      ingredient({ food_key: 'queso-panela', quantity: '0.5', unit: 'Taza', grams: '60', note: 'rallado' }),
    ], foods);
    expect(r.errors).toEqual([]);
    expect(r.recipes).toEqual([{
      key: 'molletes', title: 'Molletes', description: 'Con pico de gallo', mealTypes: ['BREAKFAST', 'DINNER'],
      servings: 2, totalMinutes: 15, tags: ['mexicana', 'vegetariana'], steps: ['Untar los frijoles.', 'Gratinar.'], imageKey: null,
      ingredients: [
        { foodKey: 'bolillo', position: 1, quantity: 2, unit: 'PIECE', grams: 120, note: null },
        { foodKey: 'frijol', position: 2, quantity: 100, unit: 'G', grams: 100, note: null },
        { foodKey: 'queso-panela', position: 3, quantity: 0.5, unit: 'CUP', grams: 60, note: 'rallado' },
      ],
    }]);
  });

  it('accepts colación with or without the accent, and optional fields left empty', () => {
    const r = parseLibraryRows(
      [recipe({ key: 'a', meal_types: 'Colación', description: '', total_minutes: '', tags: '' }), recipe({ key: 'b', meal_types: 'colacion;colación' })],
      [ingredient({ recipe_key: 'a' }), ingredient({ recipe_key: 'b' })],
      foods,
    );
    expect(r.errors).toEqual([]);
    expect(r.recipes[0]).toMatchObject({ mealTypes: ['SNACK'], description: null, totalMinutes: null, tags: [] });
    expect(r.recipes[1]!.mealTypes).toEqual(['SNACK']);
  });

  it('reports every invalid row and imports nothing', () => {
    const r = parseLibraryRows(
      [
        recipe({ key: 'Molletes' }),
        recipe({ key: 'a', meal_types: 'almuerzo', servings: '0' }),
        recipe({ key: 'b', title: '', total_minutes: '1.5', steps: ' ' }),
        recipe({ key: 'c' }),
        recipe({ key: 'c' }),
        recipe({ key: 'sin-ingredientes' }),
      ],
      [
        ingredient({ recipe_key: 'a' }), // recipe already reported, not repeated
        ingredient({ recipe_key: 'c', food_key: 'chorizo' }),
        ingredient({ recipe_key: 'c', unit: 'kg', quantity: '-1' }),
        ingredient({ recipe_key: 'c', unit: 'ml', grams: '' }),
        ingredient({ recipe_key: 'otra' }),
      ],
      foods,
    );
    expect(r.recipes).toEqual([]);
    expect(r.errors).toEqual([
      'recipes.csv row 2 (Molletes): key must be lowercase words joined by "-"',
      'recipes.csv row 3 (a): unknown meal type(s) almuerzo (desayuno, comida, cena, colacion)',
      'recipes.csv row 3 (a): servings must be a whole number above 0',
      'recipes.csv row 4 (b): title is empty',
      'recipes.csv row 4 (b): total_minutes must be a whole number above 0, or empty',
      'recipes.csv row 4 (b): steps is empty (one step per line)',
      'recipes.csv row 6 (c): duplicate key',
      'recipe-ingredients.csv row 3 (c → chorizo): food_key is not in the food catalog (load it with `admin foods`)',
      'recipe-ingredients.csv row 4 (c → bolillo): quantity must be a number above 0',
      'recipe-ingredients.csv row 4 (c → bolillo): unknown unit "kg" (g, ml, pieza, taza, cda, cdita)',
      'recipe-ingredients.csv row 5 (c → bolillo): grams must be a number above 0 (required unless the unit is g)',
      'recipe-ingredients.csv row 6 (otra → bolillo): recipe_key is not in recipes.csv',
      'recipes.csv (sin-ingredientes): no ingredients in recipe-ingredients.csv',
    ]);
  });
});
