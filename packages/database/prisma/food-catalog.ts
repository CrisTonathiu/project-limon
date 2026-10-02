/**
 * Turns private/foods.csv rows into `foods` rows, for `admin foods`. Pure, so it can be tested.
 *
 * CSV columns used: key, name_es, shopping_category, fatsecret_food_id, fatsecret_serving_id,
 * match_status, smae_group, smae_net_grams (grams per equivalent), smae_edition, allergens
 * (@limon/types Allergen keys separated by ";", e.g. "milk;eggs"). The other columns
 * (search_term, smae_portion_*, notes) are for curation only.
 */
import { Allergen, ShoppingCategory, SmaeGroup } from '@limon/types';
import type { CsvRow } from './csv.js';

export type CatalogFood = {
  key: string;
  name: string;
  fatsecretFoodId: string;
  fatsecretServingId: string;
  smaeGroup: SmaeGroup | null;
  gramsPerEquivalent: number | null;
  shoppingCategory: ShoppingCategory;
  allergens: Allergen[];
};

/** The SMAE edition the roadmap targets; rows from another edition need checking against it. */
export const SMAE_EDITION = '5';

const SHOPPING_CATEGORIES: Record<string, ShoppingCategory> = {
  'frutas-verduras': ShoppingCategory.PRODUCE,
  'carnes-pescados': ShoppingCategory.MEAT_FISH,
  'lacteos-huevo': ShoppingCategory.DAIRY_EGGS,
  'panaderia-tortilleria': ShoppingCategory.BAKERY,
  abarrotes: ShoppingCategory.GROCERY,
  semillas: ShoppingCategory.NUTS_SEEDS,
};

/** SMAE group names as written in the book (and the CSV). */
const SMAE_GROUPS: Record<string, SmaeGroup> = {
  Verduras: SmaeGroup.VEGETABLES,
  Frutas: SmaeGroup.FRUITS,
  'Cereales sin grasa': SmaeGroup.CEREALS_FAT_FREE,
  'Cereales con grasa': SmaeGroup.CEREALS_WITH_FAT,
  Leguminosas: SmaeGroup.LEGUMES,
  'Alimentos de origen animal - muy bajo aporte de grasa': SmaeGroup.ANIMAL_VERY_LOW_FAT,
  'Alimentos de origen animal - bajo aporte de grasa': SmaeGroup.ANIMAL_LOW_FAT,
  'Alimentos de origen animal - moderado aporte de grasa': SmaeGroup.ANIMAL_MODERATE_FAT,
  'Alimentos de origen animal - alto aporte de grasa': SmaeGroup.ANIMAL_HIGH_FAT,
  'Leche descremada': SmaeGroup.MILK_SKIM,
  'Leche semidescremada': SmaeGroup.MILK_SEMI_SKIM,
  'Leche entera': SmaeGroup.MILK_WHOLE,
  'Leche con azúcar': SmaeGroup.MILK_WITH_SUGAR,
  'Aceites y grasas': SmaeGroup.FATS_WITHOUT_PROTEIN,
  'Aceites y grasas sin proteína': SmaeGroup.FATS_WITHOUT_PROTEIN,
  'Aceites y grasas con proteína': SmaeGroup.FATS_WITH_PROTEIN,
  'Azúcares sin grasa': SmaeGroup.SUGARS_FAT_FREE,
  'Azúcares con grasa': SmaeGroup.SUGARS_WITH_FAT,
  'Libres en energía': SmaeGroup.FREE_FOODS,
  'Bebidas alcohólicas': SmaeGroup.ALCOHOLIC_BEVERAGES,
};

const ALLERGENS = new Set<string>(Object.values(Allergen));

export type CatalogParseResult = {
  foods: CatalogFood[];
  /** Rows that can't be imported. Any error stops the whole import. */
  errors: string[];
  /** Keys of rows whose FatSecret match nobody has confirmed yet (match_status ≠ checked). */
  unchecked: string[];
  /** Keys of rows whose SMAE data comes from another edition than SMAE_EDITION. */
  otherSmaeEdition: string[];
};

export function parseCatalogRows(rows: CsvRow[]): CatalogParseResult {
  const result: CatalogParseResult = { foods: [], errors: [], unchecked: [], otherSmaeEdition: [] };
  const seen = new Set<string>();

  rows.forEach((row, i) => {
    const key = row.key?.trim() ?? '';
    const where = `row ${i + 2}${key ? ` (${key})` : ''}`; // +2: 1-based, after the header
    const fail = (message: string) => result.errors.push(`${where}: ${message}`);
    const before = result.errors.length;

    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(key)) fail('key must be lowercase words joined by "-"');
    else if (seen.has(key)) fail('duplicate key');
    seen.add(key);

    const name = row.name_es?.trim() ?? '';
    if (!name) fail('name_es is empty');

    const fatsecretFoodId = row.fatsecret_food_id?.trim() ?? '';
    const fatsecretServingId = row.fatsecret_serving_id?.trim() ?? '';
    if (!fatsecretFoodId || !fatsecretServingId) fail('no FatSecret food and serving ids (run `catalog suggest` or `catalog set`)');

    const shoppingCategory = SHOPPING_CATEGORIES[row.shopping_category?.trim() ?? ''];
    if (!shoppingCategory) fail(`unknown shopping_category "${row.shopping_category}" (${Object.keys(SHOPPING_CATEGORIES).join(', ')})`);

    const groupName = row.smae_group?.trim() ?? '';
    const smaeGroup = groupName ? SMAE_GROUPS[groupName] : null;
    if (smaeGroup === undefined) fail(`unknown smae_group "${groupName}"`);
    const gramsText = row.smae_net_grams?.trim() ?? '';
    const gramsPerEquivalent = gramsText ? Number(gramsText) : null;
    if (smaeGroup && !(gramsPerEquivalent && gramsPerEquivalent > 0)) fail('smae_group needs smae_net_grams > 0');
    if (!groupName && gramsText) fail('smae_net_grams without smae_group');

    const allergens = (row.allergens ?? '').split(';').map((a) => a.trim()).filter(Boolean);
    const unknown = allergens.filter((a) => !ALLERGENS.has(a));
    if (unknown.length) fail(`unknown allergen(s) ${unknown.join(', ')} (${[...ALLERGENS].join(', ')})`);

    if (result.errors.length > before) return;
    result.foods.push({
      key, name, fatsecretFoodId, fatsecretServingId, shoppingCategory: shoppingCategory!,
      smaeGroup: smaeGroup ?? null, gramsPerEquivalent: smaeGroup ? gramsPerEquivalent : null,
      allergens: [...new Set(allergens)] as Allergen[],
    });
    if (row.match_status?.trim() !== 'checked') result.unchecked.push(key);
    if (smaeGroup && row.smae_edition?.trim() !== SMAE_EDITION) result.otherSmaeEdition.push(key);
  });
  return result;
}
