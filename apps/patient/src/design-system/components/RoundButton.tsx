import { useEffect, useRef } from 'react';
import { Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Box } from '../restyle';
import { motion } from '../theme';
import { Icon, type IconName } from './Icon';

export type RoundButtonProps = {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  /** surface: white circle (on tinted headers). none: just the icon in a 44 px target. */
  background?: 'surface' | 'none';
};

/** A 44 px circular icon button: back, close. */
export function RoundButton({
  icon,
  accessibilityLabel,
  onPress,
  background = 'surface',
}: RoundButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
    >
      <Box
        width={44}
        height={44}
        borderRadius="pill"
        alignItems="center"
        justifyContent="center"
        backgroundColor={background === 'surface' ? 'surface' : undefined}
      >
        <Icon name={icon} />
      </Box>
    </Pressable>
  );
}

export type HeartButtonProps = {
  favourite: boolean;
  /** "Marcar … como favorita" / "Quitar … de favoritas". */
  accessibilityLabel: string;
  onPress: () => void;
  background?: 'surface' | 'none';
};

/** The favourite toggle. The heart pops (scale 1.2 and back) when it turns on. */
export function HeartButton({
  favourite,
  accessibilityLabel,
  onPress,
  background = 'none',
}: HeartButtonProps) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const was = useRef(favourite);
  useEffect(() => {
    if (favourite && !was.current && !reduced) {
      const half = { duration: motion.heart.duration / 2 };
      scale.value = withSequence(withTiming(motion.heart.scale, half), withTiming(1, half));
    }
    was.current = favourite;
  }, [favourite, reduced, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: favourite }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
    >
      <Box
        width={44}
        height={44}
        borderRadius="pill"
        alignItems="center"
        justifyContent="center"
        backgroundColor={background === 'surface' ? 'surface' : undefined}
      >
        <Animated.View style={style}>
          <Icon
            name="heart"
            color={favourite ? 'favorite' : 'iconMuted'}
            fill={favourite ? 'favorite' : undefined}
          />
        </Animated.View>
      </Box>
    </Pressable>
  );
}
