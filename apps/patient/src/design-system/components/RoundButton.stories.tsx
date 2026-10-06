import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { Box } from '../restyle';
import { HeartButton, RoundButton } from './RoundButton';

function Demo() {
  const [favourite, setFavourite] = useState(false);
  return (
    <Box flexDirection="row" gap="m" backgroundColor="primaryTint" padding="l" borderRadius="m">
      <RoundButton icon="chevronLeft" accessibilityLabel="Volver" onPress={() => {}} />
      <RoundButton icon="cart" accessibilityLabel="Lista del súper" onPress={() => {}} />
      <HeartButton
        background="surface"
        favourite={favourite}
        accessibilityLabel={favourite ? 'Quitar de favoritas' : 'Marcar como favorita'}
        onPress={() => setFavourite((f) => !f)}
      />
    </Box>
  );
}

const meta = { title: 'Components/RoundButton', component: Demo } satisfies Meta<typeof Demo>;
export default meta;
/** Tap the heart: it pops when it turns on. */
export const Buttons: StoryObj<typeof meta> = {};
