import { Pressable } from 'react-native';
import {
  Box,
  Button,
  Card,
  Entering,
  fonts,
  Icon,
  ProgressBar,
  ScreenHeader,
  ScreenScroll,
  SegmentedControl,
  Sparkline,
  Text,
} from '../../design-system';
import { goalProgress } from '../../features/progress/goal';
import { t } from '../../i18n/es-MX';
import { formatKg, formatLiters, formatPercent } from '../../i18n/format';

export type Period = 'weeks8' | 'months3' | 'all';

export type ProgresoData = {
  /** Works for gain goals too: progress is measured from start towards target. */
  goal: {
    startKg: number;
    targetKg: number;
    currentKg: number;
    /** "18 ago" */ startedOn: string;
  } | null;
  /** The weigh-ins for the chosen period, oldest first, with three axis labels (start, middle, today). */
  weight: { currentKg: number; valuesKg: number[]; axis: [string, string, string] } | null;
  /** Three tiles, e.g. waist, hip and body fat; `change` is preformatted ("−3 cm"). */
  measurements: { label: string; value: string; change: string | null }[] | null;
  water: { drunkMl: number; goalMl: number } | null;
};

export type ProgresoViewProps = ProgresoData & {
  period: Period;
  onChangePeriod?: (period: Period) => void;
  /** Leave out until weigh-ins can be saved. */
  onLogWeight?: () => void;
  onAddWater?: () => void;
  /**
   * The patient's goal (goal setting): what they're working toward and the starting target,
   * explained. Leave out when the clinic has no goal tracker or while it loads.
   */
  plan?:
    | { status: 'unset'; onSet: () => void }
    | { status: 'set'; intention: string; paragraphs: string[]; onChange: () => void }
    | null;
};

/**
 * Progreso (docs/ui/mockups/06-progreso.html): the weight goal, the weight chart, weigh-in,
 * measurements and water. Blocks without data are left out; with none at all, a "coming
 * soon" card stands in until the goal and water trackers ship.
 */
export function ProgresoView(props: ProgresoViewProps) {
  let order = 1;
  const next = () => order++ * 80;
  // Weigh-ins, measurements and water have no API yet; the goal (plan) does.
  const empty = !props.goal && !props.weight && !props.measurements && !props.water;
  return (
    <ScreenScroll>
      <ScreenHeader title={t.progress.title} delay={0} />
      {props.plan ? <PlanCard plan={props.plan} delay={next()} /> : null}
      {empty ? (
        <Card variant="tint" delay={next()} gap="s">
          <Icon name="progress" color="primary" />
          <Text variant="h2">{t.progress.soonTitle}</Text>
          <Text variant="body" color="textOnTint">
            {t.progress.soonBody}
          </Text>
        </Card>
      ) : null}
      {props.goal ? <GoalCard goal={props.goal} delay={next()} /> : null}
      {props.weight ? <WeightCard {...props} weight={props.weight} delay={next()} /> : null}
      {props.onLogWeight ? (
        <Entering delay={next()}>
          <Button icon="plus" label={t.progress.logWeight} onPress={props.onLogWeight} />
        </Entering>
      ) : null}
      {props.measurements ? (
        <Entering delay={next()}>
          <Box flexDirection="row" gap="s">
            {props.measurements.map((m) => (
              <Box
                key={m.label}
                flex={1}
                backgroundColor="surface"
                borderRadius="m"
                padding="m"
                gap="xs"
              >
                <Text variant="caption">{m.label}</Text>
                <Text variant="number" fontSize={20}>
                  {m.value}
                </Text>
                {m.change ? (
                  <Text variant="caption" fontFamily={fonts.bodyBold} color="primary">
                    {m.change}
                  </Text>
                ) : null}
              </Box>
            ))}
          </Box>
        </Entering>
      ) : null}
      {props.water ? (
        <WaterCard water={props.water} onAdd={props.onAddWater} delay={next()} />
      ) : null}
    </ScreenScroll>
  );
}

