import type { Decorator } from '@storybook/react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useDesignFonts } from '../fonts';
import { Box, DesignSystemProvider } from '../restyle';

/** The preview brand from the mockups; every story has a `brand` control to try a tenant color. */
export const PREVIEW_BRAND = '#3173BD';

function Frame({
  brand,
  screen,
  children,
}: {
  brand: string;
  screen: boolean;
  children: ReactNode;
}) {
  const fontsReady = useDesignFonts();
  return (
    <SafeAreaProvider>
      <DesignSystemProvider primary={brand}>
        <Box flex={1} backgroundColor="background" padding={screen ? 'none' : 'l'}>
          {fontsReady ? children : <ActivityIndicator />}
        </Box>
      </DesignSystemProvider>
    </SafeAreaProvider>
  );
}

/**
 * Wraps every story in the theme, the brand fonts, safe areas and the app background.
 * Screen stories set `parameters: { screen: true }` to fill the frame without padding.
 */
export const withDesignSystem: Decorator = (Story, { args, parameters }) => (
  <Frame
    brand={typeof args.brand === 'string' ? args.brand : PREVIEW_BRAND}
    screen={parameters.screen === true}
  >
    <Story />
  </Frame>
);

/** Shared by the on-device and web previews. */
export const sharedPreview = {
  decorators: [withDesignSystem],
  args: { brand: PREVIEW_BRAND },
  argTypes: {
    brand: {
      control: { type: 'color' },
      description: 'Tenant primary color (not a component prop)',
    },
  },
};
