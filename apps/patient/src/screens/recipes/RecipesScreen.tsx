import { MealType, type RecipeSummaryDto } from '@limon/types';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { formatMinutes } from '../../features/recipes/recipe-format';
import { t } from '../../i18n/es-MX';
import { plural } from '../../i18n/format';
import type { TabScreenProps } from '../../navigation/types';
import { api } from '../../services/api';
import { useTenantTheme } from '../../theme/theme-context';

type Load = { status: 'loading' } | { status: 'failed' } | { status: 'loaded'; recipes: RecipeSummaryDto[] };

const FILTERS: (MealType | null)[] = [null, MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER, MealType.SNACK];

/** The tenant's recipes, filtered by meal type. */
export function RecipesScreen({ navigation }: TabScreenProps<'Recipes'>) {
  const { theme } = useTenantTheme();
  const [mealType, setMealType] = useState<MealType | null>(null);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // A slower answer for the previous filter must not replace this one.
    let current = true;
    setLoad({ status: 'loading' });
    api.recipes
      .list(mealType ?? undefined)
      .then(({ items }) => current && setLoad({ status: 'loaded', recipes: items }))
      .catch((err) => {
        console.error('[recipes] loading the recipes failed', err);
        if (current) setLoad({ status: 'failed' });
      });
    return () => {
      current = false;
    };
  }, [mealType, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  const filters = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.sm, paddingBottom: theme.spacing.md }}>
      {FILTERS.map((filter) => {
        const selected = filter === mealType;
        return (
          <Pressable
            key={filter ?? 'all'}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => setMealType(filter)}
            style={{
              paddingVertical: theme.spacing.sm,
              paddingHorizontal: theme.spacing.md,
              borderRadius: theme.radius.pill,
              borderWidth: 1,
              borderColor: selected ? theme.colors.primary : theme.colors.border,
              backgroundColor: selected ? theme.colors.primary : theme.colors.background,
            }}
          >
            <Text style={{ color: selected ? theme.colors.onPrimary : theme.colors.text, fontWeight: selected ? '600' : '400' }}>
              {filter ? t.recipes.mealTypes[filter] : t.recipes.all}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  const card = ({ item }: { item: RecipeSummaryDto }) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => navigation.navigate('RecipeDetail', { recipeId: item.id, title: item.title })}
      style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.md, gap: theme.spacing.xs }}
    >
      <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: theme.typography.fontSize.lg }}>{item.title}</Text>
      <Text style={{ color: theme.colors.textMuted }}>
        {[
          item.mealTypes.map((m) => t.recipes.mealTypes[m]).join(' · '),
          item.totalMinutes ? formatMinutes(item.totalMinutes) : null,
        ].filter(Boolean).join('  ·  ')}
      </Text>
      <Text style={{ color: theme.colors.textMuted }}>
        {t.recipes.servings(plural(item.servings, t.recipes.servingOne, t.recipes.servingOther))}
      </Text>
    </Pressable>
  );

  return (
    <FlatList
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md }}
      data={load.status === 'loaded' ? load.recipes : []}
      keyExtractor={(r) => r.id}
      renderItem={card}
      ListHeaderComponent={filters}
      ListEmptyComponent={
        load.status === 'loading' ? (
          <ActivityIndicator />
        ) : load.status === 'failed' ? (
          <View style={{ gap: theme.spacing.md }}>
            <Text style={{ color: theme.colors.text }}>{t.recipes.loadFailed}</Text>
            <Button label={t.recipes.retry} onPress={retry} />
          </View>
        ) : (
          <Text style={{ color: theme.colors.textMuted }}>{t.recipes.empty}</Text>
        )
      }
    />
  );
}
