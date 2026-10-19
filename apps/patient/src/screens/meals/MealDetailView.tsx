import type { MealLogStatus, RecipeMacros } from '@limon/types';
import { useRef } from 'react';
import { Pressable } from 'react-native';
import {
  BottomSheet,
  Box,
  Button,
  Card,
  Chip,
  DetailBody,
  DetailHeader,
  Entering,
  LoadState,
  ScreenScroll,
  SheetOption,
  Text,
} from '../../design-system';
import { t } from '../../i18n/es-MX';
import { formatGrams } from '../../i18n/format';
import { Section, StepList } from '../recipes/RecipeParts';
import { LogTile, MealLogSheet, type MealLogSheetProps, type MealLogTarget } from './MealLogParts';

export type MealIngredientRow = {
  id: string;
  /** The food eaten now (after any swap). */
  foodId: string;
  name: string;
  /** "2.7 piezas (324 g)" */
  amount: string;
  /** The recipe's own food, when this one was swapped in. */
  insteadOf: string | null;
  swappable: boolean;
};

export type SwapOption = { foodId: string; name: string; amount: string; original: boolean };

export type SwapSheetState = {
  ingredient: MealIngredientRow;
  status: 'loading' | 'failed' | 'loaded';
  options: SwapOption[];
  /** The option picked in the sheet, not yet saved. */
  selected: string | null;
  saving: boolean;
  saveFailed: boolean;
};

export type MealDetailData = {
  title: string;
  /** "Comida · martes, 6 de octubre" */
  caption: string;
  /** Portion, time and kcal, shown as chips in the header. */
  meta: string[];
  description: string | null;
  macros: RecipeMacros | null;
  ingredients: MealIngredientRow[];
  steps: string[];
  /** Food swaps on for the tenant, and the meal is today or later. */
  canSwap: boolean;
  /** The check-off row: shown for today's and yesterday's meals, and for any answered one. */
  checkOff: {
    mealLabel: string;
    status: MealLogStatus | null;
    loggable: boolean;
    failed: boolean;
  } | null;
};

export type MealDetailViewProps = {
  state:
    | { status: 'loading' }
    | { status: 'failed'; onRetry: () => void }
    | ({ status: 'loaded' } & MealDetailData);
  /** Shown while the title is loading. */
  fallbackTitle: string;
  swap: SwapSheetState | null;
  onBack: () => void;
  onOpenSwap?: (ingredient: MealIngredientRow) => void;
  onSelectSwap?: (foodId: string) => void;
  onConfirmSwap?: () => void;
  onRetrySwap?: () => void;
  onCloseSwap?: () => void;
  onLogMeal?: () => void;
  /** The meal being checked off in the sheet, or null when it's closed. */
  logSheet?: MealLogTarget | null;
} & Partial<Pick<MealLogSheetProps, 'onSave' | 'onClear'>> & { onCloseLog?: () => void };

/** Detalle de comida (docs/ui/mockups/03-detalle-de-comida.html), with the swap sheet. */
export function MealDetailView(props: MealDetailViewProps) {
  const { state } = props;
  const meal = state.status === 'loaded' ? state : null;
  return (
    <>
      <ScreenScroll bleed gap="none">
        <DetailHeader
          title={meal?.title ?? props.fallbackTitle}
          caption={meal?.caption}
          backLabel={t.common.back}
          onBack={props.onBack}
          delay={0}
        >
          {meal && meal.meta.length ? (
            <Box flexDirection="row" flexWrap="wrap" gap="s">
              {meal.meta.map((m) => (
                <Chip key={m} label={m} size="m" />
              ))}
            </Box>
          ) : null}
        </DetailHeader>
        <DetailBody>
          {state.status === 'loading' ? <LoadState status="loading" /> : null}
          {state.status === 'failed' ? (
            <LoadState
              status="failed"
              message={t.meals.mealFailed}
              retryLabel={t.meals.retry}
              onRetry={state.onRetry}
            />
          ) : null}
          {meal ? (
            <Body meal={meal} onOpenSwap={props.onOpenSwap} onLogMeal={props.onLogMeal} />
          ) : null}
        </DetailBody>
      </ScreenScroll>
      <SwapSheet {...props} />
      <MealLogSheet
        meal={props.logSheet ?? null}
        onSave={(status, note) => props.onSave?.(status, note)}
        onClear={() => props.onClear?.()}
        onClose={() => props.onCloseLog?.()}
      />
    </>
  );
}

