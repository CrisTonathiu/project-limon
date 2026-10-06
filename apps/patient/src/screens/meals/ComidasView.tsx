import type { RecipeMacros } from '@limon/types';
import { Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import {
  Box,
  Button,
  Card,
  Chip,
  Entering,
  fonts,
  HeartButton,
  Icon,
  LoadState,
  ProgressRing,
  RoundButton,
  ScreenHeader,
  ScreenScroll,
  Text,
  usePressScale,
} from '../../design-system';
import { t } from '../../i18n/es-MX';
import { formatGrams, formatKcal, formatNumber, formatPercent } from '../../i18n/format';

export type WeekDay = {
  date: string;
  /** "L", "M", … */
  letter: string;
  /** "6" */
  day: string;
  /** "martes, 6 de octubre, hoy" */
  accessibilityLabel: string;
  today: boolean;
};

export type MealRow = {
  id: string;
  /** "Desayuno" (later "Desayuno · 8:00", once plans have times). */
  label: string;
  recipe: { id: string; title: string } | null;
  /** "380 kcal", or null when FatSecret didn't give the portion's calories. */
  kcal: string | null;
  favourite: boolean;
};

export type ComidasWeek = {
  /** "5 al 11 de octubre" */
  weekLabel: string;
  days: WeekDay[];
  selected: number;
  /** The selected day's sums, null when any meal's macros are unknown. */
  totals: RecipeMacros | null;
  targetKcal: number;
  meals: MealRow[];
  /** Today and later days only. */
  canRegenerate: boolean;
  regenerating: boolean;
  regenerateFailed: boolean;
  favouriteFailed: boolean;
};

export type ComidasViewProps = {
  state:
    | { status: 'loading' }
    | { status: 'failed'; onRetry: () => void }
    /** No automatic target: the nutritionist sets it. */
    | { status: 'consult'; message: string }
    | ({ status: 'ready' } & ComidasWeek);
  onSelectDay?: (index: number) => void;
  onOpenMeal?: (meal: MealRow) => void;
  onToggleFavourite?: (meal: MealRow) => void;
  onRegenerate?: () => void;
  /** Leave out when the tenant has no shopping list. */
  onOpenShoppingList?: () => void;
};

/** Comidas (docs/ui/mockups/02-comidas.html): the week strip, the day's summary and its meals. */
export function ComidasView(props: ComidasViewProps) {
  const { state } = props;
  return (
    <ScreenScroll>
      <ScreenHeader
        caption={state.status === 'ready' ? state.weekLabel : undefined}
        title={t.meals.title}
        trailing={
          props.onOpenShoppingList ? (
            <RoundButton
              icon="cart"
              accessibilityLabel={t.nav.shoppingList}
              onPress={props.onOpenShoppingList}
            />
          ) : null
        }
        delay={0}
      />
      {state.status === 'loading' ? <LoadState status="loading" /> : null}
      {state.status === 'failed' ? (
        <LoadState
          status="failed"
          message={t.meals.loadFailed}
          retryLabel={t.meals.retry}
          onRetry={state.onRetry}
        />
      ) : null}
      {state.status === 'consult' ? (
        <Card variant="tint" gap="s" delay={80}>
          <Text variant="bodyStrong">{state.message}</Text>
          <Text variant="label" color="textOnTint">
            {t.meals.consult}
          </Text>
        </Card>
      ) : null}
      {state.status === 'ready' ? <Week {...props} week={state} /> : null}
    </ScreenScroll>
  );
}

function Week({ week, ...props }: ComidasViewProps & { week: ComidasWeek }) {
  return (
    <>
      <Entering delay={80}>
        <Box flexDirection="row" justifyContent="space-between" accessibilityRole="tablist">
          {week.days.map((day, i) => (
            <DayChip
              key={day.date}
              day={day}
              selected={i === week.selected}
              onPress={() => props.onSelectDay?.(i)}
            />
          ))}
        </Box>
      </Entering>
      <DaySummary totals={week.totals} targetKcal={week.targetKcal} />
      <Box gap="s">
        {week.meals.map((meal, i) => (
          <MealCard
            key={meal.id}
            meal={meal}
            delay={240 + i * 80}
            onOpen={() => props.onOpenMeal?.(meal)}
            onToggleFavourite={() => props.onToggleFavourite?.(meal)}
          />
        ))}
      </Box>
      {week.favouriteFailed ? (
        <Text variant="label" color="danger">
          {t.meals.favouriteFailed}
        </Text>
      ) : null}
      {week.canRegenerate ? (
        <Entering delay={240 + week.meals.length * 80}>
          <Box gap="s">
            <Button
              variant="outline"
              label={week.regenerating ? t.meals.regenerating : t.meals.regenerate}
              busy={week.regenerating}
              onPress={() => props.onRegenerate?.()}
            />
            {week.regenerateFailed ? (
              <Text variant="label" color="danger">
                {t.meals.regenerateFailed}
              </Text>
            ) : null}
          </Box>
        </Entering>
      ) : null}
      {week.meals.some((m) => m.kcal) ? (
        <Text variant="caption">{t.recipes.attribution}</Text>
      ) : null}
    </>
  );
}

function DayChip({
  day,
  selected,
  onPress,
}: {
  day: WeekDay;
  selected: boolean;
  onPress: () => void;
}) {
  const fg = selected ? 'onPrimary' : day.today ? 'primary' : 'text';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={day.accessibilityLabel}
    >
      <Box
        width={44}
        height={60}
        borderRadius="m"
        alignItems="center"
        justifyContent="center"
        gap="xs"
        backgroundColor={selected ? 'primary' : 'surface'}
      >
        <Text variant="caption" fontFamily={fonts.bodySemiBold} color={fg}>
          {day.letter}
        </Text>
        <Text variant="h2" fontSize={18} lineHeight={20} color={fg}>
          {day.day}
        </Text>
      </Box>
    </Pressable>
  );
}

