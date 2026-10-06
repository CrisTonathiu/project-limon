import type { ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Text, useAppTheme } from '../restyle';
import { Entering } from './Entering';
import { RoundButton } from './RoundButton';

export type DetailHeaderProps = {
  title: string;
  /** The small line above the title, e.g. "Comida · 14:00 · 520 kcal". */
  caption?: string;
  /** Under the title, e.g. meta chips. */
  children?: ReactNode;
  backLabel: string;
  onBack: () => void;
  /** Top right, e.g. the favourite button. */
  trailing?: ReactNode;
  delay?: number;
};

/** The tinted band at the top of a detail screen: back button, caption and title. */
export function DetailHeader({
  title,
  caption,
  children,
  backLabel,
  onBack,
  trailing,
  delay,
}: DetailHeaderProps) {
  const { spacing } = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <Box
      backgroundColor="primaryTint"
      borderBottomLeftRadius="xl"
      borderBottomRightRadius="xl"
      paddingHorizontal="xl"
      paddingBottom="xl"
      gap="m"
      style={{ paddingTop: Math.max(insets.top + spacing.xs, spacing.top - spacing.xs) }}
    >
      <Box flexDirection="row" justifyContent="space-between" alignItems="center">
        <RoundButton icon="chevronLeft" accessibilityLabel={backLabel} onPress={onBack} />
        {trailing}
      </Box>
      <Entering delay={delay}>
        <Box gap="s">
          {caption ? (
            <Text variant="label" color="textOnTint">
              {caption}
            </Text>
          ) : null}
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
          {children}
        </Box>
      </Entering>
    </Box>
  );
}
