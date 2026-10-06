import type { IngredientUnit } from '@limon/types';
import { t } from '../../i18n/es-MX';
import { formatNumber } from '../../i18n/format';

/** Fractions people write in Mexican recipes. Anything else falls back to decimals. */
const FRACTIONS: [number, string][] = [
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [1 / 2, '½'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
];

/** 0.5 → "½", 1.25 → "1 ¼", 2 → "2", 0.15 → "0.15". */
export function formatQuantity(quantity: number): string {
  const whole = Math.floor(quantity);
  const rest = quantity - whole;
  if (rest < 0.01) return formatNumber(whole);
  const fraction = FRACTIONS.find(([value]) => Math.abs(rest - value) < 0.01)?.[1];
  if (!fraction) return formatNumber(quantity, 2);
  return whole ? `${formatNumber(whole)} ${fraction}` : fraction;
}

/** "2 piezas", "½ taza", "100 g". Singular up to 1 ("1 pieza", "½ pieza"). */
export function formatAmount(quantity: number, unit: IngredientUnit): string {
  const [one, other] = t.recipes.units[unit];
  return `${formatQuantity(quantity)} ${quantity > 1 ? other : one}`;
}

/** 15 → "15 min", 90 → "1 h 30 min", 120 → "2 h". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
