import { FeatureKey, type FoodSwapOptionDto, type PlannedMealDetailDto, type PlannedMealIngredientDto } from '@limon/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { canRegenerate, formatMealIngredient, formatPortion } from '../../features/meal-plans/meal-plan-format';
import { formatMinutes } from '../../features/recipes/recipe-format';
import { t } from '../../i18n/es-MX';
import { formatDate, formatGrams, formatKcal, formatNumber, toDateOnly } from '../../i18n/format';
import type { AppStackParamList } from '../../navigation/types';
import { api } from '../../services/api';
import { useSession } from '../../state/session-context';
import { useTenantTheme } from '../../theme/theme-context';

type Load = { status: 'loading' } | { status: 'failed' } | { status: 'loaded'; meal: PlannedMealDetailDto };

/** The swap list open under one ingredient. */
type Swap =
  | { ingredientId: string; status: 'loading' }
  | { ingredientId: string; status: 'failed' }
  | { ingredientId: string; status: 'loaded'; options: FoodSwapOptionDto[]; saving: boolean; saveFailed: boolean };

/**
 * One meal of this week's plan, for the patient's portion: macros, ingredients and steps.
 * From today on, an ingredient with SMAE data can be swapped for an equivalent food (when
 * the tenant has the food_swaps module); the swap applies to this meal only.
 */
