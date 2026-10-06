import {
  createBox,
  createRestyleComponent,
  createText,
  createVariant,
  ThemeProvider,
  useTheme,
  type VariantProps,
} from '@shopify/restyle';
import { useMemo, type ComponentProps, type ReactNode } from 'react';
import { buildTheme, type AppTheme } from './theme';

/** Layout primitive: every spacing, color and radius prop takes a theme key (`padding="l"`). */
export const Box = createBox<AppTheme>();
export type BoxProps = ComponentProps<typeof Box>;

/** Text primitive: pick a `variant` (h1, number, label…) instead of setting font sizes. */
export const Text = createText<AppTheme>();
export type TextProps = ComponentProps<typeof Text>;

/** A Box with a `variant` from the theme's cardVariants. */
export const CardBox = createRestyleComponent<
  VariantProps<AppTheme, 'cardVariants'> & BoxProps,
  AppTheme
>([createVariant({ themeKey: 'cardVariants' })], Box);

export const useAppTheme = () => useTheme<AppTheme>();

/** Provides the theme for one tenant color. Rebuilt only when that color changes. */
export function DesignSystemProvider({
  primary,
  children,
}: {
  primary?: string;
  children: ReactNode;
}) {
  const theme = useMemo(() => buildTheme(primary), [primary]);
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
