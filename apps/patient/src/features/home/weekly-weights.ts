import type { ProgressResponse } from '@limon/types';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Inicio's weight sparkline: the last weigh-in of each week, oldest first. Weeks are counted
 * back from today, so the last point is always the latest weigh-in.
 */
export function weeklyWeights(weights: ProgressResponse['weights'], today: string): number[] {
  const end = new Date(`${today}T00:00:00Z`).getTime();
  const byWeek = new Map<number, number>();
  for (const w of weights) {
    const weeksAgo = Math.floor((end - new Date(`${w.date}T00:00:00Z`).getTime()) / (7 * DAY_MS));
    byWeek.set(weeksAgo, w.weightKg); // oldest first, so the week keeps its last weigh-in
  }
  return [...byWeek.entries()].sort((a, b) => b[0] - a[0]).map(([, kg]) => kg);
}

/** Inicio's goal ring: kg changed so far and kg to change, both signed (a loss is negative). */
export function goalRing(p: ProgressResponse) {
  if (!p.weightGoal) return null;
  return {
    kind: 'weightGoal' as const,
    changeKg: Math.round((p.currentWeightKg - p.weightGoal.startWeightKg) * 10) / 10,
    goalKg: Math.round((p.weightGoal.targetWeightKg - p.weightGoal.startWeightKg) * 10) / 10,
  };
}
