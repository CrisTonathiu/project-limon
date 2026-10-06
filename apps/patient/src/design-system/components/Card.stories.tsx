import type { Meta, StoryObj } from '@storybook/react-native';
import { Text } from '../restyle';
import { Card } from './Card';

const meta = {
  title: 'Components/Card',
  component: Card,
  args: {
    delay: 0,
    children: (
      <>
        <Text variant="h2">Comidas de hoy</Text>
        <Text variant="label">3 de 5 registradas</Text>
      </>
    ),
  },
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: [undefined, 'hero', 'tile', 'primary', 'tint'],
    },
    delay: { control: { type: 'number' } },
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Hero: Story = { args: { variant: 'hero' } };
export const Tint: Story = { args: { variant: 'tint' } };
export const Primary: Story = {
  args: {
    variant: 'primary',
    children: (
      <>
        <Text variant="h2" color="onPrimary">
          Tu plan de esta semana
        </Text>
        <Text variant="label" color="onPrimary">
          Toca para verlo
        </Text>
      </>
    ),
  },
};
