import type { MealPlanDto, PlannedMealIngredientDto } from '@limon/types';
import { t } from '../../i18n/es-MX';
import { formatGrams, LOCALE, parseDateOnly } from '../../i18n/format';
import { formatAmount, formatQuantity } from '../recipes/recipe-format';

/** The day shown first: today when it's in the plan's week, otherwise its Monday. */
export function initialDayIndex(dates: string[], today: string): number {
  return Math.max(dates.indexOf(today), 0);
}

/** Only today and later days can get new recipes; the API refuses past days too. */
export const canRegenerate = (date: string, today: string) => date >= today;

/** 1 → "1 porción", 1.25 → "1 ¼ porciones", 0.5 → "½ porción". */
export function formatPortion(servings: number): string {
  return t.meals.portion(
    formatQuantity(servings),
    servings > 1 ? t.recipes.servingOther : t.recipes.servingOne,
  );
}

const weekday = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' });

/** For the week strip: { weekday: "lun", day: "5" }. */
export function dayChip(date: string): { weekday: string; day: string } {
  const d = parseDateOnly(date);
  return { weekday: weekday.format(d).replace('.', ''), day: String(d.getDate()) };
}

/** ♥ belongs to the recipe, so every meal of the week with that recipe follows it. */
export function withFavourite(
  plan: MealPlanDto,
  recipeId: string,
  favourite: boolean,
): MealPlanDto {
  return {
    ...plan,
    days: plan.days.map((day) => ({
      ...day,
      meals: day.meals.map((m) => (m.recipe?.id === recipeId ? { ...m, favourite } : m)),
    })),
  };
}

/**
 * One ingredient of the patient's portion: "½ taza Pulque (150 g), frío", "150 g Arroz".
 * A swapped ingredient only has grams ("100 g Cerveza"): the recipe's household amount was for its own food.
 */
export function formatMealIngredient(i: PlannedMealIngredientDto): string {
  const grams = formatGrams(i.grams);
  const amount =
    i.quantity !== null && i.unit && !i.swappedFrom ? formatAmount(i.quantity, i.unit) : null;
  const name = !amount
    ? `${grams} ${i.name}`
    : i.unit === 'G'
      ? `${amount} ${i.name}`
      : `${amount} ${i.name} (${grams})`;
  return i.note ? `${name}, ${i.note}` : name;
}
