import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { Box, Text, useAppTheme } from '../restyle';
import { motion } from '../theme';

export type BottomSheetProps = {
  visible: boolean;
  /** Backdrop tap, Android back. */
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Read by screen readers for the backdrop, e.g. "Cerrar". */
  closeLabel: string;
  children: ReactNode;
  /** Kept below the scrolling content, e.g. the confirm button. */
  footer?: ReactNode;
};

/** A sheet that springs up from the bottom (with a slight overshoot) over a dimmed backdrop. */
export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  closeLabel,
  children,
  footer,
}: BottomSheetProps) {
  const { colors } = useAppTheme();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  // Stays mounted while the closing animation runs.
  const [mounted, setMounted] = useState(visible);
  const offset = useSharedValue(height);
  const dim = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      if (reduced) {
        offset.value = 0;
        dim.value = motion.sheet.backdrop;
        return;
      }
      offset.value = height;
      offset.value = withSequence(
        withTiming(-motion.sheet.overshoot, {
          duration: motion.sheet.duration * 0.7,
          easing: Easing.out(Easing.cubic),
        }),
        withTiming(0, { duration: motion.sheet.duration * 0.3 }),
      );
      dim.value = withTiming(motion.sheet.backdrop, { duration: 300 });
    } else if (mounted) {
      if (reduced) {
        setMounted(false);
        return;
      }
      dim.value = withTiming(0, { duration: 200 });
      offset.value = withTiming(
        height,
        { duration: 240, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) scheduleOnRN(setMounted, false);
        },
      );
    }
    // `mounted` is read, not watched: only `visible` drives the animation.
  }, [visible, reduced, height]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: dim.value }));

  return (
    <Modal
      transparent
      visible={mounted}
      onRequestClose={onClose}
      statusBarTranslucent
      animationType="none"
    >
      <Box flex={1} justifyContent="flex-end">
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: colors.text,
            },
            backdropStyle,
          ]}
        >
          <Pressable
            style={{ flex: 1 }}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
          />
        </Animated.View>
        <Animated.View style={sheetStyle} accessibilityViewIsModal>
          <Box
            backgroundColor="surface"
            borderTopLeftRadius="xl"
            borderTopRightRadius="xl"
            paddingHorizontal="xl"
            paddingTop="m"
            gap="s"
            style={{ paddingBottom: Math.max(insets.bottom, 24), maxHeight: height * 0.85 }}
          >
            <Box
              alignSelf="center"
              width={40}
              height={5}
              borderRadius="pill"
              backgroundColor="handle"
            />
            <Box gap="xs">
              <Text variant="h2" accessibilityRole="header">
                {title}
              </Text>
              {subtitle ? <Text variant="label">{subtitle}</Text> : null}
            </Box>
            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 4 }}>
              {children}
            </ScrollView>
            {footer ? <Box marginTop="xs">{footer}</Box> : null}
          </Box>
        </Animated.View>
      </Box>
    </Modal>
  );
}

export type SheetOptionProps = {
  label: string;
  /** Shown on the right, e.g. "90 g". */
  detail?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
};

/** One choice in a sheet: a radio dot, the label and a detail. The selected one is tinted. */
export function SheetOption({ label, detail, selected, onPress, disabled }: SheetOptionProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: !!disabled }}
    >
      <Box
        flexDirection="row"
        alignItems="center"
        gap="m"
        minHeight={52}
        paddingHorizontal="xs"
        borderRadius="s"
        backgroundColor={selected ? 'primaryTint' : undefined}
        opacity={disabled ? 0.6 : 1}
      >
        <Box
          width={22}
          height={22}
          borderRadius="pill"
          borderWidth={selected ? 7 : 2}
          borderColor={selected ? 'primary' : 'control'}
        />
        <Box flex={1}>
          <Text variant="bodyStrong">{label}</Text>
        </Box>
        {detail ? (
          <Text variant="label" fontSize={14}>
            {detail}
          </Text>
        ) : null}
      </Box>
    </Pressable>
  );
}
