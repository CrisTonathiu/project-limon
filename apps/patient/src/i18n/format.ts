/**
 * Locale-aware formatting for numbers, measurements and dates. Use these instead of
 * toString()/toFixed() or hand-built dates so everything reads naturally in es-MX
 * ("1,250 kcal", "lunes, 5 de octubre").
 *
 * Hermes ships Intl.NumberFormat, DateTimeFormat and Collator, but NOT PluralRules,
 * RelativeTimeFormat or ListFormat, so plurals are handled by hand below.
 */
export const LOCALE = 'es-MX';

const numberFormats = new Map<number, Intl.NumberFormat>();

/** 1250 → "1,250"; 72.456 → "72.5" (up to `maxDecimals`, trailing zeros dropped). */
export function formatNumber(value: number, maxDecimals = 0): string {
  let nf = numberFormats.get(maxDecimals);
  if (!nf) {
    nf = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: maxDecimals });
    numberFormats.set(maxDecimals, nf);
  }
  return nf.format(value);
}

// Built by hand rather than with style: 'unit', whose support in Hermes is incomplete.
export const formatKcal = (kcal: number) => `${formatNumber(kcal)} kcal`;
export const formatGrams = (g: number) => `${formatNumber(g)} g`;
export const formatKg = (kg: number) => `${formatNumber(kg, 1)} kg`;
export const formatCm = (cm: number) => `${formatNumber(cm, 1)} cm`;
export const formatMl = (ml: number) => `${formatNumber(ml)} ml`;
/** 0.235 → "23.5 %" (es-MX puts a space before the sign). */
export const formatPercent = (ratio: number) => `${formatNumber(ratio * 100, 1)} %`;

/** Spanish has only "one" and "other": plural(2, 'porción', 'porciones') → "2 porciones". */
export function plural(count: number, one: string, other: string): string {
  return `${formatNumber(count)} ${count === 1 ? one : other}`;
}

/**
 * Parses an API date-only string ("2026-10-05") as LOCAL midnight. `new Date('2026-10-05')`
 * is UTC midnight, which displays as the previous day everywhere in Mexico.
 */
export function parseDateOnly(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Invalid date-only string: ${isoDate}`);
  return new Date(y, m - 1, d);
}

/** The inverse of parseDateOnly: a local Date → "2026-10-05" for the API. */
export function toDateOnly(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const dateFormats = {
  /** "lunes, 5 de octubre" — day headers in the meal plan. */
  long: new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }),
  /** "lun 5 de oct" — week strip, chart axes. */
  short: new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' }),
  /** "5 de octubre de 2026" — goal dates, history. */
  full: new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' }),
  /** "14:30" — reminders. */
  time: new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false }),
};

/** Accepts a Date or an API date-only string. Uses the device's time zone. */
export function formatDate(date: Date | string, style: keyof typeof dateFormats = 'long'): string {
  return dateFormats[style].format(typeof date === 'string' ? parseDateOnly(date) : date);
}

const collator = new Intl.Collator(LOCALE, { sensitivity: 'base' });

/** Sorts Spanish text correctly (accents, ñ): names.sort(compareText). */
export const compareText = (a: string, b: string) => collator.compare(a, b);
