import type { ReactNode } from 'react';
import { Box, Text } from '../restyle';
import { Entering } from './Entering';

export type ScreenHeaderProps = {
  /** The small line above the title, e.g. today's date. */
  caption?: string;
  title: string;
  /** Shown on the right, e.g. the avatar button. */
  trailing?: ReactNode;
  delay?: number;
};

/** The caption and h1 at the top of a tab screen. */
export function ScreenHeader({ caption, title, trailing, delay }: ScreenHeaderProps) {
  return (
    <Entering delay={delay}>
      <Box flexDirection="row" alignItems="center" justifyContent="space-between" gap="m">
        <Box flexShrink={1} gap="xs">
          {caption ? <Text variant="label">{caption}</Text> : null}
          <Text variant="h1" accessibilityRole="header" numberOfLines={2}>
            {title}
          </Text>
        </Box>
        {trailing}
      </Box>
    </Entering>
  );
}
