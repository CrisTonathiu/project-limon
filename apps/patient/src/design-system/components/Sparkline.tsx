import { useEffect, useState } from 'react';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { Box, useAppTheme } from '../restyle';
import { sparklinePoints, SPARKLINE_BAND as BAND } from '../sparkline';
import { motion } from '../theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type SparklineProps = {
  /** Oldest first. Fewer than two points draws nothing. */
  values: number[];
  height?: number;
  /** When the line starts drawing, in ms (Inicio waits for the ring). */
  delay?: number;
  /** spark: over a soft tint band (Inicio). chart: over gridlines, the end dot ringed in white (Progreso). */
  variant?: 'spark' | 'chart';
  accessibilityLabel?: string;
};

const LINE = 3.5;
const DOT = 6;

/** A small trend line over a soft tint band; it draws in from the left, then its end dot appears. */
export function Sparkline({
  values,
  height = 90,
  delay = 0,
  variant = 'spark',
  accessibilityLabel,
}: SparklineProps) {
  const [width, setWidth] = useState(0);
  return (
    <Box
      height={height}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      {width > 0 && values.length > 1 ? (
        <Line values={values} width={width} height={height} delay={delay} variant={variant} />
      ) : null}
    </Box>
  );
}

function Line({
  values,
  width,
  height,
  delay,
  variant,
}: Required<Pick<SparklineProps, 'values' | 'height' | 'delay' | 'variant'>> & { width: number }) {
  const { colors } = useAppTheme();
  const reduced = useReducedMotion();
  const points = sparklinePoints(values, width, height);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
  const length = points
    .slice(1)
    .reduce((sum, p, i) => sum + Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y), 0);
  const end = points[points.length - 1]!;

  const drawn = useSharedValue(reduced ? 1 : 0);
  const dot = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      drawn.value = 1;
      dot.value = 1;
      return;
    }
    drawn.value = 0;
    dot.value = 0;
    drawn.value = withDelay(
      delay,
      withTiming(1, { duration: motion.line.duration, easing: Easing.out(Easing.cubic) }),
    );
    dot.value = withDelay(
      delay + motion.line.duration,
      withTiming(1, { duration: motion.dot.duration }),
    );
  }, [delay, dot, drawn, reduced, d]);

  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - drawn.value) }));
  const dotProps = useAnimatedProps(() => ({ opacity: dot.value }));

  return (
    <Svg width={width} height={height}>
      {variant === 'chart' ? (
        // Top, middle and bottom gridlines; the baseline a little stronger.
        [BAND / 2, height / 2, height - BAND / 2].map((y, i) => (
          <Path
            key={y}
            d={`M0 ${y} H${width}`}
            stroke={i === 2 ? colors.divider : colors.track}
            strokeWidth={1}
          />
        ))
      ) : (
        <Path
          d={d}
          fill="none"
          stroke={colors.primaryTint}
          strokeWidth={BAND}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      <AnimatedPath
        d={d}
        fill="none"
        stroke={colors.primary}
        strokeWidth={LINE}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={`${length} ${length}`}
        animatedProps={lineProps}
      />
      <AnimatedCircle
        cx={end.x}
        cy={end.y}
        r={DOT}
        fill={colors.primary}
        stroke={variant === 'chart' ? colors.surface : undefined}
        strokeWidth={variant === 'chart' ? 3 : 0}
        animatedProps={dotProps}
      />
    </Svg>
  );
}
