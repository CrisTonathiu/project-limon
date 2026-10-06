import { GoalIntention, type MyGoalResponse } from '@limon/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { explainGoal } from '../../features/goals/goal-explanation';
import {
  emptyGoalForm,
  goalSteps,
  stepComplete,
  toGoalInput,
  type GoalForm,
} from '../../features/goals/goal-form';
import type { AppStackParamList } from '../../navigation/types';
import { api } from '../../services/api';
import { GoalSetupView, type GoalSetupViewProps } from './GoalSetupView';

type Load =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'loaded'; options: MyGoalResponse['options'] };

/**
 * The form starts from the patient's current goal, so changing it is a matter of tweaks. A pace
 * the clinic no longer offers is dropped, so the patient picks again.
 */
function formFrom({ goal, options }: MyGoalResponse): GoalForm {
  if (!goal) return emptyGoalForm;
  const offered = goal.intention === GoalIntention.GAIN_WEIGHT ? options.gain : options.lose;
  return {
    intention: goal.intention,
    pace: goal.pace && offered.includes(goal.pace) ? goal.pace : null,
    desiredKg: goal.desiredChangeKg ? String(goal.desiredChangeKg) : '',
    otherText: goal.otherText ?? '',
    recentWeightChange: goal.recentWeightChange,
  };
}

/** Goal setting (goal_tracker module). Opens from Progreso; goes back there when done. */
export function GoalSetupScreen({
  navigation,
}: NativeStackScreenProps<AppStackParamList, 'GoalSetup'>) {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [form, setForm] = useState<GoalForm>(emptyGoalForm);
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [done, setDone] = useState<string[] | null>(null);

  const fetchGoal = useCallback(() => {
    setLoad({ status: 'loading' });
    api.patients
      .myGoal()
      .then((res) => {
        setForm(formFrom(res));
        setLoad({ status: 'loaded', options: res.options });
      })
      .catch((err) => {
        console.error('[goals] loading the goal failed', err);
        setLoad({ status: 'failed' });
      });
  }, []);
  useEffect(fetchGoal, [fetchGoal]);

  const steps = goalSteps(form.intention);
  const step = steps[Math.min(stepIndex, steps.length - 1)]!;
  const last = stepIndex >= steps.length - 1;

  const save = () => {
    setSaving(true);
    setSaveFailed(false);
    api.patients
      .setMyGoal(toGoalInput(form))
      .then(({ goal, energyTarget }) => setDone(explainGoal(goal, energyTarget)))
      .catch((err) => {
        console.error('[goals] saving the goal failed', err);
        setSaveFailed(true);
      })
      .finally(() => setSaving(false));
  };

  const state = (): GoalSetupViewProps['state'] => {
    if (done) return { status: 'done', paragraphs: done };
    if (load.status === 'loading') return load;
    if (load.status === 'failed') return { status: 'failed', onRetry: fetchGoal };
    return {
      status: 'asking',
      step,
      stepNumber: stepIndex + 1,
      stepCount: steps.length,
      form,
      paces: form.intention === GoalIntention.GAIN_WEIGHT ? load.options.gain : load.options.lose,
      canContinue: stepComplete(step, form) && !saving,
      saving,
      saveFailed,
    };
  };

  return (
    <GoalSetupView
      state={state()}
      onChange={(patch) => {
        setForm((f) => ({ ...f, ...patch }));
        setSaveFailed(false);
      }}
      onNext={() => (last ? save() : setStepIndex((i) => i + 1))}
      onBack={() => (done || stepIndex === 0 ? navigation.goBack() : setStepIndex((i) => i - 1))}
      onDone={() => navigation.goBack()}
    />
  );
}
