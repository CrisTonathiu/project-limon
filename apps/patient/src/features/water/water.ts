import type { WaterTodayDto } from '@limon/types';
import { WATER_LIMITS } from '@limon/validation';

/** Today's water with a glass added before the API answers (optimistic update). */
export function withIntake(today: WaterTodayDto, amountMl: number, now = new Date()): WaterTodayDto {
  const pending = { id: `pending-${now.getTime()}`, amountMl, createdAt: now.toISOString() };
  return { ...today, totalMl: today.totalMl + amountMl, intakes: [pending, ...today.intakes] };
}

/** Today's water without one glass (optimistic undo). */
export function withoutIntake(today: WaterTodayDto, intakeId: string): WaterTodayDto {
  const intake = today.intakes.find((i) => i.id === intakeId);
  if (!intake) return today;
  return {
    ...today,
    totalMl: today.totalMl - intake.amountMl,
    intakes: today.intakes.filter((i) => i.id !== intakeId),
  };
}

export const isPendingIntake = (id: string) => id.startsWith('pending-');

/** Share of the target drunk, 0 to 1 (the ring stops full). */
export const waterProgress = (today: Pick<WaterTodayDto, 'totalMl' | 'targetMl'>) =>
  today.targetMl > 0 ? Math.min(today.totalMl / today.targetMl, 1) : 0;

/** "750" → 750 within the intake limits; anything else → null. */
export function parseIntakeMl(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const ml = Number(text.trim());
  const { min, max } = WATER_LIMITS.intakeMl;
  return ml >= min && ml <= max ? ml : null;
}

/** The target stepper: ±250 ml, within the limits and on the 50 ml grid. */
export function stepTarget(targetMl: number, delta: number): number {
  const { min, max, step } = WATER_LIMITS.targetMl;
  const next = Math.round((targetMl + delta) / step) * step;
  return Math.min(Math.max(next, min), max);
}
