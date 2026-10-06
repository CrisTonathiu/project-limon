import { useEffect } from 'react';
import {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
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

/** The streak flame: scales to 1.08 with a 4° tilt and back, looping. Still with reduced motion. */
export function useFlicker() {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) {
      cancelAnimation(t);
      t.value = 0;
      return;
    }
    const half = { duration: motion.flicker.duration / 2, easing: Easing.inOut(Easing.ease) };
    t.value = withRepeat(withSequence(withTiming(1, half), withTiming(0, half)), -1);
    return () => cancelAnimation(t);
  }, [reduced, t]);
  return useAnimatedStyle(() => ({
    transform: [
      { scale: 1 + (motion.flicker.scale - 1) * t.value },
      { rotate: `${-motion.flicker.rotate * t.value}deg` },
    ],
  }));
}

/** Press feedback for tappable cards: scale to 0.97 while held. Spread the handlers on a Pressable. */
export function usePressScale() {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const to = (value: number) => () => {
    if (!reduced) scale.value = withTiming(value, { duration: motion.press.duration });
  };
  return { style, onPressIn: to(motion.press.scale), onPressOut: to(1) };
}
