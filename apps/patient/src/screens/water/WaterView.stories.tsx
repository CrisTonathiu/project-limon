import type { WaterResponse } from '@limon/types';
import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { PhoneFrame } from '../../design-system/stories/PhoneFrame';
import { withIntake, withoutIntake } from '../../features/water/water';
import { WaterView, type HistoryDays, type WaterViewProps } from './WaterView';

const day = (offset: number) => {
  const d = new Date(2026, 9, 6 - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const totals = [2500, 1750, 2400, 900, 2600, 2000, 3000, 1500, 2450, 2200, 1250, 2400, 2750, 1800, 2400, 2000, 2650, 1000, 2400, 2550, 1900, 2400, 2300, 2800, 1600, 2400, 2100, 2450, 2400, 1500];
const history = (days: HistoryDays) =>
  totals.slice(-days).map((totalMl, i) => ({ date: day(days - 1 - i), totalMl }));

const sample: WaterResponse = {
  date: day(0),
  targetMl: 2400,
  defaultTargetMl: 2400,
  customTarget: false,
  totalMl: 1500,
  intakes: [
    { id: 'c', amountMl: 500, createdAt: '2026-10-06T19:10:00Z' },
    { id: 'b', amountMl: 250, createdAt: '2026-10-06T17:30:00Z' },
    { id: 'a', amountMl: 750, createdAt: '2026-10-06T14:05:00Z' },
  ],
  history: history(7),
};

/** Adding, undoing and the period switch work. */
function Phone(props: Partial<WaterViewProps> & { start: WaterResponse | null }) {
  const [days, setDays] = useState<HistoryDays>(7);
  const [water, setWater] = useState(props.start);
  const today = (w: WaterResponse, total: number) => w.history.map((d) => (d.date === w.date ? { ...d, totalMl: total } : d));
  return (
    <PhoneFrame>
      <WaterView
        status={props.status ?? null}
        water={water && { ...water, history: today({ ...water, history: history(days) }, water.totalMl) }}
        days={days}
        onChangeDays={setDays}
        quickAdd={[250, 500]}
        onAdd={(ml) => setWater((w) => w && { ...withIntake(w, ml), history: w.history })}
        onRemove={(id) => setWater((w) => w && { ...withoutIntake(w, id), history: w.history })}
        onOpenOther={() => {}}
        onOpenTarget={() => {}}
        onBack={() => {}}
      />
    </PhoneFrame>
  );
}

const meta = {
  title: 'Screens/Agua',
  component: Phone,
  parameters: { screen: true, layout: 'fullscreen' },
  args: { start: sample },
} satisfies Meta<typeof Phone>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** The target is met: the ring is full and says so. */
export const Reached: Story = {
  args: { start: { ...sample, totalMl: 2650, customTarget: true, targetMl: 2650 } },
};
/** First thing in the morning. */
export const NothingYet: Story = {
  args: { start: { ...sample, totalMl: 0, intakes: [] } },
};
export const Loading: Story = { args: { start: null, status: { status: 'loading' } } };
