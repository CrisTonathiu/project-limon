import type { Meta, StoryObj } from '@storybook/react-native';
import { Box } from '../restyle';
import { StatTile } from './StatTile';

const meta = {
  title: 'Components/StatTile',
  component: StatTile,
  args: { value: '1,420', label: 'kcal hoy', delay: 0 },
} satisfies Meta<typeof StatTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Single: Story = {};

/** Three to a row, as on Inicio, staggered by motion.entrance.stagger. */
export const Row: Story = {
  render: () => (
    <Box flexDirection="row" gap="s">
      <Box flex={1}>
        <StatTile value="12" label="días seguidos" delay={0} />
      </Box>
      <Box flex={1}>
        <StatTile value="3/5" label="comidas" delay={80} />
      </Box>
      <Box flex={1}>
        <StatTile value="1,420" label="kcal hoy" delay={160} />
      </Box>
    </Box>
  ),
};
