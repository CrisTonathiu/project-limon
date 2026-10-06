import { useEffect, useState } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Box, Text, useAppTheme } from '../restyle';
import { fonts, motion, type AppTheme } from '../theme';

type ColorKey = keyof AppTheme['colors'];

export type ProgressBarProps = {
  /** 0 to 1; clamped. */
  progress: number;
  color?: ColorKey;
  trackColor?: ColorKey;
  height?: number;
  /** When the fill starts, in ms. */
  delay?: number;
};

/** A rounded bar that fills from the left (recipe macros, Progreso's goal). */
export function ProgressBar({
  progress,
  color = 'primary',
  trackColor = 'dividerSoft',
  height = 10,
  delay = 0,
}: ProgressBarProps) {
  const { colors } = useAppTheme();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const target = Math.min(Math.max(progress, 0), 1);
  const fill = useSharedValue(reduced ? target : 0);
  useEffect(() => {
    fill.value = reduced
      ? target
      : withDelay(
          delay,
          withTiming(target, {
            duration: motion.bar.duration,
            easing: Easing.bezier(0.3, 0.7, 0.2, 1),
          }),
        );
  }, [delay, fill, reduced, target]);
  const style = useAnimatedStyle(() => ({ width: width * fill.value }));
  return (
    <Box
      height={height}
      borderRadius="pill"
      overflow="hidden"
      backgroundColor={trackColor}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View
        style={[{ height, borderRadius: height / 2, backgroundColor: colors[color] }, style]}
      />
    </Box>
  );
}

export type MacroBarProps = {
  label: string;
  /** "14 g" */
  value: string;
  progress: number;
  color?: ColorKey;
  delay?: number;
};

/** A labelled macro row: name, bar, grams. */
export function MacroBar({ label, value, progress, color, delay }: MacroBarProps) {
  return (
    <Box
      flexDirection="row"
      alignItems="center"
      gap="m"
      accessible
      accessibilityLabel={`${label} ${value}`}
    >
      <Box width={76}>
        <Text variant="label" color="textOnTint">
          {label}
        </Text>
      </Box>
      <Box flex={1}>
        <ProgressBar progress={progress} color={color} delay={delay} />
      </Box>
      <Box minWidth={44} alignItems="flex-end">
        <Text variant="label" color="text" fontFamily={fonts.bodyBold}>
          {value}
        </Text>
      </Box>
    </Box>
  );
}
