import type { Meta, StoryObj } from '@storybook/react-native';
import { Text } from '../restyle';
import { ProgressRing } from './ProgressRing';

type Args = { weight: number; calories: number; size: number };

function Demo({ weight, calories, size }: Args) {
  return (
    <ProgressRing
      size={size}
      rings={[{ progress: weight }, { progress: calories }]}
      accessibilityLabel={`Meta de peso ${Math.round(weight * 100)}%, calorías ${Math.round(calories * 100)}%`}
    >
      <Text variant="numberXL">−4.2</Text>
      <Text variant="label">kg de 7 kg</Text>
    </ProgressRing>
  );
}

const meta = {
  title: 'Components/ProgressRing',
  component: Demo,
  args: { weight: 0.6, calories: 0.75, size: 220 },
  argTypes: {
    weight: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
    calories: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
    size: { control: { type: 'range', min: 120, max: 300, step: 10 } },
  },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The Anillo hero: weight goal outside, today's calories inside. */
export const Anillo: Story = {};
export const Empty: Story = { args: { weight: 0, calories: 0 } };
export const Complete: Story = { args: { weight: 1, calories: 1 } };
