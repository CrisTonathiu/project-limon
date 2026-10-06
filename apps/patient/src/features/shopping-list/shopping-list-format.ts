import type { ShoppingListSectionDto, ShoppingUnit } from '@limon/types';
import { t } from '../../i18n/es-MX';
import { formatNumber } from '../../i18n/format';

/** 4 PIECE → "4 piezas", 150 G → "150 g", 1100 G → "1.1 kg", 1500 ML → "1.5 l". */
export function formatShoppingAmount(unit: ShoppingUnit, amount: number): string {
  if (unit === 'PIECE')
    return `${formatNumber(amount)} ${amount === 1 ? t.recipes.units.PIECE[0] : t.recipes.units.PIECE[1]}`;
  if (amount >= 1000) return `${formatNumber(amount / 1000, 1)} ${unit === 'G' ? 'kg' : 'l'}`;
  return `${formatNumber(amount)} ${unit === 'G' ? 'g' : 'ml'}`;
}

/** The list with one item's check changed (for the optimistic toggle). */
export function withChecked(
  sections: ShoppingListSectionDto[],
  foodId: string,
  checked: boolean,
): ShoppingListSectionDto[] {
  return sections.map((s) => ({
    ...s,
    items: s.items.map((i) => (i.foodId === foodId ? { ...i, checked } : i)),
  }));
}

/** How many items are checked, out of all of them. */
export function progress(sections: ShoppingListSectionDto[]): { checked: number; total: number } {
  const items = sections.flatMap((s) => s.items);
  return { checked: items.filter((i) => i.checked).length, total: items.length };
}
