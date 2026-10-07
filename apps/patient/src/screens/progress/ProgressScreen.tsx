import {
  FeatureKey,
  type EnergyTargetDto,
  type MyGoalResponse,
  type ProgressResponse,
  type WaterTodayDto,
} from '@limon/types';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { explainGoal } from '../../features/goals/goal-explanation';
import { goalBar, measurementTiles, weightChart } from '../../features/progress/progress-format';
import { withIntake } from '../../features/water/water';
import { t } from '../../i18n/es-MX';
import { toDateOnly } from '../../i18n/format';
import { isScreenEnabled, type TabScreenProps } from '../../navigation/types';
import { api } from '../../services/api';
import { useSession } from '../../state/session-context';
import { MeasurementsSheet, WeighInSheet } from './BodyLogSheets';
import { ProgresoView, type Period, type ProgresoViewProps } from './ProgresoView';

type Goal = { goal: MyGoalResponse['goal']; target: EnergyTargetDto | null };
const GLASS_ML = 250;

/**
 * Progreso: the goal (goal setting), weigh-ins and measurements (goal_tracker) and today's
 * water (water_tracker). Each block only loads when its module is on for the clinic.
 */
export function ProgressScreen({ navigation }: TabScreenProps<'Progress'>) {
  const session = useSession();
  const goalsOn = session.hasFeature(FeatureKey.GOAL_TRACKER);
  const waterOn = session.hasFeature(FeatureKey.WATER_TRACKER);
  const canOpenWater = isScreenEnabled('Water', session.hasFeature);

  const [period, setPeriod] = useState<Period>('weeks8');
  const [goal, setGoal] = useState<Goal | null>(null);
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [water, setWater] = useState<WaterTodayDto | null>(null);
  const [status, setStatus] = useState<'loading' | 'failed' | 'ready'>('loading');
  const [sheet, setSheet] = useState<'weight' | 'measurements' | null>(null);

  const loadGoal = () =>
    Promise.all([api.patients.myGoal(), api.patients.myProfile()]).then(([{ goal }, { profile }]) =>
      setGoal({ goal, target: profile?.energyTarget ?? null }),
    );
  const loadProgress = (p: Period) => api.patients.myProgress(p).then(setProgress);
  const loadWater = () => api.water.get(1).then(setWater);

  const load = useCallback(
    (p: Period) => {
      const parts = [
        ...(goalsOn ? [loadGoal(), loadProgress(p)] : []),
        ...(waterOn ? [loadWater()] : []),
      ];
      Promise.all(parts)
        .then(() => setStatus('ready'))
        .catch((err) => {
          console.error('[progress] loading failed', err);
          setStatus('failed');
        });
    },
    [goalsOn, waterOn],
  );

  // Reloads when coming back from goal setting or the water screen.
  useFocusEffect(
    useCallback(() => {
      load(period);
    }, [load, period]),
  );

  const changePeriod = (p: Period) => {
    setPeriod(p);
    loadProgress(p).catch((err) => console.error('[progress] loading the chart failed', err));
  };

  const addWater = () => {
    if (!water) return;
    const before = water;
    setWater(withIntake(water, GLASS_ML));
    api.water
      .add(GLASS_ML)
      .then(setWater)
      .catch((err) => {
        console.error('[progress] adding water failed', err);
        setWater(before);
        Alert.alert(t.water.error);
      });
  };

  // The goal and energy target can follow a new weight, so everything reloads after a log.
  const saveWeight = async (weightKg: number) => {
    await api.patients.saveMyBodyLog(toDateOnly(new Date()), { weightKg });
    load(period);
  };
  const saveMeasurements: Parameters<typeof MeasurementsSheet>[0]['onSave'] = async (input) => {
    await api.patients.saveMyBodyLog(toDateOnly(new Date()), input);
    load(period);
  };

  const openSetup = () => navigation.navigate('GoalSetup');
  const plan: ProgresoViewProps['plan'] =
    !goalsOn || !goal
      ? null
      : goal.goal && goal.target
        ? {
            status: 'set',
            intention: t.goals.intentions[goal.goal.intention].label,
            paragraphs: explainGoal(goal.goal, goal.target),
            onChange: openSetup,
          }
        : { status: 'unset', onSet: openSetup };

  const today = toDateOnly(new Date());
  const nothingYet = !goal && !progress && !water;
  return (
    <>
      <ProgresoView
        status={
          status === 'failed' && nothingYet
            ? {
                status: 'failed',
                message: t.progress.loadError,
                retryLabel: t.common.retry,
                onRetry: () => {
                  setStatus('loading');
                  load(period);
                },
              }
            : status === 'loading' && nothingYet && (goalsOn || waterOn)
              ? { status: 'loading' }
              : null
        }
        plan={plan}
        goal={progress ? goalBar(progress) : null}
        weight={progress ? weightChart(progress, today) : null}
        measurements={progress ? measurementTiles(progress) : null}
        water={water ? { drunkMl: water.totalMl, goalMl: water.targetMl } : null}
        period={period}
        onChangePeriod={changePeriod}
        onLogWeight={progress ? () => setSheet('weight') : undefined}
        onLogMeasurements={progress ? () => setSheet('measurements') : undefined}
        onAddWater={water ? addWater : undefined}
        onOpenWater={canOpenWater ? () => navigation.navigate('Water') : undefined}
      />
      {progress ? (
        <>
          <WeighInSheet
            visible={sheet === 'weight'}
            currentKg={progress.currentWeightKg}
            onClose={() => setSheet(null)}
            onSave={saveWeight}
          />
          <MeasurementsSheet
            visible={sheet === 'measurements'}
            onClose={() => setSheet(null)}
            onSave={saveMeasurements}
          />
        </>
      ) : null}
    </>
  );
}
