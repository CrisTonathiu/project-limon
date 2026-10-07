import { BodyMeasurement } from '@limon/types';
import { BODY_LOG_LIMITS, type BodyLogInput } from '@limon/validation';
import { t } from '../../i18n/es-MX';
import { formatNumber } from '../../i18n/format';

/** "73,8" or "73.8" → 73.8; empty → null; anything else → NaN. */
export function parseDecimal(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (!trimmed) return null;
  return /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : NaN;
}

/** How a number is shown in a field: one decimal at most, no grouping ("73.8"). */
export const toFieldText = (value: number) => String(Math.round(value * 10) / 10);

type Field = 'weightKg' | BodyMeasurement;

/** Why a typed value can't be saved, or null when it can (an empty optional field can). */
export function fieldError(field: Field, text: string): string | null {
  const value = parseDecimal(text);
  if (value === null) return field === 'weightKg' ? t.progress.weightRequired : null;
  const { min, max } = BODY_LOG_LIMITS[field];
  if (Number.isNaN(value) || value < min || value > max) {
    return t.progress.outOfRange(formatNumber(min), formatNumber(max));
  }
  return null;
}

/** The weigh-in stepper: ±0.1 kg, kept within the limits. */
export function stepWeight(text: string, delta: number, fallbackKg: number): string {
  const current = parseDecimal(text);
  const base = current === null || Number.isNaN(current) ? fallbackKg : current;
  const { min, max } = BODY_LOG_LIMITS.weightKg;
  return toFieldText(Math.min(Math.max(base + delta, min), max));
}

export const MEASUREMENT_FIELDS = Object.values(BodyMeasurement);
export type MeasurementForm = Record<BodyMeasurement, string>;
export const emptyMeasurementForm = Object.fromEntries(
  MEASUREMENT_FIELDS.map((m) => [m, '']),
) as MeasurementForm;

/** The measurements sheet can save when something is filled in and nothing is out of range. */
export function measurementsValid(form: MeasurementForm): boolean {
  return (
    MEASUREMENT_FIELDS.some((m) => parseDecimal(form[m]) !== null) &&
    MEASUREMENT_FIELDS.every((m) => fieldError(m, form[m]) === null)
  );
}

/** The PUT body: only what was filled in, so the day keeps the values left empty. */
export function measurementsInput(form: MeasurementForm): BodyLogInput {
  const input: BodyLogInput = {};
  for (const m of MEASUREMENT_FIELDS) {
    const value = parseDecimal(form[m]);
    if (value !== null && !Number.isNaN(value)) input[m] = value;
  }
  return input;
}
