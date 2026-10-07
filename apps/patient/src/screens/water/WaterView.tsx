import type { WaterResponse, WaterTodayDto } from '@limon/types';
import { Pressable } from 'react-native';
import {
  Box,
  Card,
  DetailBody,
  DetailHeader,
  Entering,
  Icon,
  LoadState,
  ProgressRing,
  RoundButton,
  ScreenScroll,
  SegmentedControl,
  Text,
  type LoadStateProps,
} from '../../design-system';
import { isPendingIntake, waterProgress } from '../../features/water/water';
import { t } from '../../i18n/es-MX';
import { formatDate, formatLiters, formatMl } from '../../i18n/format';

export type HistoryDays = 7 | 30;

export type WaterViewProps = {
  /** Null while it loads, or after it failed to (see `status`). */
  water: (WaterTodayDto & { history: WaterResponse['history'] }) | null;
  status: LoadStateProps | null;
  days: HistoryDays;
  onChangeDays: (days: HistoryDays) => void;
  /** The quick-add amounts, in ml. */
  quickAdd: number[];
  onAdd: (amountMl: number) => void;
  onOpenOther: () => void;
  onRemove: (intakeId: string) => void;
  onOpenTarget: () => void;
  onBack: () => void;
};

/** The water screen: today's ring and quick add, today's glasses, the history and the target. */
export function WaterView(props: WaterViewProps) {
  let order = 1;
  const next = () => order++ * 80;
  const water = props.water;
  return (
    <ScreenScroll bleed>
      <DetailHeader
        title={t.water.title}
        caption={t.water.today}
        backLabel={t.common.back}
        onBack={props.onBack}
        delay={0}
      />
      <DetailBody>
        {props.status ? <LoadState {...props.status} /> : null}
        {water ? (
          <>
            <TodayCard
              water={water}
              quickAdd={props.quickAdd}
              onAdd={props.onAdd}
              onOpenOther={props.onOpenOther}
              delay={next()}
            />
            <IntakeList water={water} onRemove={props.onRemove} delay={next()} />
            <HistoryCard water={water} days={props.days} onChangeDays={props.onChangeDays} delay={next()} />
            <TargetCard water={water} onOpenTarget={props.onOpenTarget} delay={next()} />
          </>
        ) : null}
      </DetailBody>
    </ScreenScroll>
  );
}

function Pill({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}>
      <Box minHeight={44} paddingHorizontal="m" borderRadius="pill" backgroundColor="primaryTint" justifyContent="center">
        <Text variant="chip" fontSize={14} color="primary">
          {label}
        </Text>
      </Box>
    </Pressable>
  );
}

function TodayCard({
  water,
  quickAdd,
  onAdd,
  onOpenOther,
  delay,
}: Pick<WaterViewProps, 'quickAdd' | 'onAdd' | 'onOpenOther'> & { water: WaterTodayDto; delay: number }) {
  const drunk = formatLiters(water.totalMl);
  const target = formatLiters(water.targetMl);
  return (
    <Card variant="hero" padding="l" delay={delay} gap="m" alignItems="center">
      <ProgressRing
        size={168}
        strokeWidth={12}
        rings={[{ progress: waterProgress(water) }]}
        accessibilityLabel={t.water.ringA11y(drunk, target)}
      >
        <Icon name="water" color="primary" />
        <Text variant="numberXL">{drunk}</Text>
        <Text variant="label">{t.water.ofTarget(target)}</Text>
      </ProgressRing>
      {water.totalMl >= water.targetMl ? (
        <Text variant="bodyStrong" color="primary">
          {t.water.reached}
        </Text>
      ) : null}
      <Box flexDirection="row" flexWrap="wrap" justifyContent="center" gap="s">
        {quickAdd.map((ml) => (
          <Pill key={ml} label={t.water.add(formatMl(ml))} accessibilityLabel={t.water.addA11y(formatMl(ml))} onPress={() => onAdd(ml)} />
        ))}
        <Pill label={t.water.other} onPress={onOpenOther} />
      </Box>
    </Card>
  );
}

