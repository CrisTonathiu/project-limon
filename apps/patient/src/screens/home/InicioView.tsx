import { Pressable, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import {
  Box,
  Card,
  fonts,
  Icon,
  motion,
  PrimaryCard,
  ProgressRing,
  ScreenHeader,
  ScreenScroll,
  Sparkline,
  StatTile,
  Text,
  useFlicker,
  type AppTheme,
  type Ring,
} from '../../design-system';
import { t } from '../../i18n/es-MX';
import {
  formatDayHeading,
  formatKcal,
  formatKg,
  formatNumber,
  formatPercent,
  formatSigned,
} from '../../i18n/format';

/** Everything Inicio shows. Each block is `null` when its module is off or its data isn't there yet, and is then left out. */
export type InicioData = {
  today: Date;
  /** Null until it loads, or when it can't: the greeting is then just "Hola". */
  firstName: string | null;
  /**
   * The outer ring: progress to the weight goal once the goal tracker ships, today's calories
   * until then. `changeKg` and `goalKg` are signed (a loss is negative), so gain goals work too.
   */
  ring:
    | { kind: 'weightGoal'; changeKg: number; goalKg: number }
    | { kind: 'calories'; eaten: number; target: number }
    | null;
  /** Share of this week's planned meals eaten (0 to 1), the inner ring. Needs meal check-off. */
  planAdherence: number | null;
  streakDays: number | null;
  mealsToday: { eaten: number; planned: number } | null;
  calories: { eaten: number; target: number } | null;
  /** Weekly weights, oldest first. */
  weight: { valuesKg: number[]; weeks: number } | null;
  /** `when` is a time ("14:00") or, while the plan has no times, the meal ("Cena"). */
  nextMeal: { when: string; title: string } | null;
};

export type InicioViewProps = InicioData & {
  onOpenProfile?: () => void;
  onOpenNextMeal?: () => void;
};

const RING_MAX = 180;
/** Hero card padding plus the legend's minimum width; the ring shrinks on narrow phones to keep it. */
const HERO_RESERVED = 24 * 2 + 16 * 2 + 16 + 112;

/** The home tab (docs/ui/mockups/01-inicio.html): progress first, then today, then what's next. */
export function InicioView(props: InicioViewProps) {
  // Blocks enter in reading order, motion.entrance.stagger apart; hidden blocks don't leave a gap.
  let order = 0;
  const next = () => order++ * motion.entrance.stagger;

  const tiles = [
    props.streakDays != null && {
      key: 'streak',
      icon: <Flame />,
      value: formatNumber(props.streakDays),
      label: props.streakDays === 1 ? t.home.streakOne : t.home.streakOther,
    },
    props.mealsToday && {
      key: 'meals',
      icon: <Icon name="meals" color="primary" />,
      value: `${props.mealsToday.eaten}/${props.mealsToday.planned}`,
      label: t.home.mealsToday,
    },
    // The ring already shows today's calories until the goal tracker ships.
    props.calories &&
      props.ring?.kind !== 'calories' && {
        key: 'kcal',
        icon: <Icon name="energy" color="primary" />,
        value: formatNumber(props.calories.eaten),
        label: t.home.ofKcal(formatKcal(props.calories.target)),
      },
  ].filter((tile) => !!tile);

  return (
    <ScreenScroll gap="l">
      <ScreenHeader
        caption={formatDayHeading(props.today)}
        title={props.firstName ? t.home.greeting(props.firstName) : t.home.greetingNoName}
        trailing={<Avatar name={props.firstName} onPress={props.onOpenProfile} />}
        delay={next()}
      />
      {props.ring ? (
        <Hero ring={props.ring} adherence={props.planAdherence} delay={next()} />
      ) : null}
      {tiles.length > 0 ? (
        <Box flexDirection="row" gap="s">
          {tiles.map(({ key, ...tile }) => (
            <Box key={key} flex={1}>
              <StatTile {...tile} delay={next()} />
            </Box>
          ))}
        </Box>
      ) : null}
      {props.weight && props.weight.valuesKg.length > 1 ? (
        <WeightCard {...props.weight} delay={next()} />
      ) : null}
      {props.nextMeal ? (
        <PrimaryCard
          caption={t.home.nextMeal(props.nextMeal.when)}
          title={props.nextMeal.title}
          onPress={props.onOpenNextMeal}
          delay={next()}
        />
      ) : null}
    </ScreenScroll>
  );
}

function Avatar({ name, onPress }: { name: string | null; onPress?: () => void }) {
  const initial = name?.trim().charAt(0).toLocaleUpperCase('es-MX');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t.home.openProfile}
      hitSlop={4}
    >
      <Box
        width={48}
        height={48}
        borderRadius="pill"
        backgroundColor="primaryTint"
        alignItems="center"
        justifyContent="center"
      >
        {initial ? (
          <Text variant="h2" color="primary">
            {initial}
          </Text>
        ) : (
          <Icon name="profile" color="primary" />
        )}
      </Box>
    </Pressable>
  );
}

