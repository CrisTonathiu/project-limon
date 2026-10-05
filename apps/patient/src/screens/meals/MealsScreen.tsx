import type { MealPlanDayDto, MealPlanResponse, PlannedMealDto } from '@limon/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { canRegenerate, dayChip, formatPortion, initialDayIndex, withFavourite } from '../../features/meal-plans/meal-plan-format';
import { formatMinutes } from '../../features/recipes/recipe-format';
import { t } from '../../i18n/es-MX';
import { formatDate, formatGrams, formatKcal, toDateOnly } from '../../i18n/format';
import type { AppStackParamList } from '../../navigation/types';
import { api } from '../../services/api';
import { useTenantTheme } from '../../theme/theme-context';

type Load = { status: 'loading' } | { status: 'failed' } | { status: 'loaded'; week: MealPlanResponse };

/**
 * This week's meal plan: a strip of the 7 days, then the selected day's meals with its
 * totals against the daily target. Today and later days can get new recipes, and any
 * meal's recipe can be marked ♥ (the generator prefers favourites in later plans).
 */
export function MealsScreen({ navigation }: NativeStackScreenProps<AppStackParamList, 'Meals'>) {
  const { theme } = useTenantTheme();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [dayIndex, setDayIndex] = useState(0);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateFailed, setRegenerateFailed] = useState(false);
  const [favouriteFailed, setFavouriteFailed] = useState(false);
  const today = toDateOnly(new Date());

  const fetchPlan = useCallback(() => {
    setLoad({ status: 'loading' });
    api.mealPlans
      .current()
      .then((week) => {
        setLoad({ status: 'loaded', week });
        if (week.status === 'READY') setDayIndex(initialDayIndex(week.plan.days.map((d) => d.date), toDateOnly(new Date())));
      })
      .catch((err) => {
        console.error('[meals] loading the plan failed', err);
        setLoad({ status: 'failed' });
      });
  }, []);
  useEffect(fetchPlan, [fetchPlan]);

  const regenerate = (date: string) => {
    setRegenerating(true);
    setRegenerateFailed(false);
    api.mealPlans
      .regenerateDay(date)
      .then((week) => setLoad({ status: 'loaded', week }))
      .catch((err) => {
        console.error('[meals] regenerating the day failed', err);
        setRegenerateFailed(true);
      })
      .finally(() => setRegenerating(false));
  };

  /** Optimistic: the heart flips at once and flips back if the API call fails. */
  const toggleFavourite = (recipeId: string, favourite: boolean) => {
    const apply = (value: boolean) =>
      setLoad((prev) =>
        prev.status === 'loaded' && prev.week.status === 'READY'
          ? { ...prev, week: { ...prev.week, plan: withFavourite(prev.week.plan, recipeId, value) } }
          : prev,
      );
    apply(favourite);
    setFavouriteFailed(false);
    (favourite ? api.mealPlans.addFavourite(recipeId) : api.mealPlans.removeFavourite(recipeId)).catch((err) => {
      console.error('[meals] saving the favourite failed', err);
      apply(!favourite);
      setFavouriteFailed(true);
    });
  };

  const Muted = ({ children }: { children: string }) => <Text style={{ color: theme.colors.textMuted }}>{children}</Text>;

  const weekStrip = (days: MealPlanDayDto[]) => (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
      {days.map((day, i) => {
        const selected = i === dayIndex;
        const chip = dayChip(day.date);
        return (
          <Pressable
            key={day.date}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={formatDate(day.date)}
            onPress={() => {
              setDayIndex(i);
              setRegenerateFailed(false);
            }}
            style={{
              flex: 1,
              alignItems: 'center',
              paddingVertical: theme.spacing.sm,
              borderRadius: theme.radius.md,
              borderWidth: 1,
              borderColor: selected ? theme.colors.primary : day.date === today ? theme.colors.primary : theme.colors.border,
              backgroundColor: selected ? theme.colors.primary : theme.colors.background,
            }}
          >
            <Text style={{ color: selected ? theme.colors.onPrimary : theme.colors.textMuted, fontSize: theme.typography.fontSize.xs }}>{chip.weekday}</Text>
            <Text style={{ color: selected ? theme.colors.onPrimary : theme.colors.text, fontWeight: '700' }}>{chip.day}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const mealCard = (meal: PlannedMealDto) => {
    const label = <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>{t.recipes.mealTypes[meal.mealType]}</Text>;
    const style = { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.md, gap: theme.spacing.xs };
    if (!meal.recipe) {
      return (
        <View key={meal.id} style={style}>
          {label}
          <Muted>{t.meals.noRecipe}</Muted>
        </View>
      );
    }
    const { recipe } = meal;
    return (
      <Pressable
        key={meal.id}
        accessibilityRole="button"
        onPress={() => navigation.navigate('RecipeDetail', { recipeId: recipe.id, title: recipe.title })}
        style={style}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {label}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: meal.favourite }}
            accessibilityLabel={meal.favourite ? t.meals.unfavourite(recipe.title) : t.meals.favourite(recipe.title)}
            hitSlop={12}
            onPress={() => toggleFavourite(recipe.id, !meal.favourite)}
          >
            <Text style={{ color: meal.favourite ? theme.colors.primary : theme.colors.textMuted, fontSize: theme.typography.fontSize.xl }}>
              {meal.favourite ? '♥' : '♡'}
            </Text>
          </Pressable>
        </View>
        <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: theme.typography.fontSize.lg }}>{recipe.title}</Text>
        <Muted>
          {[
            meal.servings ? formatPortion(meal.servings) : null,
            meal.macros ? formatKcal(meal.macros.calories) : null,
            recipe.totalMinutes ? formatMinutes(recipe.totalMinutes) : null,
          ].filter(Boolean).join('  ·  ')}
        </Muted>
      </Pressable>
    );
  };

  const dayView = (week: Extract<MealPlanResponse, { status: 'READY' }>) => {
    const day = week.plan.days[dayIndex] ?? week.plan.days[0]!;
    const { totals } = day;
    return (
      <>
        {weekStrip(week.plan.days)}
        <Text accessibilityRole="header" style={{ color: theme.colors.text, fontWeight: '700', fontSize: theme.typography.fontSize.lg }}>
          {day.date === today ? `${t.meals.today} · ${formatDate(day.date)}` : formatDate(day.date)}
        </Text>

        <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.md, gap: theme.spacing.xs }}>
          {totals ? (
            <>
              <Text style={{ color: theme.colors.text, fontSize: theme.typography.fontSize.xl, fontWeight: '700' }}>
                {t.meals.dayTotal(formatKcal(totals.calories), formatKcal(week.target.kcal))}
              </Text>
              <Muted>{t.recipes.macros(formatGrams(totals.protein), formatGrams(totals.carbohydrate), formatGrams(totals.fat))}</Muted>
            </>
          ) : (
            <Muted>{t.meals.totalsUnavailable}</Muted>
          )}
        </View>

        {day.meals.map(mealCard)}
        {favouriteFailed ? <Text style={{ color: theme.colors.danger }}>{t.meals.favouriteFailed}</Text> : null}

        {canRegenerate(day.date, today) ? (
          <View style={{ gap: theme.spacing.sm }}>
            <Button label={regenerating ? t.meals.regenerating : t.meals.regenerate} disabled={regenerating} onPress={() => regenerate(day.date)} />
            {regenerateFailed ? <Text style={{ color: theme.colors.danger }}>{t.meals.regenerateFailed}</Text> : null}
          </View>
        ) : null}

        {day.meals.some((m) => m.macros) ? <Muted>{t.recipes.attribution}</Muted> : null}
      </>
    );
  };

  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
      {load.status === 'loading' ? <ActivityIndicator /> : null}
      {load.status === 'failed' ? (
        <>
          <Text style={{ color: theme.colors.text }}>{t.meals.loadFailed}</Text>
          <Button label={t.meals.retry} onPress={fetchPlan} />
        </>
      ) : null}
      {load.status === 'loaded' && load.week.status === 'CONSULT_NUTRITIONIST' ? (
        <>
          <Text style={{ color: theme.colors.text }}>{t.profile.target.hold[load.week.reason]}</Text>
          <Muted>{t.meals.consult}</Muted>
        </>
      ) : null}
      {load.status === 'loaded' && load.week.status === 'READY' ? dayView(load.week) : null}
    </ScrollView>
  );
}
