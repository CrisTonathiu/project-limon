import type { WaterResponse, WaterTodayDto } from '@limon/types';
import { WATER_LIMITS } from '@limon/validation';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { BottomSheet, Box, Button, RoundButton, Text, TextField } from '../../design-system';
import { parseIntakeMl, stepTarget, withIntake, withoutIntake } from '../../features/water/water';
import { t } from '../../i18n/es-MX';
import { formatLiters, formatNumber } from '../../i18n/format';
import type { AppStackParamList } from '../../navigation/types';
import { api } from '../../services/api';
import { WaterView, type HistoryDays } from './WaterView';

const QUICK_ADD_ML = [250, 500];
const TARGET_STEP_ML = 250;

type Water = WaterTodayDto & { history: WaterResponse['history'] };

/** Today's water against the target: glasses are added and undone optimistically. */
export function WaterScreen({ navigation }: NativeStackScreenProps<AppStackParamList, 'Water'>) {
  const [days, setDays] = useState<HistoryDays>(7);
  const [water, setWater] = useState<Water | null>(null);
  const [failed, setFailed] = useState(false);
  const [sheet, setSheet] = useState<'other' | 'target' | null>(null);

  const load = useCallback((d: HistoryDays) => {
    setFailed(false);
    api.water
      .get(d)
      .then(setWater)
      .catch((err) => {
        console.error('[water] loading failed', err);
        setFailed(true);
      });
  }, []);
  useEffect(() => load(days), [load, days]);

  /** Applies a server answer for today, keeping the loaded history (its last day is today). */
  const applyToday = (today: WaterTodayDto) =>
    setWater((w) =>
      w && {
        ...today,
        history: w.history.map((d) => (d.date === today.date ? { ...d, totalMl: today.totalMl } : d)),
      },
    );

  /** Shows `optimistic` right away; rolls back if the request fails. */
  const mutate = (optimistic: (today: WaterTodayDto) => WaterTodayDto, request: () => Promise<WaterTodayDto>) => {
    if (!water) return Promise.resolve();
    const before = water;
    applyToday(optimistic(water));
    return request()
      .then(applyToday)
      .catch((err) => {
        console.error('[water] saving failed', err);
        setWater(before);
        Alert.alert(t.water.error);
        throw err;
      });
  };

  const add = (ml: number) => mutate((w) => withIntake(w, ml), () => api.water.add(ml)).catch(() => {});
  const remove = (id: string) => mutate((w) => withoutIntake(w, id), () => api.water.remove(id)).catch(() => {});

  return (
    <>
      <WaterView
        water={water}
        status={
          failed && !water
            ? { status: 'failed', message: t.water.loadError, retryLabel: t.common.retry, onRetry: () => load(days) }
            : !water
              ? { status: 'loading' }
              : null
        }
        days={days}
        onChangeDays={setDays}
        quickAdd={QUICK_ADD_ML}
        onAdd={add}
        onOpenOther={() => setSheet('other')}
        onRemove={remove}
        onOpenTarget={() => setSheet('target')}
        onBack={() => navigation.goBack()}
      />
      <OtherAmountSheet
        visible={sheet === 'other'}
        onClose={() => setSheet(null)}
        onAdd={(ml) => {
          setSheet(null);
          add(ml);
        }}
      />
      {water ? (
        <TargetSheet
          visible={sheet === 'target'}
          water={water}
          onClose={() => setSheet(null)}
          onSave={(targetMl) => api.water.setTarget(targetMl).then(applyToday)}
        />
      ) : null}
    </>
  );
}

function OtherAmountSheet({ visible, onClose, onAdd }: { visible: boolean; onClose: () => void; onAdd: (ml: number) => void }) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (visible) setText('');
  }, [visible]);
  const ml = parseIntakeMl(text);
  const { min, max } = WATER_LIMITS.intakeMl;
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t.water.otherTitle}
      closeLabel={t.common.close}
      footer={<Button label={t.water.addButton} disabled={ml === null} onPress={() => onAdd(ml!)} />}
    >
      <TextField
        value={text}
        onChangeText={setText}
        placeholder={t.water.otherPlaceholder}
        keyboardType="number-pad"
        suffix="ml"
        maxLength={4}
        tone="background"
      />
      {text.trim() && ml === null ? (
        <Text variant="label" color="danger">
          {t.water.otherInvalid(formatNumber(min), formatNumber(max))}
        </Text>
      ) : null}
    </BottomSheet>
  );
}

function TargetSheet({
  visible,
  water,
  onClose,
  onSave,
}: {
  visible: boolean;
  water: WaterTodayDto;
  onClose: () => void;
  onSave: (targetMl: number | null) => Promise<void>;
}) {
  const [targetMl, setTargetMl] = useState(water.targetMl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (visible) {
      setTargetMl(water.targetMl);
      setError(false);
    }
  }, [visible, water.targetMl]);

  const save = (value: number | null) => {
    setBusy(true);
    setError(false);
    onSave(value)
      .then(onClose)
      .catch((err) => {
        console.error('[water] saving the target failed', err);
        setError(true);
      })
      .finally(() => setBusy(false));
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t.water.targetTitle}
      subtitle={t.water.targetDefault}
      closeLabel={t.common.close}
      footer={
        <Box gap="s">
          <Button label={t.progress.save} busy={busy} onPress={() => save(targetMl)} />
          {water.customTarget ? (
            <Button
              variant="outline"
              label={t.water.useDefault(formatLiters(water.defaultTargetMl))}
              disabled={busy}
              onPress={() => save(null)}
            />
          ) : null}
        </Box>
      }
    >
      <Box flexDirection="row" alignItems="center" justifyContent="space-between" paddingVertical="m">
        <RoundButton
          icon="minus"
          background="none"
          accessibilityLabel={t.water.targetLess}
          onPress={() => setTargetMl((ml) => stepTarget(ml, -TARGET_STEP_ML))}
        />
        <Text variant="numberXL" accessibilityLiveRegion="polite">
          {formatLiters(targetMl)}
        </Text>
        <RoundButton
          icon="plus"
          background="none"
          accessibilityLabel={t.water.targetMore}
          onPress={() => setTargetMl((ml) => stepTarget(ml, TARGET_STEP_ML))}
        />
      </Box>
      {error ? (
        <Text variant="label" color="danger">
          {t.water.error}
        </Text>
      ) : null}
    </BottomSheet>
  );
}