function IntakeList({ water, onRemove, delay }: { water: WaterTodayDto; onRemove: (id: string) => void; delay: number }) {
  return (
    <Card borderRadius="l" delay={delay} gap="xs">
      <Text variant="h2">{t.water.today}</Text>
      {water.intakes.length === 0 ? (
        <Text variant="body" color="textMuted">
          {t.water.noIntakes}
        </Text>
      ) : (
        water.intakes.map((intake) => {
          const amount = formatMl(intake.amountMl);
          const time = formatDate(new Date(intake.createdAt), 'time');
          return (
            <Box key={intake.id} flexDirection="row" alignItems="center" justifyContent="space-between" minHeight={44}>
              <Text variant="body">{t.water.intake(amount, time)}</Text>
              {/* A glass still being saved has no id to remove yet. */}
              {isPendingIntake(intake.id) ? null : (
                <RoundButton
                  icon="trash"
                  background="none"
                  accessibilityLabel={t.water.removeA11y(amount, time)}
                  onPress={() => onRemove(intake.id)}
                />
              )}
            </Box>
          );
        })
      )}
    </Card>
  );
}

const BAR_HEIGHT = 96;

function HistoryCard({
  water,
  days,
  onChangeDays,
  delay,
}: {
  water: NonNullable<WaterViewProps['water']>;
  days: HistoryDays;
  onChangeDays: (days: HistoryDays) => void;
  delay: number;
}) {
  const history = water.history;
  // The target sits at the same height on every bar; a bigger day sets the scale instead.
  const scale = Math.max(water.targetMl, ...history.map((d) => d.totalMl));
  const met = history.filter((d) => d.totalMl >= water.targetMl).length;
  return (
    <Entering delay={delay}>
      <Card borderRadius="l" gap="s">
        <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap="s">
          <Text variant="h2">{t.water.history}</Text>
          <SegmentedControl
            accessibilityLabel={t.water.historyPeriod}
            value={String(days) as '7' | '30'}
            onChange={(key) => onChangeDays(Number(key) as HistoryDays)}
            options={([7, 30] as const).map((d) => ({ key: String(d) as '7' | '30', label: t.water.historyDays[d] }))}
          />
        </Box>
        <Box
          flexDirection="row"
          alignItems="flex-end"
          justifyContent="space-between"
          height={BAR_HEIGHT}
          columnGap="xs"
          accessible
          accessibilityLabel={t.water.historyA11y(history.length, met)}
        >
          {history.map((d) => (
            <Box
              key={d.date}
              // Capsules for a week; thin bars so a month fits a phone.
              width={days === 7 ? 20 : undefined}
              flex={days === 7 ? undefined : 1}
              borderRadius="pill"
              backgroundColor={d.totalMl >= water.targetMl ? 'primary' : 'primaryTint'}
              style={{ height: Math.max(6, (d.totalMl / scale) * BAR_HEIGHT) }}
            />
          ))}
        </Box>
        <Box flexDirection="row" justifyContent="space-between">
          <Text variant="caption" fontSize={11}>
            {history[0] ? formatDate(history[0].date, 'dayMonth') : ''}
          </Text>
          <Text variant="caption" fontSize={11}>
            {t.progress.today}
          </Text>
        </Box>
      </Card>
    </Entering>
  );
}

function TargetCard({ water, onOpenTarget, delay }: { water: WaterTodayDto; onOpenTarget: () => void; delay: number }) {
  return (
    <Card borderRadius="m" delay={delay} flexDirection="row" alignItems="center" gap="m">
      <Box flex={1}>
        <Text variant="caption">{t.water.target}</Text>
        <Text variant="number">{formatLiters(water.targetMl)}</Text>
        <Text variant="caption">{water.customTarget ? t.water.targetCustom : t.water.targetDefault}</Text>
      </Box>
      <Pill label={t.water.changeTarget} onPress={onOpenTarget} />
    </Card>
  );
}
