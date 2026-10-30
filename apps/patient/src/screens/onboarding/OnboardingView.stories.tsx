import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { PhoneFrame } from '../../design-system/stories/PhoneFrame';
import {
  emptyDraft,
  ONBOARDING_STEPS,
  stepErrors,
  type OnboardingDraft,
} from '../../features/onboarding/onboarding-form';
import { onboardingSummary } from '../../features/onboarding/onboarding-summary';
import type { FoodCatalog } from '../../features/onboarding/use-food-catalog';
import { OnboardingView, type OnboardingViewProps } from './OnboardingView';

const filled: OnboardingDraft = {
  ...emptyDraft,
  sex: 'FEMALE',
  birthDay: '20',
  birthMonth: '5',
  birthYear: '1990',
  heightCm: '162',
  weightKg: '68,4',
  activityLevel: 'LIGHT',
  mealsPerDay: 4,
  mealTimes: ['07:30', '14:00', '17:00', '20:30'],
};

const catalog: FoodCatalog = {
  load: {
    status: 'loaded',
    foods: ['Brócoli', 'Hígado de res', 'Hígado de pollo', 'Pescado blanco', 'Piña'].map((name, i) => ({
      id: `food-${i}`,
      name,
    })),
  },
  retry: () => {},
};

const summary = onboardingSummary({
  sex: 'FEMALE',
  dateOfBirth: '1990-05-20',
  heightCm: 162,
  weightKg: 68.4,
  activityLevel: 'LIGHT',
  mealsPerDay: 4,
  mealTimes: filled.mealTimes,
  pregnantOrBreastfeeding: false,
  allergies: [],
  dislikedFoods: [],
  energyTarget: {
    status: 'READY',
    bmrKcal: 1410,
    maintenanceKcal: 1850,
    targetKcal: 1850,
    proteinG: 110,
    carbsG: 210,
    fatG: 60,
  },
  updatedAt: '2026-10-29T00:00:00.000Z',
});

type Page = 'welcome' | 'asking' | 'primer' | 'ready';

/**
 * The whole flow, clickable. "Terminar" goes to the primer and either answer to the summary.
 * The disliked-foods step searches a small sample catalog.
 */
function Flow({ start, startPage = 'welcome', startStep = 0, showErrors = false }: {
  start: OnboardingDraft;
  startPage?: Page;
  startStep?: number;
  showErrors?: boolean;
}) {
  const [draft, setDraft] = useState(start);
  const [page, setPage] = useState<Page>(startPage);
  const [index, setIndex] = useState(startStep);
  const step = ONBOARDING_STEPS[index]!;
  const state: OnboardingViewProps['state'] =
    page === 'asking'
      ? {
          status: 'asking',
          step,
          stepNumber: index + 1,
          stepCount: ONBOARDING_STEPS.length,
          draft,
          errors: showErrors ? stepErrors(step, draft) : {},
          catalog,
          saving: false,
          saveError: null,
        }
      : page === 'primer'
        ? { status: 'primer', requesting: false }
        : page === 'ready'
          ? { status: 'ready', ...summary, finishing: false }
          : { status: 'welcome' };
  return (
    <PhoneFrame>
      <OnboardingView
        clinic="Nutrición María"
        state={state}
        onStart={() => setPage('asking')}
        onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        onNext={() => (index === ONBOARDING_STEPS.length - 1 ? setPage('primer') : setIndex((i) => i + 1))}
        onBack={() => (index === 0 ? setPage('welcome') : setIndex((i) => i - 1))}
        onAllowNotifications={() => setPage('ready')}
        onSkipNotifications={() => setPage('ready')}
        onFinish={() => {}}
        onSignOut={() => {}}
      />
    </PhoneFrame>
  );
}

const meta = {
  title: 'Screens/Onboarding',
  component: Flow,
  parameters: { screen: true, layout: 'fullscreen' },
  args: { start: emptyDraft },
} satisfies Meta<typeof Flow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Welcome: Story = {};
export const AboutYou: Story = { args: { start: filled, startPage: 'asking' } };
export const AboutYouErrors: Story = { args: { startPage: 'asking', showErrors: true } };
export const Activity: Story = { args: { start: filled, startPage: 'asking', startStep: 2 } };
export const MealTimes: Story = {
  args: { start: filled, startPage: 'asking', startStep: ONBOARDING_STEPS.indexOf('mealTimes') },
};
export const MealTimesOutOfOrder: Story = {
  args: {
    start: { ...filled, mealTimes: ['07:30', '14:00', '13:45', '20:30'] },
    startPage: 'asking',
    startStep: ONBOARDING_STEPS.indexOf('mealTimes'),
    showErrors: true,
  },
};
export const Allergies: Story = {
  args: {
    start: { ...filled, allergies: ['milk', 'peanuts'] },
    startPage: 'asking',
    startStep: ONBOARDING_STEPS.indexOf('allergies'),
  },
};
export const DislikedFoods: Story = {
  args: {
    start: { ...filled, dislikedFoods: [{ id: 'food-1', name: 'Hígado de res' }] },
    startPage: 'asking',
    startStep: ONBOARDING_STEPS.indexOf('dislikes'),
  },
};
export const NotificationPrimer: Story = { args: { start: filled, startPage: 'primer' } };
export const Ready: Story = { args: { start: filled, startPage: 'ready' } };
