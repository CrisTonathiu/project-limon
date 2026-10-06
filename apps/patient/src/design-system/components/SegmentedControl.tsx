import { Pressable } from 'react-native';
import { Box, Text } from '../restyle';
import { fonts } from '../theme';

export type SegmentedControlProps<K extends string> = {
  options: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  accessibilityLabel: string;
};

/** A few mutually exclusive options in a pill track (Progreso's chart period). */
export function SegmentedControl<K extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedControlProps<K>) {
  return (
    <Box
      flexDirection="row"
      gap="xs"
      backgroundColor="track"
      borderRadius="pill"
      padding="xs"
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            // The pill is 32 px; the slop brings the target to 44.
            hitSlop={{ top: 6, bottom: 6 }}
          >
            <Box
              minHeight={32}
              paddingHorizontal="m"
              borderRadius="pill"
              justifyContent="center"
              backgroundColor={selected ? 'surface' : undefined}
            >
              <Text
                variant="caption"
                fontFamily={fonts.bodyBold}
                color={selected ? 'text' : 'textMuted'}
              >
                {option.label}
              </Text>
            </Box>
          </Pressable>
        );
      })}
    </Box>
  );
}
