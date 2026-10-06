import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { PhoneFrame } from '../../design-system/stories/PhoneFrame';
import { explainGoal } from '../../features/goals/goal-explanation';
import {
  emptyGoalForm,
  goalSteps,
  stepComplete,
  type GoalForm,
} from '../../features/goals/goal-form';
import { GoalSetupView } from './GoalSetupView';

/** The whole flow, clickable, with the platform's default paces. "Guardar" shows a sample explanation. */
function Flow({ start, startStep = 0 }: { start: GoalForm; startStep?: number }) {
  const [form, setForm] = useState(start);
  const [index, setIndex] = useState(startStep);
  const [done, setDone] = useState(false);
  const steps = goalSteps(form.intention);
  const step = steps[Math.min(index, steps.length - 1)]!;
  return (
    <PhoneFrame>
      <GoalSetupView
        state={
          done
            ? {
                status: 'done',
                paragraphs: explainGoal(
                  {
                    intention: 'LOSE_WEIGHT',
                    pace: 'GENTLE',
                    desiredChangeKg: 10,
                    otherText: null,
                    recentWeightChange: 'STABLE',
                    decision: { goal: 'LOSE', pace: 'GENTLE', reason: 'AS_CHOSEN' },
                    rulesVersion: 'platform-1',
                    decidedAt: '2026-10-06T18:00:00.000Z',
                  },
                  {
                    status: 'READY',
                    bmrKcal: 1410,
                    maintenanceKcal: 1940,
                    targetKcal: 1740,
                    proteinG: 115,
                    carbsG: 200,
                    fatG: 58,
                  },
                ),
              }
            : {
                status: 'asking',
                step,
                stepNumber: index + 1,
                stepCount: steps.length,
                form,
                paces: ['GENTLE', 'MODERATE'],
                canContinue: stepComplete(step, form),
                saving: false,
                saveFailed: false,
              }
        }
        onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
        onNext={() => (index >= steps.length - 1 ? setDone(true) : setIndex((i) => i + 1))}
        onBack={() => setIndex((i) => Math.max(0, i - 1))}
        onDone={() => {}}
      />
    </PhoneFrame>
  );
}

const meta = {
  title: 'Screens/Meta',
  component: Flow,
  parameters: { screen: true, layout: 'fullscreen' },
  args: { start: emptyGoalForm },
} satisfies Meta<typeof Flow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Intention: Story = {};
export const LosePace: Story = {
  args: {
    start: { ...emptyGoalForm, intention: 'LOSE_WEIGHT', pace: 'GENTLE', desiredKg: '10' },
    startStep: 1,
  },
};
export const Other: Story = {
  args: { start: { ...emptyGoalForm, intention: 'OTHER' }, startStep: 1 },
};
export const Screening: Story = {
  args: {
    start: { ...emptyGoalForm, intention: 'BUILD_MUSCLE', recentWeightChange: 'STABLE' },
    startStep: 1,
  },
};
