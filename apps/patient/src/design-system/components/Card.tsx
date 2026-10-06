import type { ComponentProps } from 'react';
import Animated from 'react-native-reanimated';
import { useEntrance } from '../motion';
import { CardBox } from '../restyle';

export type CardProps = ComponentProps<typeof CardBox> & {
  /** Entrance delay in ms; leave it out for a card that doesn't animate in. */
  delay?: number;
};

/** A surface for grouped content. `variant`: defaults, hero, tile, primary or tint. */
export function Card({ delay, ...rest }: CardProps) {
  if (delay === undefined) return <CardBox {...rest} />;
  return <EnteringCard delay={delay} {...rest} />;
}

function EnteringCard({ delay, ...rest }: CardProps & { delay: number }) {
  const entrance = useEntrance(delay);
  return (
    <Animated.View style={entrance}>
      <CardBox {...rest} />
    </Animated.View>
  );
}
