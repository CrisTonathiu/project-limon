import { Pressable } from 'react-native';
import { Box, Text } from '../restyle';
import { Icon } from './Icon';

export type OptionCardProps = {
  label: string;
  /** A short line under the label. */
  hint?: string;
  selected: boolean;
  onPress: () => void;
  /** One of several answers that can all be picked (allergies): a checkbox instead of a radio dot. */
  multiple?: boolean;
};

/** One answer of a question (goal setting, onboarding): a white card with a radio dot or checkbox, tinted when picked. */
export function OptionCard({ label, hint, selected, onPress, multiple }: OptionCardProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
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
        {multiple ? (
          <Box
            width={22}
            height={22}
            style={{ borderRadius: 6 }}
            borderWidth={2}
            borderColor={selected ? 'primary' : 'control'}
            backgroundColor={selected ? 'primary' : undefined}
            alignItems="center"
            justifyContent="center"
          >
            {selected ? <Icon name="check" color="onPrimary" size={16} /> : null}
          </Box>
        ) : (
          <Box
            width={22}
            height={22}
            borderRadius="pill"
            borderWidth={selected ? 7 : 2}
            borderColor={selected ? 'primary' : 'control'}
          />
        )}
        <Box flex={1} gap="xs">
          <Text variant="bodyStrong">{label}</Text>
          {hint ? <Text variant="caption">{hint}</Text> : null}
        </Box>
      </Box>
    </Pressable>
  );
}
