import { ActivityIndicator, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { usePressScale } from '../motion';
import { Box, Text, useAppTheme } from '../restyle';
import { Icon, type IconName } from './Icon';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  /** primary: brand fill (one per screen). outline: brand border. tint: soft brand fill. */
  variant?: 'primary' | 'outline' | 'tint';
  icon?: IconName;
  disabled?: boolean;
  /** Shows a spinner in place of the icon and blocks presses. */
  busy?: boolean;
  accessibilityLabel?: string;
};

/** A full-width pill button, at least 52 px tall (48 for outline and tint). */
export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  busy,
  accessibilityLabel,
}: ButtonProps) {
  const { colors } = useAppTheme();
  const press = usePressScale();
  const inactive = disabled || busy;
  const fg = variant === 'primary' ? 'onPrimary' : 'primary';
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
    >
      <Animated.View style={press.style}>
        <Box
          minHeight={variant === 'primary' ? 52 : 48}
          borderRadius="pill"
          paddingHorizontal="xl"
          flexDirection="row"
          alignItems="center"
          justifyContent="center"
          gap="s"
          opacity={disabled ? 0.5 : 1}
          backgroundColor={
            variant === 'primary' ? 'primary' : variant === 'tint' ? 'primaryTint' : undefined
          }
          borderWidth={variant === 'outline' ? 2 : 0}
          borderColor="primary"
        >
          {busy ? (
            <ActivityIndicator color={colors[fg]} />
          ) : icon ? (
            <Icon name={icon} color={fg} />
          ) : null}
          <Text variant="button" color={fg} textAlign="center">
            {label}
          </Text>
        </Box>
      </Animated.View>
    </Pressable>
  );
}
