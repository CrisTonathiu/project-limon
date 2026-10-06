import { Pressable } from 'react-native';
import { Box, Text } from '../restyle';
import { fonts, type AppTheme } from '../theme';

type ColorKey = keyof AppTheme['colors'];

const tones = {
  surface: { bg: 'surface', fg: 'text' },
  tint: { bg: 'primaryTint', fg: 'text' },
  accent: { bg: 'accentTrack', fg: 'text' },
  neutral: { bg: 'divider', fg: 'text' },
  success: { bg: 'successTint', fg: 'success' },
  muted: { bg: 'track', fg: 'textMuted' },
} as const satisfies Record<string, { bg: ColorKey; fg: ColorKey }>;

export type ChipProps = {
  label: string;
  /** Colors; `onPrimary` is a see-through white chip for brand-colored cards. */
  tone?: keyof typeof tones | 'onPrimary';
  /** s: 12 px text (macro chips on cards). m: 13 px (header meta chips). */
  size?: 's' | 'm';
};

/** A small pill of text: macros, meta, status. */
export function Chip({ label, tone = 'surface', size = 's' }: ChipProps) {
  const text = (color: ColorKey) => (
    <Text variant={size === 's' ? 'caption' : 'chip'} color={color} fontFamily={fonts.bodyBold}>
      {label}
    </Text>
  );
  const padding = { paddingHorizontal: size === 's' ? 's' : 'm', paddingVertical: 'xs' } as const;
  if (tone === 'onPrimary') {
    return (
      <Box borderRadius="pill" overflow="hidden" {...padding}>
        <Box
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          backgroundColor="onPrimary"
          opacity={0.2}
        />
        {text('onPrimary')}
      </Box>
    );
  }
  const { bg, fg } = tones[tone];
  return (
    <Box borderRadius="pill" backgroundColor={bg} {...padding}>
      {text(fg)}
    </Box>
  );
}

export type FilterChipProps = { label: string; selected: boolean; onPress: () => void };

/** A selectable chip in a filter row (one of several, like a radio). */
export function FilterChip({ label, selected, onPress }: FilterChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
    >
      <Box
        minHeight={40}
        paddingHorizontal="l"
        borderRadius="pill"
        justifyContent="center"
        backgroundColor={selected ? 'primary' : 'surface'}
      >
        <Text variant="chip" fontSize={14} color={selected ? 'onPrimary' : 'text'}>
          {label}
        </Text>
      </Box>
    </Pressable>
  );
}
