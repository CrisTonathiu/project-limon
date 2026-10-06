import type { ShoppingListSectionDto } from '@limon/types';
import { describe, expect, it } from 'vitest';
import { formatShoppingAmount, progress, withChecked } from './shopping-list-format';

describe('formatShoppingAmount', () => {
  it.each([
    ['PIECE', 1, '1 pieza'],
    ['PIECE', 4, '4 piezas'],
    ['G', 150, '150 g'],
    ['G', 1000, '1 kg'],
    ['G', 1100, '1.1 kg'],
    ['ML', 250, '250 ml'],
    ['ML', 1500, '1.5 l'],
  ] as const)('%s %s → %s', (unit, amount, text) => expect(formatShoppingAmount(unit, amount)).toBe(text));
});

describe('withChecked and progress', () => {
  const sections: ShoppingListSectionDto[] = [
    { category: 'PRODUCE', items: [{ foodId: 'a', name: 'Limón', unit: 'PIECE', amount: 2, checked: false }] },
    { category: 'GROCERY', items: [{ foodId: 'b', name: 'Arroz', unit: 'G', amount: 500, checked: true }] },
  ];

  it('changes only that item', () => {
    const next = withChecked(sections, 'a', true);
    expect(next[0]!.items[0]!.checked).toBe(true);
    expect(next[1]).toEqual(sections[1]);
    expect(progress(next)).toEqual({ checked: 2, total: 2 });
  });

  it('counts the checked items', () => expect(progress(sections)).toEqual({ checked: 1, total: 2 }));
});
