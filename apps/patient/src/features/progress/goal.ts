export type WeightGoal = { startKg: number; targetKg: number; currentKg: number };

/** Progress from the start weight towards the target, 0 to 1. Works for gain goals too. */
export function goalProgress({ startKg, targetKg, currentKg }: WeightGoal): number {
  const span = targetKg - startKg;
  if (span === 0) return 1;
  return Math.min(Math.max((currentKg - startKg) / span, 0), 1);
}
