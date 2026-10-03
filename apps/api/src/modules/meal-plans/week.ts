/**
 * Plan weeks run Monday to Sunday, on the calendar of the patients' time zone. Dates are
 * ISO strings (YYYY-MM-DD) and the arithmetic is done in UTC, so no DST shift can move a day.
 */
export const PLAN_TIME_ZONE = 'America/Mexico_City';

const DAY_MS = 24 * 60 * 60 * 1000;
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);

export function isIsoDate(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && toIso(toDate(text)) === text;
}

export function isMonday(iso: string): boolean {
  return isIsoDate(iso) && toDate(iso).getUTCDay() === 1;
}

/** Today's date on the plan time zone's calendar. */
export function localToday(now: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: PLAN_TIME_ZONE }).format(now);
}

/** The Monday of the week `now` falls in, on the plan time zone's calendar. */
export function weekStartOf(now: Date): string {
  const today = toDate(localToday(now));
  const sinceMonday = (today.getUTCDay() + 6) % 7;
  return toIso(new Date(today.getTime() - sinceMonday * DAY_MS));
}

/** The 7 dates of the week starting on `weekStart`. */
export function weekDates(weekStart: string): string[] {
  const start = toDate(weekStart).getTime();
  return Array.from({ length: 7 }, (_, i) => toIso(new Date(start + i * DAY_MS)));
}
