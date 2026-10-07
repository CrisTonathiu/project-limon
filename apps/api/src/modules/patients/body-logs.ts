import {
  BodyMeasurement,
  ProgressPeriod,
  WeightGoal,
  type BodyLogDto,
  type ProgressResponse,
} from '@limon/types';
import type { BodyLog } from '@limon/validation';

/**
 * Weigh-ins, body measurements and the progress built from them. Pure, so it is unit-tested
 * directly. Dates are ISO days (YYYY-MM-DD) on the patients' calendar (see meal-plans/week.ts).
 */

export const MEASUREMENTS = Object.values(BodyMeasurement);
const FIELDS = ['weightKg', ...MEASUREMENTS] as const;

/** A day's values, without its date. */
export type BodyValues = Omit<BodyLogDto, 'date'>;

/** What a PUT leaves on the day: given fields replace (null clears), missing ones are kept. */
export function mergeBodyLog(existing: BodyValues | null, input: BodyLog): BodyValues {
  const merged = {} as BodyValues;
  for (const f of FIELDS) merged[f] = input[f] !== undefined ? input[f] : (existing?.[f] ?? null);
  return merged;
}

/** A day with nothing logged is deleted rather than stored. */
export const isEmptyLog = (v: BodyValues) => FIELDS.every((f) => v[f] === null);

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS: Record<ProgressPeriod, number | null> = { weeks8: 56, months3: 91, all: null };

/** The first day shown for the period (today included), or null for everything. */
export function periodStart(period: ProgressPeriod, today: string): string | null {
  const days = PERIOD_DAYS[period];
  if (days === null) return null;
  return new Date(new Date(`${today}T00:00:00Z`).getTime() - (days - 1) * DAY_MS).toISOString().slice(0, 10);
}

/** What the progress needs from the goal: its decision, the kg asked for and where it started. */
export type GoalForProgress = {
  decidedGoal: WeightGoal;
  desiredChangeKg: number | null;
  startWeightKg: number;
  startedOn: string;
};

/** The start and target of a goal that loses or gains a number of kg; null otherwise. */
export function weightGoalOf(goal: GoalForProgress | null): ProgressResponse['weightGoal'] {
  if (!goal || goal.decidedGoal === WeightGoal.MAINTAIN || goal.desiredChangeKg === null) return null;
  const sign = goal.decidedGoal === WeightGoal.LOSE ? -1 : 1;
  return {
    startWeightKg: goal.startWeightKg,
    targetWeightKg: Math.round((goal.startWeightKg + sign * goal.desiredChangeKg) * 10) / 10,
    startedOn: goal.startedOn,
  };
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Progreso from every log of the patient, oldest first. The chart only gets the period's
 * weigh-ins; each measurement's change is since the first time it was logged.
 */
export function buildProgress(
  logs: BodyLogDto[],
  input: { currentWeightKg: number; period: ProgressPeriod; today: string; goal: GoalForProgress | null },
): ProgressResponse {
  const from = periodStart(input.period, input.today);
  const weights = logs
    .filter((l) => l.weightKg !== null && (from === null || l.date >= from))
    .map((l) => ({ date: l.date, weightKg: l.weightKg! }));

  const measurements = {} as ProgressResponse['measurements'];
  for (const m of MEASUREMENTS) {
    const values = logs.filter((l) => l[m] !== null);
    const first = values[0];
    const latest = values[values.length - 1];
    measurements[m] = latest
      ? { value: latest[m]!, date: latest.date, change: values.length > 1 ? round1(latest[m]! - first![m]!) : null }
      : null;
  }

  return { currentWeightKg: input.currentWeightKg, weights, measurements, weightGoal: weightGoalOf(input.goal) };
}