function Body({
  meal,
  onOpenSwap,
  onLogMeal,
}: {
  meal: MealDetailData;
  onOpenSwap?: (i: MealIngredientRow) => void;
  onLogMeal?: () => void;
}) {
  const { macros } = meal;
  return (
    <>
      {meal.checkOff ? <CheckOffRow {...meal.checkOff} onPress={onLogMeal} /> : null}
      <Entering delay={80}>
        {macros ? (
          <Box flexDirection="row" flexWrap="wrap" gap="s">
            <Chip size="m" label={t.macros.protein(formatGrams(macros.protein))} />
            <Chip size="m" label={t.macros.carbs(formatGrams(macros.carbohydrate))} />
            <Chip size="m" label={t.macros.fat(formatGrams(macros.fat))} />
          </Box>
        ) : (
          <Text variant="label">{t.recipes.nutritionUnavailable}</Text>
        )}
      </Entering>
      {meal.description ? <Text variant="body">{meal.description}</Text> : null}

      <Card delay={160} borderRadius="l" paddingVertical="xs" gap="none">
        {meal.ingredients.map((i, n) => (
          <Box
            key={i.id}
            flexDirection="row"
            alignItems="center"
            gap="m"
            minHeight={52}
            paddingVertical="s"
            borderBottomWidth={n < meal.ingredients.length - 1 ? 1 : 0}
            borderBottomColor="dividerSoft"
          >
            <Box flex={1}>
              <Text variant="bodyStrong">{i.name}</Text>
              <Text variant="caption">
                {i.insteadOf ? `${i.amount} · ${t.swaps.insteadOf(i.insteadOf)}` : i.amount}
              </Text>
            </Box>
            {meal.canSwap && i.swappable ? (
              <Pressable
                onPress={() => onOpenSwap?.(i)}
                accessibilityRole="button"
                accessibilityLabel={t.swaps.openLabel(i.name)}
                hitSlop={{ top: 4, bottom: 4 }}
              >
                <Box
                  minHeight={36}
                  minWidth={44}
                  paddingHorizontal="m"
                  borderRadius="pill"
                  backgroundColor="primaryTint"
                  justifyContent="center"
                >
                  <Text variant="chip" color="primary">
                    {t.swaps.open}
                  </Text>
                </Box>
              </Pressable>
            ) : null}
          </Box>
        ))}
      </Card>
      {meal.canSwap && meal.ingredients.some((i) => i.swappable) ? (
        <Text variant="caption">{t.swaps.hint}</Text>
      ) : null}
      {macros ? <Text variant="caption">{t.recipes.attribution}</Text> : null}

      {meal.steps.length ? (
        <Box marginTop="s">
          <Section title={t.recipes.steps} delay={240}>
            <StepList steps={meal.steps} />
          </Section>
        </Box>
      ) : null}
    </>
  );
}

function CheckOffRow({
  mealLabel,
  status,
  loggable,
  failed,
  onPress,
}: NonNullable<MealDetailData['checkOff']> & { onPress?: () => void }) {
  const answer = status ? t.mealLog.status[status] : null;
  return (
    <Card delay={80} borderRadius="l" paddingVertical="s" gap="s">
      <Box flexDirection="row" alignItems="center" gap="m" minHeight={52}>
        <LogTile
          status={status}
          loggable={loggable}
          accessibilityLabel={
            answer ? t.mealLog.change(mealLabel, answer) : t.mealLog.open(mealLabel)
          }
          onPress={onPress}
        />
        <Box flex={1}>
          <Text variant="bodyStrong">{answer ?? t.mealLog.question(mealLabel)}</Text>
        </Box>
        {loggable ? (
          <Pressable onPress={onPress} accessibilityRole="button" hitSlop={{ top: 4, bottom: 4 }}>
            <Box
              minHeight={36}
              minWidth={44}
              paddingHorizontal="m"
              borderRadius="pill"
              backgroundColor="primaryTint"
              justifyContent="center"
            >
              <Text variant="chip" color="primary">
                {status ? t.mealLog.changeAction : t.mealLog.action}
              </Text>
            </Box>
          </Pressable>
        ) : null}
      </Box>
      {failed ? (
        <Text variant="label" color="danger">
          {t.mealLog.saveFailed}
        </Text>
      ) : null}
    </Card>
  );
}

function SwapSheet({
  swap: current,
  onSelectSwap,
  onConfirmSwap,
  onRetrySwap,
  onCloseSwap,
}: MealDetailViewProps) {
  // The sheet keeps showing its last contents while it slides away.
  const last = useRef(current);
  if (current) last.current = current;
  const open = current !== null;
  const swap = current ?? last.current;
  const selected = swap?.options.find((o) => o.foodId === swap.selected) ?? null;
  const changed = !!selected && selected.foodId !== swap?.ingredient.foodId;
  return (
    <BottomSheet
      visible={open}
      onClose={() => onCloseSwap?.()}
      title={swap ? t.swaps.sheetTitle(swap.ingredient.name) : ''}
      subtitle={t.swaps.hint}
      closeLabel={t.common.close}
      footer={
        swap?.status === 'loaded' && swap.options.length ? (
          <Box gap="s">
            {swap.saveFailed ? (
              <Text variant="label" color="danger">
                {t.swaps.saveFailed}
              </Text>
            ) : null}
            <Button
              label={selected ? t.swaps.confirm(selected.name) : t.swaps.open}
              disabled={!changed}
              busy={swap.saving}
              onPress={() => onConfirmSwap?.()}
            />
          </Box>
        ) : null
      }
    >
      {swap?.status === 'loading' ? <LoadState status="loading" /> : null}
      {swap?.status === 'failed' ? (
        <LoadState
          status="failed"
          message={t.swaps.optionsFailed}
          retryLabel={t.meals.retry}
          onRetry={() => onRetrySwap?.()}
        />
      ) : null}
      {swap?.status === 'loaded' && !swap.options.length ? (
        <Text variant="label">{t.swaps.none}</Text>
      ) : null}
      {swap?.status === 'loaded'
        ? swap.options.map((o) => (
            <SheetOption
              key={o.foodId}
              label={o.name}
              detail={o.original ? t.swaps.originalTag(o.amount) : o.amount}
              selected={o.foodId === swap.selected}
              disabled={swap.saving}
              onPress={() => onSelectSwap?.(o.foodId)}
            />
          ))
        : null}
    </BottomSheet>
  );
}
