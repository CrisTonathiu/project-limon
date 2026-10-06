import { useEffect, type ReactNode } from 'react';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { Box, useAppTheme } from '../restyle';
import { motion, type AppTheme } from '../theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type ColorKey = keyof AppTheme['colors'];

export type Ring = {
  /** 0 to 1; values outside are clamped. */
  progress: number;
  color?: ColorKey;
  trackColor?: ColorKey;
};

export type ProgressRingProps = {
  /** Outermost first. Inner rings start drawing motion.ring.innerDelay ms after the one outside them. */
  rings: Ring[];
  size?: number;
  strokeWidth?: number;
  /** Space between concentric rings. */
  gap?: number;
  /** Shown in the middle, e.g. "−4.2 / kg de 7 kg". */
  children?: ReactNode;
  accessibilityLabel?: string;
};

/** One or more concentric progress rings that draw in on mount (Inicio, Comidas). */
export function ProgressRing({
  rings,
  size = 180,
  strokeWidth = 14,
  gap = 8,
  children,
  accessibilityLabel,
}: ProgressRingProps) {
  const defaults: [ColorKey, ColorKey][] = [
    ['primary', 'primaryTint'],
    ['accent', 'accentTrack'],
  ];
  return (
    <Box
      width={size}
      height={size}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {rings.map((ring, i) => {
          const [color, track] = defaults[i % defaults.length]!;
          const radius = size / 2 - strokeWidth / 2 - i * (strokeWidth + gap);
          if (radius <= 0) return null;
          return (
            <RingArc
              key={i}
              size={size}
              radius={radius}
              strokeWidth={i === 0 ? strokeWidth : strokeWidth * 0.75}
              progress={ring.progress}
              color={ring.color ?? color}
              trackColor={ring.trackColor ?? track}
              delay={i * motion.ring.innerDelay}
            />
          );
        })}
      </Svg>
      {children ? (
        <Box
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          alignItems="center"
          justifyContent="center"
        >
          {children}
        </Box>
      ) : null}
    </Box>
  );
}

function RingArc(props: {
  size: number;
  radius: number;
  strokeWidth: number;
  progress: number;
  color: ColorKey;
  trackColor: ColorKey;
  delay: number;
}) {
  const { colors } = useAppTheme();
  const reduced = useReducedMotion();
  const circumference = 2 * Math.PI * props.radius;
  const target = Math.min(Math.max(props.progress, 0), 1);
  const drawn = useSharedValue(reduced ? target : 0);

  useEffect(() => {
    drawn.value = reduced
      ? target
      : withDelay(
          props.delay,
          withTiming(target, {
            duration: motion.ring.duration,
            easing: Easing.bezier(0.2, 0.8, 0.2, 1),
          }),
        );
  }, [drawn, props.delay, reduced, target]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - drawn.value),
  }));
  const c = props.size / 2;
  return (
    <>
      <Circle
        cx={c}
        cy={c}
        r={props.radius}
        stroke={colors[props.trackColor]}
        strokeWidth={props.strokeWidth}
        fill="none"
      />
      <AnimatedCircle
        cx={c}
        cy={c}
        r={props.radius}
        stroke={colors[props.color]}
        strokeWidth={props.strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${circumference} ${circumference}`}
        animatedProps={animatedProps}
        fill="none"
        transform={`rotate(-90 ${c} ${c})`}
      />
    </>
  );
}
