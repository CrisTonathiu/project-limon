import { FeatureKey, type MealPlanResponse } from '@limon/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { canRegenerate, dayChip, initialDayIndex, withFavourite } from '../../features/meal-plans/meal-plan-format';
import { t } from '../../i18n/es-MX';
import { formatDate, formatDayRange, formatKcal, toDateOnly } from '../../i18n/format';
import type { TabScreenProps } from '../../navigation/types';
import { api } from '../../services/api';
import { useSession } from '../../state/session-context';
import { ComidasView, type ComidasViewProps } from './ComidasView';

type Load = { status: 'loading' } | { status: 'failed' } | { status: 'loaded'; week: MealPlanResponse };

/**
 * This week's meal plan: a strip of the 7 days, then the selected day's meals with its
 * totals against the daily target. Today and later days can get new recipes, and any
 * meal's recipe can be marked ♥ (the generator prefers favourites in later plans). A meal
 * opens its detail, where ingredients can be swapped.
 */
export function MealsScreen({ navigation }: TabScreenProps<'Meals'>) {
  const session = useSession();
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

  // Back from a meal, its swaps may have changed the day's totals: refresh without the spinner or moving the day.
  const openedMeal = useRef(false);
  useEffect(
    () =>
      navigation.addListener('focus', () => {
        if (!openedMeal.current) return;
        openedMeal.current = false;
        api.mealPlans
          .current()
          .then((week) => setLoad((prev) => (prev.status === 'loaded' ? { status: 'loaded', week } : prev)))
          .catch((err) => console.error('[meals] refreshing the plan failed', err));
      }),
    [navigation],
  );

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

  const viewState = (): ComidasViewProps['state'] => {
    if (load.status !== 'loaded') return load.status === 'loading' ? load : { status: 'failed', onRetry: fetchPlan };
    const { week } = load;
    if (week.status === 'CONSULT_NUTRITIONIST') return { status: 'consult', message: t.profile.target.hold[week.reason] };
    const { days } = week.plan;
    const day = days[dayIndex] ?? days[0]!;
    return {
      status: 'ready',
      weekLabel: formatDayRange(days[0]!.date, days[days.length - 1]!.date),
      days: days.map((d) => ({
        date: d.date,
        letter: dayChip(d.date).weekday.charAt(0).toLocaleUpperCase('es-MX'),
        day: dayChip(d.date).day,
        accessibilityLabel: t.meals.dayA11y(formatDate(d.date), d.date === today),
        today: d.date === today,
      })),
      selected: days.indexOf(day),
      totals: day.totals,
      targetKcal: week.target.kcal,
      meals: day.meals.map((m) => ({
        id: m.id,
        label: t.recipes.mealTypes[m.mealType],
        recipe: m.recipe ? { id: m.recipe.id, title: m.recipe.title } : null,
        kcal: m.macros ? formatKcal(m.macros.calories) : null,
        favourite: m.favourite,
      })),
      canRegenerate: canRegenerate(day.date, today),
      regenerating,
      regenerateFailed,
      favouriteFailed,
    };
  };

  const state = viewState();
  return (
    <ComidasView
      state={state}
      onSelectDay={(i) => {
        setDayIndex(i);
        setRegenerateFailed(false);
      }}
      onOpenMeal={(meal) => {
        if (!meal.recipe) return;
        openedMeal.current = true;
        navigation.navigate('MealDetail', { mealId: meal.id, title: meal.recipe.title });
      }}
      onToggleFavourite={(meal) => meal.recipe && toggleFavourite(meal.recipe.id, !meal.favourite)}
      onRegenerate={() => state.status === 'ready' && regenerate(state.days[state.selected]!.date)}
      onOpenShoppingList={
        session.hasFeature(FeatureKey.SHOPPING_LIST) ? () => navigation.navigate('ShoppingList') : undefined
      }
    />
  );
}
