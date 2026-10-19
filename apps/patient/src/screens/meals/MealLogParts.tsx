import type { MealLogDto, MealLogStatus } from '@limon/types';
import { useEffect, useRef, useState } from 'react';
import { Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {
  BottomSheet,
  Box,
  Button,
  Icon,
  motion,
  SheetOption,
  Text,
  TextField,
  type AppTheme,
  type IconName,
} from '../../design-system';
import { t } from '../../i18n/es-MX';

/** Max length of the "what did you eat" note; the API checks it too. */
const NOTE_MAX = 140;

type Colors = keyof AppTheme['colors'];

/** How each answer looks on its tile: ✓ in the brand color, ≈ in the accent, – muted. */
const LOOK: Record<MealLogStatus, { icon: IconName; bg: Colors; fg: Colors }> = {
  EATEN: { icon: 'check', bg: 'primary', fg: 'onPrimary' },
  OTHER: { icon: 'other', bg: 'accentTrack', fg: 'accentText' },
  SKIPPED: { icon: 'minus', bg: 'track', fg: 'textMuted' },
};

export type LogTileProps = {
  status: MealLogStatus | null;
  /** Today or yesterday: the tile is the check-off button. Otherwise it only shows the answer. */
  loggable: boolean;
  accessibilityLabel: string;
  onPress?: () => void;
};

/**
 * The meal card's 44 px tile. A meal that can be checked off shows an empty ring until
 * answered; an answer shows its mark, which pops (like the heart) when it changes.
 */
export function LogTile({ status, loggable, accessibilityLabel, onPress }: LogTileProps) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const was = useRef(status);
  useEffect(() => {
    if (status && status !== was.current && !reduced) {
      const half = { duration: motion.heart.duration / 2 };
      scale.value = withSequence(withTiming(motion.heart.scale, half), withTiming(1, half));
    }
    was.current = status;
  }, [status, reduced, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const look = status ? LOOK[status] : null;
  const tile = (
    <Animated.View style={style}>
      <Box
        width={44}
        height={44}
        borderRadius="s"
        backgroundColor={look?.bg ?? 'primaryTint'}
        alignItems="center"
        justifyContent="center"
      >
        {look ? (
          <Icon name={look.icon} color={look.fg} strokeWidth={2.4} />
        ) : loggable ? (
          <Box width={22} height={22} borderRadius="pill" borderWidth={2} borderColor="primary" />
        ) : (
          <Icon name="meals" color="primary" />
        )}
      </Box>
    </Animated.View>
  );
  if (!loggable || !onPress) return tile;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
    >
      {tile}
    </Pressable>
  );
}

export type MealLogTarget = {
  /** "Desayuno" */
  label: string;
  /** False for a slot with no recipe: only "something else" can be answered. */
  hasRecipe: boolean;
  log: MealLogDto | null;
};

export type MealLogSheetProps = {
  /** The meal being answered, or null when the sheet is closed. */
  meal: MealLogTarget | null;
  onSave: (status: MealLogStatus, note: string | null) => void;
  onClear: () => void;
  onClose: () => void;
};

/**
 * "¿Comiste tu desayuno?": eaten and skipped save at once; "something else" opens an
 * optional note first. An answered meal can also be cleared.
 */
export function MealLogSheet({ meal: current, onSave, onClear, onClose }: MealLogSheetProps) {
  // The sheet keeps showing its last contents while it slides away.
  const last = useRef(current);
  if (current) last.current = current;
  const meal = current ?? last.current;

  const [other, setOther] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!current) return;
    setOther(current.log?.status === 'OTHER' || !current.hasRecipe);
    setNote(current.log?.note ?? '');
  }, [current]);

  const options: MealLogStatus[] = meal?.hasRecipe ? ['EATEN', 'OTHER', 'SKIPPED'] : ['OTHER'];
  return (
    <BottomSheet
      visible={current !== null}
      onClose={onClose}
      title={meal ? t.mealLog.question(meal.label) : ''}
      subtitle={meal?.hasRecipe ? t.mealLog.subtitle : t.mealLog.noRecipe}
      closeLabel={t.common.close}
      footer={
        other || meal?.log ? (
          <Box gap="s">
            {other ? (
              <Button label={t.mealLog.save} onPress={() => onSave('OTHER', note.trim() || null)} />
            ) : null}
            {meal?.log ? (
              <Button variant="outline" label={t.mealLog.clear} onPress={onClear} />
            ) : null}
          </Box>
        ) : null
      }
    >
      {options.map((status) => (
        <SheetOption
          key={status}
          label={t.mealLog.options[status]}
          selected={status === 'OTHER' ? other : !other && meal?.log?.status === status}
          onPress={() => {
            if (status === 'OTHER') setOther(true);
            else onSave(status, null);
          }}
        />
      ))}
      {other ? (
        <TextField
          value={note}
          onChangeText={setNote}
          placeholder={t.mealLog.notePlaceholder}
          maxLength={NOTE_MAX}
          tone="background"
        />
      ) : null}
      {other && note.length > NOTE_MAX - 20 ? (
        <Text variant="caption" textAlign="right">
          {`${note.length}/${NOTE_MAX}`}
        </Text>
      ) : null}
    </BottomSheet>
  );
}
