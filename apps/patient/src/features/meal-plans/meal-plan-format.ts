import { t } from '../../i18n/es-MX';
import { LOCALE, parseDateOnly } from '../../i18n/format';
import { formatQuantity } from '../recipes/recipe-format';

/** The day shown first: today when it's in the plan's week, otherwise its Monday. */
export function initialDayIndex(dates: string[], today: string): number {
  return Math.max(dates.indexOf(today), 0);
}

/** Only today and later days can get new recipes; the API refuses past days too. */
export const canRegenerate = (date: string, today: string) => date >= today;

/** 1 → "1 porción", 1.25 → "1 ¼ porciones", 0.5 → "½ porción". */
export function formatPortion(servings: number): string {
  return t.meals.portion(formatQuantity(servings), servings > 1 ? t.recipes.servingOther : t.recipes.servingOne);
}

const weekday = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' });

/** For the week strip: { weekday: "lun", day: "5" }. */
export function dayChip(date: string): { weekday: string; day: string } {
  const d = parseDateOnly(date);
  return { weekday: weekday.format(d).replace('.', ''), day: String(d.getDate()) };
}
