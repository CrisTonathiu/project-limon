import { useState } from 'react';
import { ProgresoView, type Period } from './ProgresoView';

/**
 * Progreso. The API has no goal tracker, weigh-ins or water tracker yet (MVP week 6), so
 * every block is empty and the view shows its "coming soon" card. Feed it data as they ship.
 */
export function ProgressScreen() {
  const [period, setPeriod] = useState<Period>('weeks8');
  return (
    <ProgresoView
      goal={null}
      weight={null}
      measurements={null}
      water={null}
      period={period}
      onChangePeriod={setPeriod}
    />
  );
}
