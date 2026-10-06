import type { RecipeDetailDto } from '@limon/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { formatAmount, formatMinutes } from '../../features/recipes/recipe-format';
import { t } from '../../i18n/es-MX';
import { plural } from '../../i18n/format';
import type { AppStackParamList } from '../../navigation/types';
import { api } from '../../services/api';
import { RecipeDetailView, type RecipeDetailViewProps } from './RecipeDetailView';

type Load =
  { status: 'loading' } | { status: 'failed' } | { status: 'loaded'; recipe: RecipeDetailDto };

/** One recipe: macros per serving (from FatSecret), ingredients and steps. */
export function RecipeDetailScreen({
  route,
  navigation,
}: NativeStackScreenProps<AppStackParamList, 'RecipeDetail'>) {
  const { recipeId, title } = route.params;
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  const fetchRecipe = useCallback(() => {
    setLoad({ status: 'loading' });
    api.recipes
      .get(recipeId)
      .then((recipe) => setLoad({ status: 'loaded', recipe }))
      .catch((err) => {
        console.error('[recipes] loading the recipe failed', err);
        setLoad({ status: 'failed' });
      });
  }, [recipeId]);
  useEffect(fetchRecipe, [fetchRecipe]);

  const state = (): RecipeDetailViewProps['state'] => {
    if (load.status === 'loading') return load;
    if (load.status === 'failed') return { status: 'failed', onRetry: fetchRecipe };
    const { recipe } = load;
    return {
      status: 'loaded',
      title: recipe.title,
      meta: [
        ...recipe.mealTypes.map((m) => t.recipes.mealTypes[m]),
        recipe.totalMinutes ? formatMinutes(recipe.totalMinutes) : null,
        plural(recipe.servings, t.recipes.servingOne, t.recipes.servingOther),
      ].filter((m): m is string => !!m),
      description: recipe.description,
      macrosPerServing: recipe.macrosPerServing,
      ingredients: recipe.ingredients.map((i, n) => ({
        key: `${i.foodId}-${n}`,
        name: i.note ? `${i.name}, ${i.note}` : i.name,
        amount: formatAmount(i.quantity, i.unit),
      })),
      steps: recipe.steps,
    };
  };

  return (
    <RecipeDetailView state={state()} fallbackTitle={title} onBack={() => navigation.goBack()} />
  );
}
