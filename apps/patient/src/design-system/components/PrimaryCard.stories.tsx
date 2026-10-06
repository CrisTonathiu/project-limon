import type { Meta, StoryObj } from '@storybook/react-native';
import { PrimaryCard } from './PrimaryCard';

const meta = {
  title: 'Components/PrimaryCard',
  component: PrimaryCard,
  args: {
    caption: 'Siguiente comida · 14:00',
    title: 'Ensalada de quinoa',
    onPress: () => {},
    delay: 0,
  },
} satisfies Meta<typeof PrimaryCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** Without onPress: no chevron, not tappable. */
export const Static: Story = { args: { onPress: undefined } };
export const LongTitle: Story = {
  args: { title: 'Tacos de pollo con nopales asados y salsa verde de la casa' },
};
