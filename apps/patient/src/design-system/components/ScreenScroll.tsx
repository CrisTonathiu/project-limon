import type { ReactNode } from 'react';
import { ActivityIndicator, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Text, useAppTheme } from '../restyle';
import type { AppTheme } from '../theme';
import { Button } from './Button';

export type ScreenScrollProps = {
  children: ReactNode;
  /** Space between blocks. */
  gap?: keyof AppTheme['spacing'];
  /** For a screen that starts with a DetailHeader: no gutter or top padding of its own. */
  bleed?: boolean;
};

/**
 * The scrolling page of a screen without a navigation bar: the app background, the 24 px
 * gutter and the mockups' top padding (56 from the top of the phone, status bar included).
 */
export function ScreenScroll({ children, gap = 'm', bleed }: ScreenScrollProps) {
  const { spacing } = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <Box flex={1} backgroundColor="background">
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: bleed ? 0 : spacing.xl,
          paddingTop: bleed ? 0 : Math.max(insets.top + spacing.s, spacing.top),
          paddingBottom: spacing.xl + (bleed ? insets.bottom : 0),
          gap: spacing[gap],
        }}
      >
        {children}
      </ScrollView>
    </Box>
  );
}

/** The padded column under a DetailHeader. */
export function DetailBody({
  children,
  gap = 'm',
}: {
  children: ReactNode;
  gap?: keyof AppTheme['spacing'];
}) {
  return (
    <Box paddingHorizontal="xl" paddingTop="l" gap={gap}>
      {children}
    </Box>
  );
}

export type LoadStateProps =
  | { status: 'loading' }
  | { status: 'failed'; message: string; retryLabel: string; onRetry: () => void };

/** What a screen shows while its data loads, or after it failed to. */
export function LoadState(props: LoadStateProps) {
  if (props.status === 'loading') {
    return (
      <Box paddingVertical="xxl" alignItems="center">
        <ActivityIndicator />
      </Box>
    );
  }
  return (
    <Box gap="l" paddingVertical="l">
      <Text variant="body">{props.message}</Text>
      <Button variant="outline" label={props.retryLabel} onPress={props.onRetry} />
    </Box>
  );
}
