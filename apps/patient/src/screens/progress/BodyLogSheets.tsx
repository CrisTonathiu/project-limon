import { BodyMeasurement } from '@limon/types';
import type { BodyLogInput } from '@limon/validation';
import { useEffect, useState } from 'react';
import {
  BottomSheet,
  Box,
  Button,
  RoundButton,
  Text,
  TextField,
} from '../../design-system';
import {
  emptyMeasurementForm,
  fieldError,
  MEASUREMENT_FIELDS,
  measurementsInput,
  measurementsValid,
  parseDecimal,
  stepWeight,
  toFieldText,
  type MeasurementForm,
} from '../../features/progress/body-log-form';
import { t } from '../../i18n/es-MX';

type SheetProps<T> = {
  visible: boolean;
  onClose: () => void;
  /** Resolves once saved (the sheet then closes); rejects to show the error and stay open. */
  onSave: (value: T) => Promise<void>;
};

/** Saves, keeping the sheet open with a message if it fails. */
function useSave<T>({ onSave, onClose }: SheetProps<T>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (value: T) => {
    setBusy(true);
    setError(null);
    try {
      await onSave(value);
      onClose();
    } catch (err) {
      console.error('[progress] saving the log failed', err);
      setError(t.progress.saveError);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, save };
}

/** "Registrar peso": today's weight, typed or nudged by 0.1 kg, starting from the current one. */
export function WeighInSheet(props: SheetProps<number> & { currentKg: number }) {
  const [text, setText] = useState(toFieldText(props.currentKg));
  const { busy, error, setError, save } = useSave(props);
  // Every opening starts again from the current weight.
  useEffect(() => {
    if (props.visible) {
      setText(toFieldText(props.currentKg));
      setError(null);
    }
  }, [props.visible, props.currentKg]);

  const invalid = fieldError('weightKg', text);
  return (
    <BottomSheet
      visible={props.visible}
      onClose={props.onClose}
      title={t.progress.weighInTitle}
      subtitle={t.progress.weighInSubtitle}
      closeLabel={t.common.close}
      footer={
        <Button
          label={t.progress.save}
          busy={busy}
          disabled={!!invalid}
          onPress={() => save(parseDecimal(text)!)}
        />
      }
    >
      <Box flexDirection="row" alignItems="center" gap="s" paddingVertical="s">
        <RoundButton
          icon="minus"
          background="none"
          accessibilityLabel={t.progress.weighInLess}
          onPress={() => setText((v) => stepWeight(v, -0.1, props.currentKg))}
        />
        <Box flex={1}>
          <TextField
            value={text}
            onChangeText={setText}
            placeholder={t.progress.weight}
            keyboardType="decimal-pad"
            suffix="kg"
            tone="background"
          />
        </Box>
        <RoundButton
          icon="plus"
          background="none"
          accessibilityLabel={t.progress.weighInMore}
          onPress={() => setText((v) => stepWeight(v, 0.1, props.currentKg))}
        />
      </Box>
      {invalid || error ? (
        <Text variant="label" color="danger">
          {invalid ?? error}
        </Text>
      ) : null}
    </BottomSheet>
  );
}

/** "Registrar medidas": today's measurements; only the ones filled in are saved. */
export function MeasurementsSheet(props: SheetProps<BodyLogInput>) {
  const [form, setForm] = useState<MeasurementForm>(emptyMeasurementForm);
  const { busy, error, setError, save } = useSave(props);
  useEffect(() => {
    if (props.visible) {
      setForm(emptyMeasurementForm);
      setError(null);
    }
  }, [props.visible]);

  const firstError = MEASUREMENT_FIELDS.map((m) => fieldError(m, form[m])).find((e) => e);
  return (
    <BottomSheet
      visible={props.visible}
      onClose={props.onClose}
      title={t.progress.measurementsTitle}
      subtitle={t.progress.measurementsSubtitle}
      closeLabel={t.common.close}
      footer={
        <Button
          label={t.progress.save}
          busy={busy}
          disabled={!measurementsValid(form)}
          onPress={() => save(measurementsInput(form))}
        />
      }
    >
      <Box flexDirection="row" flexWrap="wrap" gap="s" paddingVertical="xs">
        {MEASUREMENT_FIELDS.map((m) => (
          <Box key={m} width="48%" gap="xs">
            <Text variant="caption">{t.progress.measurements[m]}</Text>
            <TextField
              value={form[m]}
              onChangeText={(text) => setForm((f) => ({ ...f, [m]: text }))}
              placeholder={t.progress.measurements[m]}
              keyboardType="decimal-pad"
              suffix={
                m === BodyMeasurement.BODY_FAT_PCT
                  ? t.progress.measurementUnit.pct
                  : t.progress.measurementUnit.cm
              }
              tone="background"
            />
          </Box>
        ))}
      </Box>
      {firstError || error ? (
        <Text variant="label" color="danger">
          {firstError ?? error}
        </Text>
      ) : null}
    </BottomSheet>
  );
}
