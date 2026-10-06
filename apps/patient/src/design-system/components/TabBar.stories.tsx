import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { TabBar, type TabItem } from './TabBar';

const tabs: TabItem[] = [
  { key: 'home', label: 'Inicio', icon: 'home' },
  { key: 'meals', label: 'Comidas', icon: 'meals' },
  { key: 'recipes', label: 'Recetas', icon: 'recipes' },
  { key: 'progress', label: 'Progreso', icon: 'progress' },
  { key: 'profile', label: 'Perfil', icon: 'profile' },
];

function Demo({ count }: { count: number }) {
  const [active, setActive] = useState('home');
  return <TabBar tabs={tabs.slice(0, count)} active={active} onSelect={setActive} />;
}

const meta = {
  title: 'Components/TabBar',
  component: Demo,
  args: { count: 5 },
  argTypes: { count: { control: { type: 'range', min: 2, max: 5, step: 1 } } },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllTabs: Story = {};
/** A clinic with recipes and progress switched off. */
export const ModulesOff: Story = { args: { count: 3 } };
