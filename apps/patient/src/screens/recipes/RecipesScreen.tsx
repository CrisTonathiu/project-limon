import { MealType, type RecipeSummaryDto } from '@limon/types';
import { useCallback, useEffect, useState } from 'react';
import { formatMinutes } from '../../features/recipes/recipe-format';
import { matchesSearch } from '../../features/recipes/recipe-search';
import { t } from '../../i18n/es-MX';
import { plural } from '../../i18n/format';
import type { TabScreenProps } from '../../navigation/types';
import { api } from '../../services/api';
import { RecetasView, type RecetasViewProps } from './RecetasView';

type Load =
  { status: 'loading' } | { status: 'failed' } | { status: 'loaded'; recipes: RecipeSummaryDto[] };
type Filter = MealType | 'ALL';

const FILTERS: Filter[] = [
  'ALL',
  MealType.BREAKFAST,
  MealType.LUNCH,
  MealType.DINNER,
  MealType.SNACK,
];

/** The tenant's recipes, filtered by meal type and searched by title on the device. */
export function RecipesScreen({ navigation }: TabScreenProps<'Recipes'>) {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [query, setQuery] = useState('');
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // A slower answer for the previous filter must not replace this one.
    let current = true;
    setLoad({ status: 'loading' });
    api.recipes
      .list(filter === 'ALL' ? undefined : filter)
      .then(({ items }) => current && setLoad({ status: 'loaded', recipes: items }))
      .catch((err) => {
        console.error('[recipes] loading the recipes failed', err);
        if (current) setLoad({ status: 'failed' });
      });
    return () => {
      current = false;
    };
  }, [filter, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  const state: RecetasViewProps<Filter>['state'] =
    load.status === 'loaded'
      ? {
          status: 'loaded',
          recipes: load.recipes
            .filter((r) => matchesSearch(r.title, query))
            .map((r) => ({
              id: r.id,
              title: r.title,
              meta: t.recipes.meta(
                [
                  r.totalMinutes ? formatMinutes(r.totalMinutes) : null,
                  plural(r.servings, t.recipes.servingOne, t.recipes.servingOther),
                ].filter((m): m is string => !!m),
              ),
            })),
        }
      : load.status === 'failed'
        ? { status: 'failed', onRetry: retry }
        : load;

  return (
    <RecetasView
      query={query}
      onChangeQuery={setQuery}
      filters={FILTERS.map((key) => ({
        key,
        label: key === 'ALL' ? t.recipes.all : t.recipes.mealTypes[key],
      }))}
      filter={filter}
      onSelectFilter={setFilter}
      state={state}
      onOpenRecipe={(recipe) =>
        navigation.navigate('RecipeDetail', { recipeId: recipe.id, title: recipe.title })
      }
    />
  );
}
