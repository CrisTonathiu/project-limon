import { describe, expect, it } from 'vitest';
import { buildShoppingList, shoppableAmount, type ListIngredient } from '../../src/modules/shopping-list/shopping-list.js';

const food = (id: string, shoppingCategory: ListIngredient['food']['shoppingCategory']) => ({ id, name: id, shoppingCategory });
const egg = food('Huevo', 'DAIRY_EGGS');
const milk = food('Leche', 'DAIRY_EGGS');
const rice = food('Arroz', 'GROCERY');
const lime = food('Limón', 'PRODUCE');
const nopal = food('Nopal', 'PRODUCE');

describe('shoppableAmount', () => {
  it.each([
    ['PIECE', 2.0000001, 2],
    ['PIECE', 2.25, 3],
    ['PIECE', 0.25, 1],
    ['G', 3, 10],
    ['G', 92, 100],
    ['G', 101, 150],
    ['G', 1000, 1000],
    ['G', 1001, 1100],
    ['ML', 480, 500],
  ] as const)('%s %s → %s', (unit, amount, expected) => expect(shoppableAmount(unit, amount)).toBe(expected));
});

describe('buildShoppingList', () => {
  it('adds up each food over the week, by store section and name', () => {
    const sections = buildShoppingList(
      [
        { food: rice, grams: 45, quantity: 0.25, unit: 'CUP' },
        { food: egg, grams: 100, quantity: 2, unit: 'PIECE' },
        { food: nopal, grams: 120, quantity: 120, unit: 'G' },
        { food: rice, grams: 45, quantity: 45, unit: 'G' },
        { food: egg, grams: 75, quantity: 1.5, unit: 'PIECE' },
        { food: milk, grams: 240, quantity: 240, unit: 'ML' },
        { food: lime, grams: 30, quantity: 0.5, unit: 'PIECE' },
      ],
      new Map(),
    );
    expect(sections).toEqual([
      {
        category: 'PRODUCE',
        items: [
          { foodId: 'Limón', name: 'Limón', unit: 'PIECE', amount: 1, checked: false },
          { foodId: 'Nopal', name: 'Nopal', unit: 'G', amount: 150, checked: false },
        ],
      },
      {
        category: 'DAIRY_EGGS',
        items: [
          // 3.5 eggs → 4. Every use is in pieces.
          { foodId: 'Huevo', name: 'Huevo', unit: 'PIECE', amount: 4, checked: false },
          { foodId: 'Leche', name: 'Leche', unit: 'ML', amount: 250, checked: false },
        ],
      },
      // Mixed units (cup and grams): counted in grams.
      { category: 'GROCERY', items: [{ foodId: 'Arroz', name: 'Arroz', unit: 'G', amount: 90, checked: false }] },
    ]);
  });

  it('counts a swapped-in food in grams, since it has no household amount', () => {
    const [section] = buildShoppingList([{ food: egg, grams: 100, quantity: null, unit: null }], new Map());
    expect(section!.items[0]).toMatchObject({ unit: 'G', amount: 100 });
  });

  it('keeps an item checked only while the list asks for no more than was checked', () => {
    const list = (pieces: number) =>
      buildShoppingList([{ food: egg, grams: pieces * 50, quantity: pieces, unit: 'PIECE' }], new Map([['Huevo', { unit: 'PIECE' as const, amount: 4 }]]));
    expect(list(4)[0]!.items[0]!.checked).toBe(true);
    expect(list(3)[0]!.items[0]!.checked).toBe(true);
    expect(list(5)[0]!.items[0]!.checked).toBe(false);
  });
});
