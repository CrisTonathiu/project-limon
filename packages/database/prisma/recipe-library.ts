/**
 * Turns private/recipes.csv and private/recipe-ingredients.csv rows into default recipes,
 * for `admin default-recipes`. Pure, so it can be tested.
 *
 * recipes.csv columns: key, title, description, meal_types (desayuno, comida, cena, colacion,
 * separated by ";"), servings, total_minutes, tags (separated by ";"), steps (one step per line
 * inside the cell), image_key. Other columns (e.g. notes) are for curation only.
 *
 * recipe-ingredients.csv columns: recipe_key, food_key (a key from foods.csv), quantity,
 * unit (g, ml, pieza, taza, cda, cdita), grams (for the whole recipe; may be left empty when
 * the unit is g), note. Ingredients keep the order of their rows.
 */
import { IngredientUnit, MealType } from '@limon/types';
import type { CsvRow } from './csv.js';

export type LibraryIngredient = {
  foodKey: string;
  position: number;
  quantity: number;
  unit: IngredientUnit;
  grams: number;
  note: string | null;
};

export type LibraryRecipe = {
  key: string;
  title: string;
  description: string | null;
  mealTypes: MealType[];
  servings: number;
  totalMinutes: number | null;
  tags: string[];
  steps: string[];
  imageKey: string | null;
  ingredients: LibraryIngredient[];
};

const MEAL_TYPES: Record<string, MealType> = {
  desayuno: MealType.BREAKFAST,
  comida: MealType.LUNCH,
  cena: MealType.DINNER,
  colacion: MealType.SNACK,
  'colación': MealType.SNACK,
};

const UNITS: Record<string, IngredientUnit> = {
  g: IngredientUnit.G,
  ml: IngredientUnit.ML,
  pieza: IngredientUnit.PIECE,
  taza: IngredientUnit.CUP,
  cda: IngredientUnit.TBSP,
  cdita: IngredientUnit.TSP,
};

export type LibraryParseResult = {
  recipes: LibraryRecipe[];
  /** Rows that can't be imported. Any error stops the whole import. */
  errors: string[];
};

const list = (text: string | undefined, separator: string | RegExp) =>
  (text ?? '').split(separator).map((s) => s.trim()).filter(Boolean);
const positiveInt = (text: string) => /^\d+$/.test(text) && Number(text) > 0;
const positiveNumber = (text: string) => text !== '' && Number.isFinite(Number(text)) && Number(text) > 0;

/** `foodKeys`: the keys in the `foods` table, which ingredients must refer to. */
export function parseLibraryRows(recipeRows: CsvRow[], ingredientRows: CsvRow[], foodKeys: ReadonlySet<string>): LibraryParseResult {
  const result: LibraryParseResult = { recipes: [], errors: [] };
  const recipes = new Map<string, LibraryRecipe>();

  recipeRows.forEach((row, i) => {
    const key = row.key?.trim() ?? '';
    const where = `recipes.csv row ${i + 2}${key ? ` (${key})` : ''}`; // +2: 1-based, after the header
    const fail = (message: string) => result.errors.push(`${where}: ${message}`);
    const before = result.errors.length;

    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(key)) fail('key must be lowercase words joined by "-"');
    else if (recipes.has(key)) fail('duplicate key');

    const title = row.title?.trim() ?? '';
    if (!title) fail('title is empty');

    const mealNames = list(row.meal_types?.toLowerCase(), ';');
    const unknownMeals = mealNames.filter((m) => !MEAL_TYPES[m]);
    if (!mealNames.length) fail('meal_types is empty');
    if (unknownMeals.length) fail(`unknown meal type(s) ${unknownMeals.join(', ')} (desayuno, comida, cena, colacion)`);

    const servings = row.servings?.trim() ?? '';
    if (!positiveInt(servings)) fail('servings must be a whole number above 0');
    const minutes = row.total_minutes?.trim() ?? '';
    if (minutes && !positiveInt(minutes)) fail('total_minutes must be a whole number above 0, or empty');

    const steps = list(row.steps, /\r?\n/);
    if (!steps.length) fail('steps is empty (one step per line)');

    if (result.errors.length > before) return;
    recipes.set(key, {
      key, title,
      description: row.description?.trim() || null,
      mealTypes: [...new Set(mealNames.map((m) => MEAL_TYPES[m]!))],
      servings: Number(servings),
      totalMinutes: minutes ? Number(minutes) : null,
      tags: [...new Set(list(row.tags, ';'))],
      steps,
      imageKey: row.image_key?.trim() || null,
      ingredients: [],
    });
  });

  // Ingredients of a recipe that failed above aren't checked: the recipe is already reported.
  const invalidRecipes = new Set(recipeRows.map((r) => r.key?.trim() ?? '').filter((k) => k && !recipes.has(k)));
  const withIngredientErrors = new Set<string>();
  ingredientRows.forEach((row, i) => {
    const recipeKey = row.recipe_key?.trim() ?? '';
    const foodKey = row.food_key?.trim() ?? '';
    const where = `recipe-ingredients.csv row ${i + 2}${recipeKey ? ` (${recipeKey}${foodKey ? ` → ${foodKey}` : ''})` : ''}`;
    const fail = (message: string) => result.errors.push(`${where}: ${message}`);
    const before = result.errors.length;

    const recipe = recipes.get(recipeKey);
    if (!recipe) {
      if (!invalidRecipes.has(recipeKey)) fail(recipeKey ? 'recipe_key is not in recipes.csv' : 'recipe_key is empty');
      return;
    }
    if (!foodKeys.has(foodKey)) fail(foodKey ? 'food_key is not in the food catalog (load it with `admin foods`)' : 'food_key is empty');

    const quantity = row.quantity?.trim() ?? '';
    if (!positiveNumber(quantity)) fail('quantity must be a number above 0');
    const unit = UNITS[row.unit?.trim().toLowerCase() ?? ''];
    if (!unit) fail(`unknown unit "${row.unit ?? ''}" (${Object.keys(UNITS).join(', ')})`);
    // Grams can only be inferred when the quantity is already in grams.
    const gramsText = row.grams?.trim() || (unit === IngredientUnit.G ? quantity : '');
    if (!positiveNumber(gramsText)) fail('grams must be a number above 0 (required unless the unit is g)');

    if (result.errors.length > before) return void withIngredientErrors.add(recipeKey);
    recipe.ingredients.push({
      foodKey, position: recipe.ingredients.length + 1, quantity: Number(quantity), unit: unit!,
      grams: Number(gramsText), note: row.note?.trim() || null,
    });
  });

  for (const recipe of recipes.values()) {
    if (!recipe.ingredients.length && !withIngredientErrors.has(recipe.key)) result.errors.push(`recipes.csv (${recipe.key}): no ingredients in recipe-ingredients.csv`);
  }
  if (!result.errors.length) result.recipes = [...recipes.values()];
  return result;
}
