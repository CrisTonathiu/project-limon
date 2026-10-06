import type { Meta, StoryObj } from '@storybook/react-native';
import { Box, Text } from '../restyle';
import { ScreenHeader } from './ScreenHeader';

const meta = {
  title: 'Components/ScreenHeader',
  component: ScreenHeader,
  args: { caption: 'Lunes 5 de octubre', title: 'Hola, Ana', delay: 0 },
} satisfies Meta<typeof ScreenHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NoCaption: Story = { args: { caption: undefined, title: 'Recetas' } };
export const WithTrailing: Story = {
  args: {
    trailing: (
      <Box
        width={48}
        height={48}
        borderRadius="pill"
        backgroundColor="primaryTint"
        alignItems="center"
        justifyContent="center"
      >
        <Text variant="h2" color="primary">
          A
        </Text>
      </Box>
    ),
  },
};
