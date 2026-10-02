import { describe, expect, it } from 'vitest';
import { parseCatalogRows } from '../../prisma/food-catalog.js';

const row = (over: Record<string, string> = {}) => ({
  key: 'queso-panela', name_es: 'Queso panela', search_term: 'panela cheese', shopping_category: 'lacteos-huevo',
  fatsecret_food_id: '427800', fatsecret_serving_id: '457255', match_status: 'checked',
  smae_group: 'Alimentos de origen animal - bajo aporte de grasa', smae_portion_amount: '40', smae_portion_unit: 'g',
  smae_net_grams: '40', smae_edition: '5', notes: '', allergens: 'milk',
  ...over,
});

describe('parseCatalogRows', () => {
  it('maps a curated row to a food', () => {
    const r = parseCatalogRows([row()]);
    expect(r.errors).toEqual([]);
    expect(r.foods).toEqual([{
      key: 'queso-panela', name: 'Queso panela', fatsecretFoodId: '427800', fatsecretServingId: '457255',
      smaeGroup: 'ANIMAL_LOW_FAT', gramsPerEquivalent: 40, shoppingCategory: 'DAIRY_EGGS', allergens: ['milk'],
    }]);
    expect(r.unchecked).toEqual([]);
    expect(r.otherSmaeEdition).toEqual([]);
  });

  it('accepts foods SMAE does not list, without equivalents', () => {
    const r = parseCatalogRows([row({ key: 'ajo', smae_group: '', smae_net_grams: '', smae_edition: '', allergens: '' })]);
    expect(r.foods[0]).toMatchObject({ smaeGroup: null, gramsPerEquivalent: null, allergens: [] });
    expect(r.otherSmaeEdition).toEqual([]);
  });

  it('flags unconfirmed matches and other SMAE editions without rejecting them', () => {
    const r = parseCatalogRows([row({ match_status: 'auto', smae_edition: '4' })]);
    expect(r.foods).toHaveLength(1);
    expect(r.unchecked).toEqual(['queso-panela']);
    expect(r.otherSmaeEdition).toEqual(['queso-panela']);
  });

  it('splits allergens on ";" and drops duplicates', () => {
    expect(parseCatalogRows([row({ allergens: 'milk; eggs;milk' })]).foods[0]!.allergens).toEqual(['milk', 'eggs']);
  });

  it('reports every invalid row and imports nothing from them', () => {
    const r = parseCatalogRows([
      row({ key: 'Queso Panela' }),
      row({ shopping_category: 'carnes' }),
      row({ key: 'b', smae_group: 'Verduritas' }),
      row({ key: 'c', smae_net_grams: '' }),
      row({ key: 'd', fatsecret_serving_id: '' }),
      row({ key: 'e', allergens: 'milk;nuts' }),
      row({ key: 'f', smae_group: '' }),
      row({ key: 'b' }),
    ]);
    expect(r.foods).toEqual([]);
    expect(r.errors).toEqual([
      'row 2 (Queso Panela): key must be lowercase words joined by "-"',
      'row 3 (queso-panela): unknown shopping_category "carnes" (frutas-verduras, carnes-pescados, lacteos-huevo, panaderia-tortilleria, abarrotes, semillas)',
      'row 4 (b): unknown smae_group "Verduritas"',
      'row 5 (c): smae_group needs smae_net_grams > 0',
      'row 6 (d): no FatSecret food and serving ids (run `catalog suggest` or `catalog set`)',
      'row 7 (e): unknown allergen(s) nuts (gluten, crustaceans, eggs, fish, peanuts, soy, milk, tree_nuts, sulfites)',
      'row 8 (f): smae_net_grams without smae_group',
      'row 9 (b): duplicate key',
    ]);
  });
});
