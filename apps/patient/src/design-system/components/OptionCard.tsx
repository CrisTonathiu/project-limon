import { Pressable } from 'react-native';
import { Box, Text } from '../restyle';

export type OptionCardProps = {
  label: string;
  /** A short line under the label. */
  hint?: string;
  selected: boolean;
  onPress: () => void;
};

/** One answer of a single-choice question (goal setting): a white card with a radio dot, tinted when picked. */
export function OptionCard({ label, hint, selected, onPress }: OptionCardProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
    >
      <Box
        flexDirection="row"
        alignItems="center"
        gap="m"
        minHeight={56}
        paddingHorizontal="l"
        paddingVertical="m"
        borderRadius="m"
        borderWidth={2}
        borderColor={selected ? 'primary' : 'surface'}
        backgroundColor={selected ? 'primaryTint' : 'surface'}
      >
        <Box
          width={22}
          height={22}
          borderRadius="pill"
          borderWidth={selected ? 7 : 2}
          borderColor={selected ? 'primary' : 'control'}
        />
        <Box flex={1} gap="xs">
          <Text variant="bodyStrong">{label}</Text>
          {hint ? <Text variant="caption">{hint}</Text> : null}
        </Box>
      </Box>
    </Pressable>
  );
}
