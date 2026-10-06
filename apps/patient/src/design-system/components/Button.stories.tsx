import type { Meta, StoryObj } from '@storybook/react-native';
import { Button } from './Button';

const meta = {
  title: 'Components/Button',
  component: Button,
  args: { label: 'Registrar peso', icon: 'plus', onPress: () => {} },
  argTypes: { variant: { control: { type: 'select' }, options: ['primary', 'outline', 'tint'] } },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};
export const Outline: Story = {
  args: { variant: 'outline', label: 'Cambiar el menú de este día', icon: undefined },
};
export const Tint: Story = { args: { variant: 'tint', label: '+250 ml', icon: undefined } };
export const Busy: Story = {
  args: { variant: 'outline', label: 'Buscando otras recetas…', busy: true },
};
export const Disabled: Story = {
  args: { label: 'Usar atún en agua', icon: undefined, disabled: true },
};
