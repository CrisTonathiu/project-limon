import type { Decorator } from '@storybook/react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator } from 'react-native';
import { useDesignFonts } from '../fonts';
import { Box, DesignSystemProvider } from '../restyle';

/** The preview brand from the mockups; every story has a `brand` control to try a tenant color. */
export const PREVIEW_BRAND = '#3173BD';

function Frame({ brand, children }: { brand: string; children: ReactNode }) {
  const fontsReady = useDesignFonts();
  return (
    <DesignSystemProvider primary={brand}>
      <Box flex={1} backgroundColor="background" padding="l">
        {fontsReady ? children : <ActivityIndicator />}
      </Box>
    </DesignSystemProvider>
  );
}

/** Wraps every story in the theme, the brand fonts and the app background. */
export const withDesignSystem: Decorator = (Story, { args }) => (
  <Frame brand={typeof args.brand === 'string' ? args.brand : PREVIEW_BRAND}>
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
