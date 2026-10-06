import type { Meta, StoryObj } from '@storybook/react-native';
import { Sparkline } from './Sparkline';

const meta = {
  title: 'Components/Sparkline',
  component: Sparkline,
  args: { values: [78, 77.4, 76.8, 76.3, 75.1, 74.8, 74.2, 73.9, 73.8], delay: 0 },
} satisfies Meta<typeof Sparkline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Losing: Story = {};
export const Gaining: Story = { args: { values: [52, 52.4, 53.1, 53.5, 54.5] } };
export const Flat: Story = { args: { values: [70, 70, 70, 70] } };
