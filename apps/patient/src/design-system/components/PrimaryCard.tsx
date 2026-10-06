import { Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { usePressScale } from '../motion';
import { Box, CardBox, Text } from '../restyle';
import { Entering } from './Entering';
import { Icon } from './Icon';

export type PrimaryCardProps = {
  /** The small line on top, e.g. "Siguiente comida · 14:00". */
  caption: string;
  title: string;
  onPress?: () => void;
  delay?: number;
};

/** The brand-colored call to action (Inicio's next meal). Tappable, with a chevron. */
export function PrimaryCard({ caption, title, onPress, delay }: PrimaryCardProps) {
  const press = usePressScale();
  return (
    <Entering delay={delay}>
      <Pressable
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        disabled={!onPress}
        accessibilityRole="button"
        accessibilityLabel={`${caption}. ${title}`}
      >
        <Animated.View style={press.style}>
          <CardBox
            variant="primary"
            borderRadius="m"
            paddingHorizontal="l"
            paddingVertical="l"
            flexDirection="row"
            alignItems="center"
            justifyContent="space-between"
            gap="m"
          >
            <Box flexShrink={1} gap="xs">
              <Text variant="label" color="onPrimary" opacity={0.9}>
                {caption}
              </Text>
              <Text variant="h2" color="onPrimary" numberOfLines={2}>
                {title}
              </Text>
            </Box>
            {onPress ? <Icon name="chevronRight" color="onPrimary" /> : null}
          </CardBox>
        </Animated.View>
      </Pressable>
    </Entering>
  );
}
