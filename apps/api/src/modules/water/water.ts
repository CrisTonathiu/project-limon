import { WATER_LIMITS } from '@limon/validation';

/** Water tracker arithmetic. Pure, so it is unit-tested directly. */

const W = WATER_LIMITS;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 35 ml per kg of body weight, in steps of 50 ml, within the bounds of a custom target. */
export function defaultTargetMl(weightKg: number): number {
  const ml = Math.round((weightKg * W.defaultMlPerKg) / W.targetMl.step) * W.targetMl.step;
  return Math.min(Math.max(ml, W.targetMl.min), W.targetMl.max);
}

/** The `days` days ending today, oldest first. */
export function lastDays(today: string, days: number): string[] {
  const end = new Date(`${today}T00:00:00Z`).getTime();
  return Array.from({ length: days }, (_, i) => new Date(end - (days - 1 - i) * DAY_MS).toISOString().slice(0, 10));
}

/** Daily totals for the last `days` days, 0 for the days with nothing logged. */
export function history(today: string, days: number, totals: Map<string, number>) {
  return lastDays(today, days).map((date) => ({ date, totalMl: totals.get(date) ?? 0 }));
}