function GoalCard({ goal, delay }: { goal: NonNullable<ProgresoData['goal']>; delay: number }) {
  const progress = goalProgress(goal);
  const left = Math.abs(goal.targetKg - goal.currentKg);
  return (
    <Card variant="hero" padding="l" delay={delay} gap="s">
      <Box flexDirection="row" justifyContent="space-between" alignItems="baseline">
        <Text variant="h2" fontSize={18}>
          {t.progress.goal(formatKg(goal.targetKg))}
        </Text>
        <Text variant="label">
          {progress >= 1 ? t.progress.reached : t.progress.remaining(formatKg(left))}
        </Text>
      </Box>
      <ProgressBar progress={progress} height={12} trackColor="primaryTint" delay={delay + 220} />
      <Box flexDirection="row" justifyContent="space-between">
        <Text variant="caption">{t.progress.start(formatKg(goal.startKg), goal.startedOn)}</Text>
        <Text variant="caption">{formatPercent(Math.round(progress * 100) / 100)}</Text>
      </Box>
    </Card>
  );
}

function WeightCard({
  weight,
  period,
  onChangePeriod,
  delay,
}: ProgresoViewProps & { weight: NonNullable<ProgresoData['weight']>; delay: number }) {
  const first = weight.valuesKg[0];
  return (
    <Card borderRadius="l" delay={delay} gap="s">
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap="s">
        <Box>
          <Text variant="caption">{t.progress.weight}</Text>
          <Text variant="number">{formatKg(weight.currentKg)}</Text>
        </Box>
        <SegmentedControl
          accessibilityLabel={t.progress.period}
          value={period}
          onChange={(p) => onChangePeriod?.(p)}
          options={(Object.keys(t.progress.periods) as Period[]).map((key) => ({
            key,
            label: t.progress.periods[key],
          }))}
        />
      </Box>
      <Sparkline
        key={period}
        variant="chart"
        height={140}
        values={weight.valuesKg}
        delay={delay + 320}
        accessibilityLabel={
          first !== undefined
            ? t.progress.chartA11y(formatKg(first), formatKg(weight.currentKg))
            : undefined
        }
      />
      <Box flexDirection="row" justifyContent="space-between">
        {weight.axis.map((label) => (
          <Text key={label} variant="caption" fontSize={11}>
            {label}
          </Text>
        ))}
      </Box>
    </Card>
  );
}

function WaterCard({
  water,
  onAdd,
  delay,
}: {
  water: NonNullable<ProgresoData['water']>;
  onAdd?: () => void;
  delay: number;
}) {
  return (
    <Card
      borderRadius="m"
      delay={delay}
      paddingVertical="m"
      flexDirection="row"
      alignItems="center"
      gap="m"
    >
      <Box
        width={40}
        height={40}
        borderRadius="s"
        backgroundColor="primaryTint"
        alignItems="center"
        justifyContent="center"
      >
        <Icon name="water" color="primary" />
      </Box>
      <Box flex={1}>
        <Text variant="bodyStrong">{t.progress.water}</Text>
        <Text variant="caption">
          {t.progress.waterToday(formatLiters(water.drunkMl), formatLiters(water.goalMl))}
        </Text>
      </Box>
      {onAdd ? (
        <Pressable
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel={t.progress.addWaterA11y}
          hitSlop={{ top: 2, bottom: 2 }}
        >
          <Box
            minHeight={40}
            paddingHorizontal="m"
            borderRadius="pill"
            backgroundColor="primaryTint"
            justifyContent="center"
          >
            <Text variant="chip" fontSize={14} color="primary">
              {t.progress.addWater}
            </Text>
          </Box>
        </Pressable>
      ) : null}
    </Card>
  );
}

function PlanCard({
  plan,
  delay,
}: {
  plan: NonNullable<ProgresoViewProps['plan']>;
  delay: number;
}) {
  if (plan.status === 'unset') {
    return (
      <Card variant="hero" padding="l" delay={delay} gap="m">
        <Text variant="h2">{t.goals.setTitle}</Text>
        <Text variant="body" color="textMuted">
          {t.goals.setBody}
        </Text>
        <Button label={t.goals.setButton} onPress={plan.onSet} />
      </Card>
    );
  }
  return (
    <Card variant="hero" padding="l" delay={delay} gap="m">
      <Box gap="xs">
        <Text variant="caption">{t.goals.cardTitle}</Text>
        <Text variant="h2">{plan.intention}</Text>
      </Box>
      {plan.paragraphs.map((p) => (
        <Text key={p} variant="body" color="textMuted">
          {p}
        </Text>
      ))}
      <Button variant="outline" label={t.goals.change} onPress={plan.onChange} />
    </Card>
  );
}
