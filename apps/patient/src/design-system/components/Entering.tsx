import type { ReactNode } from 'react';
import Animated from 'react-native-reanimated';
import { useEntrance } from '../motion';

type EnteringProps = { delay?: number; children: ReactNode };

/** Runs the shared entrance on its children; with no `delay`, renders them as they are. */
export function Entering({ delay, children }: EnteringProps) {
  if (delay === undefined) return <>{children}</>;
  return <Rising delay={delay}>{children}</Rising>;
}

function Rising({ delay, children }: EnteringProps & { delay: number }) {
  const entrance = useEntrance(delay);
  return <Animated.View style={entrance}>{children}</Animated.View>;
}
