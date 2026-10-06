import { useEffect } from 'react';
import {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { motion } from './theme';

/**
 * The shared entrance: fade in while rising 12 px. Pass a delay to stagger blocks in reading
 * order (motion.entrance.stagger apart). With reduced motion on, the block is simply shown.
 */
export function useEntrance(delay = 0) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      progress.value = 1;
      return;
    }
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: motion.entrance.duration, easing: Easing.out(Easing.cubic) }),
    );
  }, [delay, progress, reduced]);
  return useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * motion.entrance.rise }],
  }));
}
