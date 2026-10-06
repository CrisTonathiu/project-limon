import type { Meta, StoryObj } from '@storybook/react-native';
import { Box } from '../restyle';
import { MacroBar, ProgressBar } from './MacroBar';

function Demo() {
  return (
    <Box gap="m">
      <MacroBar label="Proteína" value="14 g" progress={0.15} color="primary" delay={0} />
      <MacroBar label="Carbs" value="58 g" progress={0.61} color="accent" delay={120} />
      <MacroBar label="Grasa" value="10 g" progress={0.24} color="neutralStrong" delay={240} />
      <ProgressBar progress={0.6} height={12} trackColor="primaryTint" delay={360} />
    </Box>
  );
}

const meta = { title: 'Components/MacroBar', component: Demo } satisfies Meta<typeof Demo>;
export default meta;
/** Bars fill from the left, 120 ms apart; the last is Progreso's goal bar. */
export const Macros: StoryObj<typeof meta> = {};
