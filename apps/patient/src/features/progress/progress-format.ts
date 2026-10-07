import { BodyMeasurement, type ProgressResponse } from '@limon/types';
import { t } from '../../i18n/es-MX';
import { formatCm, formatDate, formatNumber, formatSigned } from '../../i18n/format';
import type { ProgresoData } from '../../screens/progress/ProgresoView';

/** Progreso's goal bar, when the goal loses or gains toward a number of kg. */
export function goalBar(p: ProgressResponse): ProgresoData['goal'] {
  if (!p.weightGoal) return null;
  return {
    startKg: p.weightGoal.startWeightKg,
    targetKg: p.weightGoal.targetWeightKg,
    currentKg: p.currentWeightKg,
    startedOn: formatDate(p.weightGoal.startedOn, 'dayMonth'),
  };
}

/** The weight card: the current weight, the period's weigh-ins and three axis labels (first, middle, last). */
export function weightChart(p: ProgressResponse, today: string): NonNullable<ProgresoData['weight']> {
  const dates = p.weights.map((w) => w.date);
  const label = (date: string | undefined) =>
    !date ? '' : date === today ? t.progress.today : formatDate(date, 'dayMonth');
  return {
    currentKg: p.currentWeightKg,
    valuesKg: p.weights.map((w) => w.weightKg),
    axis:
      dates.length < 2
        ? ['', '', '']
        : [label(dates[0]), label(dates[Math.floor((dates.length - 1) / 2)]), label(dates.at(-1))],
  };
}

/** Tile order: the mockup's three first, then the rest; the first three that have a value are shown. */
const TILE_ORDER: BodyMeasurement[] = [
  BodyMeasurement.WAIST_CM,
  BodyMeasurement.HIP_CM,
  BodyMeasurement.BODY_FAT_PCT,
  BodyMeasurement.CHEST_CM,
  BodyMeasurement.ARM_CM,
  BodyMeasurement.THIGH_CM,
];

const formatPct = (pct: number) => `${formatNumber(pct, 1)}%`;

/** Up to three measurement tiles with their change since the first log, or null when none was logged. */
export function measurementTiles(p: ProgressResponse): ProgresoData['measurements'] {
  const tiles = TILE_ORDER.flatMap((m) => {
    const value = p.measurements[m];
    if (!value) return [];
    const pct = m === BodyMeasurement.BODY_FAT_PCT;
    const change = value.change === null || value.change === 0 ? null : formatSigned(value.change, 1);
    return [
      {
        label: t.progress.measurements[m],
        value: pct ? formatPct(value.value) : formatCm(value.value),
        change: change && (pct ? `${change}%` : `${change} cm`),
      },
    ];
  }).slice(0, 3);
  return tiles.length ? tiles : null;
}
