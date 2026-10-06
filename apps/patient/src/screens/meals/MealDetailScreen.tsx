import { FeatureKey, type PlannedMealDetailDto } from '@limon/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { mealIngredientParts } from '../../features/meal-plans/meal-ingredient';
import { canRegenerate, formatPortion } from '../../features/meal-plans/meal-plan-format';
import { formatMinutes } from '../../features/recipes/recipe-format';
import { t } from '../../i18n/es-MX';
import { formatDate, formatGrams, formatKcal, toDateOnly } from '../../i18n/format';
import type { AppStackParamList } from '../../navigation/types';
import { api } from '../../services/api';
import { useSession } from '../../state/session-context';
import {
  MealDetailView,
  type MealDetailViewProps,
  type MealIngredientRow,
  type SwapSheetState,
} from './MealDetailView';

type Load =
  { status: 'loading' } | { status: 'failed' } | { status: 'loaded'; meal: PlannedMealDetailDto };

/**
 * One meal of this week's plan, for the patient's portion: macros, ingredients and steps.
 * From today on, an ingredient with SMAE data can be swapped for an equivalent food (when
 * the tenant has the food_swaps module); the swap applies to this meal only.
 */
export function MealDetailScreen({
  route,
  navigation,
}: NativeStackScreenProps<AppStackParamList, 'MealDetail'>) {
  const { mealId, title } = route.params;
  const session = useSession();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [swap, setSwap] = useState<SwapSheetState | null>(null);

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

  const openSwap = (ingredient: MealIngredientRow) => {
    setSwap({
      ingredient,
      status: 'loading',
      options: [],
      selected: ingredient.foodId,
      saving: false,
      saveFailed: false,
    });
    api.mealPlans
      .swapOptions(mealId, ingredient.id)
      .then(({ items }) =>
        setSwap((prev) =>
          prev?.ingredient.id === ingredient.id
            ? {
                ...prev,
                status: 'loaded',
                options: items.map((o) => ({
                  foodId: o.foodId,
                  name: o.name,
                  amount: formatGrams(o.grams),
                  original: o.original,
                })),
              }
            : prev,
        ),
      )
      .catch((err) => {
        console.error('[meals] loading the swap options failed', err);
        setSwap((prev) =>
          prev?.ingredient.id === ingredient.id ? { ...prev, status: 'failed' } : prev,
        );
      });
  };

  const confirmSwap = () => {
    if (!swap?.selected) return;
    const { ingredient, selected } = swap;
    setSwap({ ...swap, saving: true, saveFailed: false });
    api.mealPlans
      .swap(mealId, ingredient.id, selected)
      .then((meal) => {
        setLoad({ status: 'loaded', meal });
        setSwap(null);
      })
      .catch((err) => {
        console.error('[meals] saving the swap failed', err);
        setSwap((prev) => (prev ? { ...prev, saving: false, saveFailed: true } : prev));
      });
  };

  const state = (): MealDetailViewProps['state'] => {
    if (load.status === 'loading') return load;
    if (load.status === 'failed') return { status: 'failed', onRetry: fetchMeal };
    const { meal } = load;
    return {
      status: 'loaded',
      title: meal.recipe.title,
      caption: `${t.recipes.mealTypes[meal.mealType]} · ${formatDate(meal.date)}`,
      meta: [
        formatPortion(meal.servings),
        meal.recipe.totalMinutes ? formatMinutes(meal.recipe.totalMinutes) : null,
        meal.macros ? formatKcal(meal.macros.calories) : null,
      ].filter((m): m is string => !!m),
      description: meal.recipe.description,
      macros: meal.macros,
      ingredients: meal.ingredients.map((i) => ({
        id: i.id,
        foodId: i.foodId,
        ...mealIngredientParts(i),
        insteadOf: i.swappedFrom?.name ?? null,
        swappable: i.swappable,
      })),
      steps: meal.recipe.steps,
      canSwap:
        session.hasFeature(FeatureKey.FOOD_SWAPS) &&
        canRegenerate(meal.date, toDateOnly(new Date())),
    };
  };

  return (
    <MealDetailView
      state={state()}
      fallbackTitle={title}
      swap={swap}
      onBack={() => navigation.goBack()}
      onOpenSwap={openSwap}
      onSelectSwap={(foodId) =>
        setSwap((prev) => (prev ? { ...prev, selected: foodId, saveFailed: false } : prev))
      }
      onConfirmSwap={confirmSwap}
      onRetrySwap={() => swap && openSwap(swap.ingredient)}
      onCloseSwap={() => setSwap((prev) => (prev?.saving ? prev : null))}
    />
  );
}
