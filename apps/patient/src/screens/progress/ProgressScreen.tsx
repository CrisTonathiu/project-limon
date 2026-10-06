import type { EnergyTargetDto, MyGoalResponse } from '@limon/types';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { explainGoal } from '../../features/goals/goal-explanation';
import { t } from '../../i18n/es-MX';
import type { TabScreenProps } from '../../navigation/types';
import { api } from '../../services/api';
import { ProgresoView, type Period, type ProgresoViewProps } from './ProgresoView';

type Loaded = { goal: MyGoalResponse['goal']; target: EnergyTargetDto | null };

/**
 * Progreso. The patient's goal (goal setting) is live; weigh-ins, measurements and water have
 * no API yet, so those blocks stay empty and a "coming soon" card stands in for them.
 */
export function ProgressScreen({ navigation }: TabScreenProps<'Progress'>) {
  const [period, setPeriod] = useState<Period>('weeks8');
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  // Reloads when coming back from goal setting.
  useFocusEffect(
    useCallback(() => {
      Promise.all([api.patients.myGoal(), api.patients.myProfile()])
        .then(([{ goal }, { profile }]) =>
          setLoaded({ goal, target: profile?.energyTarget ?? null }),
        )
        .catch((err) => console.error('[progress] loading the goal failed', err));
    }, []),
  );

  const openSetup = () => navigation.navigate('GoalSetup');
  const plan: ProgresoViewProps['plan'] = !loaded
    ? null
    : loaded.goal && loaded.target
      ? {
          status: 'set',
          intention: t.goals.intentions[loaded.goal.intention].label,
          paragraphs: explainGoal(loaded.goal, loaded.target),
          onChange: openSetup,
        }
      : { status: 'unset', onSet: openSetup };

  return (
    <ProgresoView
      goal={null}
      weight={null}
      measurements={null}
      water={null}
      plan={plan}
      period={period}
      onChangePeriod={setPeriod}
    />
  );
}