/** Whole percents, as in the mockup: 0.689 → "69 %". */
const wholePercent = (ratio: number) =>
  formatPercent(Math.round(Math.min(Math.max(ratio, 0), 1) * 100) / 100);

type Legend = { label: string; value: string; color: keyof AppTheme['colors'] };

function Hero({
  ring,
  adherence,
  delay,
}: {
  ring: NonNullable<InicioData['ring']>;
  adherence: number | null;
  delay: number;
}) {
  const { width } = useWindowDimensions();
  const size = Math.max(120, Math.min(RING_MAX, width - HERO_RESERVED));

  const outer =
    ring.kind === 'weightGoal'
      ? {
          // Moving away from the goal counts as no progress, not negative progress.
          progress: ring.goalKg === 0 ? 0 : Math.max(0, ring.changeKg / ring.goalKg),
          big: formatSigned(ring.changeKg, 1),
          small: t.home.kgOfGoal(formatKg(Math.abs(ring.goalKg))),
          label: t.home.weightGoal,
        }
      : {
          progress: ring.target === 0 ? 0 : ring.eaten / ring.target,
          big: formatNumber(ring.eaten),
          small: t.home.ofKcal(formatKcal(ring.target)),
          label: t.home.caloriesToday,
        };

  const rings: Ring[] = [{ progress: outer.progress }];
  const legend: Legend[] = [
    { label: outer.label, value: wholePercent(outer.progress), color: 'primary' },
  ];
  if (adherence != null) {
    rings.push({ progress: adherence });
    legend.push({ label: t.home.planThisWeek, value: wholePercent(adherence), color: 'accent' });
  }

  return (
    <Card variant="hero" padding="l" delay={delay} flexDirection="row" alignItems="center" gap="l">
      <ProgressRing
        size={size}
        strokeWidth={size * 0.072}
        gap={size * 0.06}
        rings={rings}
        accessibilityLabel={t.home.ringA11y(
          legend[0]!.label,
          legend[0]!.value,
          legend[1]?.label,
          legend[1]?.value,
        )}
      >
        <Text variant="numberXL">{outer.big}</Text>
        <Text variant="label">{outer.small}</Text>
      </ProgressRing>
      <Box flex={1} gap="m">
        {legend.map((item) => (
          <Box key={item.label} gap="xs">
            <Box flexDirection="row" alignItems="center" gap="s">
              <Box width={10} height={10} borderRadius="pill" backgroundColor={item.color} />
              <Text variant="label" flexShrink={1}>
                {item.label}
              </Text>
            </Box>
            <Text variant="number">{item.value}</Text>
          </Box>
        ))}
      </Box>
    </Card>
  );
}

function WeightCard({
  valuesKg,
  weeks,
  delay,
}: NonNullable<InicioData['weight']> & { delay: number }) {
  const first = formatKg(valuesKg[0]!);
  const last = formatKg(valuesKg[valuesKg.length - 1]!);
  return (
    <Card borderRadius="l" delay={delay} gap="s">
      <Box flexDirection="row" justifyContent="space-between" alignItems="baseline">
        <Text variant="h2">{t.home.yourWeight}</Text>
        <Text variant="label">{t.home.weeks(weeks)}</Text>
      </Box>
      <Sparkline
        values={valuesKg}
        // Starts once the card has risen in.
        delay={delay + motion.entrance.duration}
        accessibilityLabel={t.home.weightA11y(first, last, weeks)}
      />
      <Box flexDirection="row" justifyContent="space-between">
        <Text variant="label">{first}</Text>
        <Text variant="label" color="text" fontFamily={fonts.bodyBold}>
          {t.home.weightToday(last)}
        </Text>
      </Box>
    </Card>
  );
}

function Flame() {
  const flicker = useFlicker();
  return (
    <Animated.View style={[{ transformOrigin: '50% 90%' }, flicker]}>
      <Icon name="flame" color="favorite" />
    </Animated.View>
  );
}