export function MealDetailScreen({ route }: NativeStackScreenProps<AppStackParamList, 'MealDetail'>) {
  const { mealId } = route.params;
  const { theme } = useTenantTheme();
  const session = useSession();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [swap, setSwap] = useState<Swap | null>(null);

  const fetchMeal = useCallback(() => {
    setLoad({ status: 'loading' });
    api.mealPlans
      .meal(mealId)
      .then((meal) => setLoad({ status: 'loaded', meal }))
      .catch((err) => {
        console.error('[meals] loading the meal failed', err);
        setLoad({ status: 'failed' });
      });
  }, [mealId]);
  useEffect(fetchMeal, [fetchMeal]);

  const openSwap = (ingredientId: string) => {
    setSwap({ ingredientId, status: 'loading' });
    api.mealPlans
      .swapOptions(mealId, ingredientId)
      .then(({ items }) =>
        setSwap((prev) => (prev?.ingredientId === ingredientId ? { ingredientId, status: 'loaded', options: items, saving: false, saveFailed: false } : prev)),
      )
      .catch((err) => {
        console.error('[meals] loading the swap options failed', err);
        setSwap((prev) => (prev?.ingredientId === ingredientId ? { ingredientId, status: 'failed' } : prev));
      });
  };

  const choose = (ingredientId: string, foodId: string) => {
    setSwap((prev) => (prev?.status === 'loaded' ? { ...prev, saving: true, saveFailed: false } : prev));
    api.mealPlans
      .swap(mealId, ingredientId, foodId)
      .then((meal) => {
        setLoad({ status: 'loaded', meal });
        setSwap(null);
      })
      .catch((err) => {
        console.error('[meals] saving the swap failed', err);
        setSwap((prev) => (prev?.status === 'loaded' ? { ...prev, saving: false, saveFailed: true } : prev));
      });
  };

  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.md, gap: theme.spacing.sm }}>
      <Text accessibilityRole="header" style={{ color: theme.colors.text, fontWeight: '700', fontSize: theme.typography.fontSize.lg }}>{title}</Text>
      {children}
    </View>
  );
  const Line = ({ children, muted }: { children: ReactNode; muted?: boolean }) => (
    <Text style={{ color: muted ? theme.colors.textMuted : theme.colors.text }}>{children}</Text>
  );
  const Link = ({ label, accessibilityLabel, onPress, disabled }: { label: string; accessibilityLabel?: string; onPress: () => void; disabled?: boolean }) => (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} hitSlop={8} onPress={onPress} disabled={disabled}>
      <Text style={{ color: theme.colors.primary, fontWeight: '600', opacity: disabled ? 0.6 : 1 }}>{label}</Text>
    </Pressable>
  );

  const swapList = (ingredient: PlannedMealIngredientDto, open: Swap) => {
    if (open.status === 'loading') return <Line muted>{t.swaps.loading}</Line>;
    if (open.status === 'failed') {
      return (
        <>
          <Text style={{ color: theme.colors.danger }}>{t.swaps.optionsFailed}</Text>
          <Link label={t.meals.retry} onPress={() => openSwap(ingredient.id)} />
        </>
      );
    }
    return (
      <>
        {open.options.length ? null : <Line muted>{t.swaps.none}</Line>}
        {open.options.map((o) => (
          <Pressable
            key={o.foodId}
            accessibilityRole="button"
            disabled={open.saving}
            onPress={() => choose(ingredient.id, o.foodId)}
            style={{ paddingVertical: theme.spacing.sm, borderTopWidth: 1, borderColor: theme.colors.border, opacity: open.saving ? 0.6 : 1 }}
          >
            <Text style={{ color: o.original ? theme.colors.primary : theme.colors.text }}>
              {o.original ? t.swaps.undo(o.name, formatGrams(o.grams)) : t.swaps.option(o.name, formatGrams(o.grams))}
            </Text>
          </Pressable>
        ))}
        {open.saveFailed ? <Text style={{ color: theme.colors.danger }}>{t.swaps.saveFailed}</Text> : null}
      </>
    );
  };

  const content = (meal: PlannedMealDetailDto) => {
    const { macros, recipe } = meal;
    const canSwap = session.hasFeature(FeatureKey.FOOD_SWAPS) && canRegenerate(meal.date, toDateOnly(new Date()));
    return (
      <>
        <Line muted>
          {[
            `${t.recipes.mealTypes[meal.mealType]} · ${formatDate(meal.date)}`,
            formatPortion(meal.servings),
            recipe.totalMinutes ? formatMinutes(recipe.totalMinutes) : null,
          ].filter(Boolean).join('  ·  ')}
        </Line>
        {recipe.description ? <Line>{recipe.description}</Line> : null}

        <Section title={t.meals.yourPortion}>
          {macros ? (
            <>
              <Text style={{ color: theme.colors.text, fontSize: theme.typography.fontSize.xl, fontWeight: '700' }}>{formatKcal(macros.calories)}</Text>
              <Line>{t.recipes.macros(formatGrams(macros.protein), formatGrams(macros.carbohydrate), formatGrams(macros.fat))}</Line>
            </>
          ) : (
            <Line muted>{t.recipes.nutritionUnavailable}</Line>
          )}
        </Section>

        <Section title={t.recipes.ingredients}>
          {canSwap && meal.ingredients.some((i) => i.swappable) ? <Line muted>{t.swaps.hint}</Line> : null}
          {meal.ingredients.map((i) => {
            const open = swap?.ingredientId === i.id ? swap : null;
            return (
              <View key={i.id} style={{ gap: theme.spacing.xs }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Line>{`• ${formatMealIngredient(i)}`}</Line>
                    {i.swappedFrom ? <Line muted>{`   ${t.swaps.insteadOf(i.swappedFrom.name)}`}</Line> : null}
                  </View>
                  {canSwap && i.swappable ? (
                    <Link
                      label={open ? t.swaps.close : t.swaps.open}
                      accessibilityLabel={open ? undefined : t.swaps.openLabel(i.name)}
                      disabled={open?.status === 'loaded' && open.saving}
                      onPress={() => (open ? setSwap(null) : openSwap(i.id))}
                    />
                  ) : null}
                </View>
                {open ? <View style={{ paddingLeft: theme.spacing.md }}>{swapList(i, open)}</View> : null}
              </View>
            );
          })}
        </Section>

        <Section title={t.recipes.steps}>
          {recipe.steps.map((step, n) => (
            <View key={n} style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>{formatNumber(n + 1)}.</Text>
              <Text style={{ color: theme.colors.text, flex: 1 }}>{step}</Text>
            </View>
          ))}
        </Section>

        {macros ? <Line muted>{t.recipes.attribution}</Line> : null}
      </>
    );
  };

  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
      {load.status === 'loading' ? <ActivityIndicator /> : null}
      {load.status === 'failed' ? (
        <>
          <Line>{t.meals.mealFailed}</Line>
          <Button label={t.meals.retry} onPress={fetchMeal} />
        </>
      ) : null}
      {load.status === 'loaded' ? content(load.meal) : null}
    </ScrollView>
  );
}