function DaySummary({ totals, targetKcal }: { totals: RecipeMacros | null; targetKcal: number }) {
  if (!totals) {
    return (
      <Card variant="hero" padding="l" delay={160}>
        <Text variant="label">{t.meals.totalsUnavailable}</Text>
      </Card>
    );
  }
  const ratio = targetKcal > 0 ? totals.calories / targetKcal : 0;
  const percent = formatPercent(Math.round(ratio * 100) / 100);
  return (
    <Card variant="hero" padding="l" delay={160} flexDirection="row" alignItems="center" gap="l">
      <ProgressRing
        size={64}
        strokeWidth={7}
        rings={[{ progress: ratio }]}
        accessibilityLabel={t.meals.dayRingA11y(percent)}
      >
        <Text variant="chip" fontFamily={fonts.display} fontSize={14}>
          {percent}
        </Text>
      </ProgressRing>
      <Box flex={1} gap="s">
        <Text variant="label">
          <Text variant="h2" fontSize={18}>
            {formatNumber(totals.calories)}
          </Text>{' '}
          {t.home.ofKcal(formatKcal(targetKcal))}
        </Text>
        <Box flexDirection="row" flexWrap="wrap" gap="xs">
          <Chip tone="tint" label={t.macros.proteinShort(formatGrams(totals.protein))} />
          <Chip tone="accent" label={t.macros.carbsShort(formatGrams(totals.carbohydrate))} />
          <Chip tone="neutral" label={t.macros.fatShort(formatGrams(totals.fat))} />
        </Box>
      </Box>
    </Card>
  );
}

function MealCard({
  meal,
  delay,
  onOpen,
  onToggleFavourite,
}: {
  meal: MealRow;
  delay: number;
  onOpen: () => void;
  onToggleFavourite: () => void;
}) {
  const press = usePressScale();
  const { recipe } = meal;
  const summary = (
    <Box
      flexDirection="row"
      alignItems="center"
      gap="m"
      minHeight={64}
      paddingVertical="s"
      paddingLeft="m"
    >
      <Box
        width={44}
        height={44}
        borderRadius="s"
        backgroundColor="primaryTint"
        alignItems="center"
        justifyContent="center"
      >
        <Icon name="meals" color="primary" />
      </Box>
      <Box flex={1} minWidth={0}>
        <Text variant="caption">{meal.label}</Text>
        {recipe ? (
          <Text variant="bodyStrong" numberOfLines={1}>
            {recipe.title}
          </Text>
        ) : (
          <Text variant="label" numberOfLines={3}>
            {t.meals.noRecipe}
          </Text>
        )}
      </Box>
      {meal.kcal ? <Text variant="label">{meal.kcal}</Text> : null}
    </Box>
  );
  return (
    <Entering delay={delay}>
      <Animated.View style={press.style}>
        {/* The heart sits beside the tappable part, not inside it, so screen readers reach both. */}
        <Box
          flexDirection="row"
          alignItems="center"
          backgroundColor="surface"
          borderRadius="m"
          paddingRight="xs"
        >
          <Box flex={1}>
            {recipe ? (
              <Pressable
                onPress={onOpen}
                onPressIn={press.onPressIn}
                onPressOut={press.onPressOut}
                accessibilityRole="button"
                accessibilityLabel={[meal.label, recipe.title, meal.kcal]
                  .filter(Boolean)
                  .join(', ')}
              >
                {summary}
              </Pressable>
            ) : (
              summary
            )}
          </Box>
          {recipe ? (
            <HeartButton
              favourite={meal.favourite}
              accessibilityLabel={
                meal.favourite ? t.meals.unfavourite(recipe.title) : t.meals.favourite(recipe.title)
              }
              onPress={onToggleFavourite}
            />
          ) : (
            <Box width={12} />
          )}
        </Box>
      </Animated.View>
    </Entering>
  );
}
