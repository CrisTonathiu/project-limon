import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { PhoneFrame } from '../../design-system/stories/PhoneFrame';
import { ProgresoView, type Period, type ProgresoData } from './ProgresoView';

const series: Record<Period, NonNullable<ProgresoData['weight']>> = {
  weeks8: {
    currentKg: 73.8,
    valuesKg: [78, 77.1, 76.4, 75.6, 74.8, 74.3, 74, 73.8],
    axis: ['18 ago', '15 sep', 'Hoy'],
  },
  months3: {
    currentKg: 73.8,
    valuesKg: [79.2, 78.8, 78, 77.4, 76.4, 75.1, 74.3, 73.8],
    axis: ['6 jul', '20 ago', 'Hoy'],
  },
  all: {
    currentKg: 73.8,
    valuesKg: [81, 80.2, 79.2, 78, 76.4, 74.8, 73.8],
    axis: ['ene', 'may', 'Hoy'],
  },
};

/** The mockup (docs/ui/mockups/06-progreso.html): what Progreso shows once the trackers ship. */
const full: ProgresoData = {
  goal: { startKg: 78, targetKg: 71, currentKg: 73.8, startedOn: '18 ago' },
  weight: series.weeks8,
  measurements: [
    { label: 'Cintura', value: '82 cm', change: '−3 cm' },
    { label: 'Cadera', value: '98 cm', change: '−2 cm' },
    { label: 'Grasa', value: '29 %', change: '−1.5 %' },
  ],
  water: { drunkMl: 1500, goalMl: 2400 },
};

/** The period switch and "+250 ml" work. */
function Phone(props: ProgresoData) {
  const [period, setPeriod] = useState<Period>('weeks8');
  const [water, setWater] = useState(props.water);
  return (
    <PhoneFrame tab="progress">
      <ProgresoView
        {...props}
        weight={props.weight ? series[period] : null}
        water={water}
        period={period}
        onChangePeriod={setPeriod}
        onLogWeight={props.weight ? () => {} : undefined}
        onAddWater={() => setWater((w) => (w ? { ...w, drunkMl: w.drunkMl + 250 } : w))}
      />
    </PhoneFrame>
  );
}

const meta = {
  title: 'Screens/Progreso',
  component: Phone,
  parameters: { screen: true, layout: 'fullscreen' },
  args: full,
} satisfies Meta<typeof Phone>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** What the app shows today: no goal, weigh-in or water tracker in the API yet. */
export const ComingSoon: Story = {
  args: { goal: null, weight: null, measurements: null, water: null },
};
/** A gain goal that is already met. */
export const GoalReached: Story = {
  args: { goal: { startKg: 52, targetKg: 55, currentKg: 55.4, startedOn: '3 jun' } },
};
