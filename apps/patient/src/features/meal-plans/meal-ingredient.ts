import type { PlannedMealIngredientDto } from '@limon/types';
import { formatGrams } from '../../i18n/format';
import { formatAmount } from '../recipes/recipe-format';

/**
 * One ingredient of the patient's portion as a name and an amount, for a two-line row:
 * { name: "Queso panela, en tiras", amount: "101 ¼ g" }, { name: "Chile poblano", amount: "2.7 piezas (324 g)" }.
 * A swapped ingredient only has grams: the recipe's household amount was for its own food.
 */
export function mealIngredientParts(i: PlannedMealIngredientDto): { name: string; amount: string } {
  const grams = formatGrams(i.grams);
  const household =
    i.quantity !== null && i.unit && !i.swappedFrom ? formatAmount(i.quantity, i.unit) : null;
  const amount = !household ? grams : i.unit === 'G' ? household : `${household} (${grams})`;
  return { name: i.note ? `${i.name}, ${i.note}` : i.name, amount };
}
