import type { RecipeDetailDto } from '@limon/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { formatAmount, formatMinutes } from '../../features/recipes/recipe-format';
import { t } from '../../i18n/es-MX';
import { formatGrams, formatKcal, formatNumber, plural } from '../../i18n/format';
import type { AppStackParamList } from '../../navigation/types';
import { api } from '../../services/api';
import { useTenantTheme } from '../../theme/theme-context';

type Load = { status: 'loading' } | { status: 'failed' } | { status: 'loaded'; recipe: RecipeDetailDto };

/** One recipe: macros per serving (from FatSecret), ingredients and steps. */
export function RecipeDetailScreen({ route }: NativeStackScreenProps<AppStackParamList, 'RecipeDetail'>) {
  const { recipeId } = route.params;
  const { theme } = useTenantTheme();
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

  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.md, gap: theme.spacing.sm }}>
      <Text accessibilityRole="header" style={{ color: theme.colors.text, fontWeight: '700', fontSize: theme.typography.fontSize.lg }}>{title}</Text>
      {children}
    </View>
  );
  const Line = ({ children, muted }: { children: ReactNode; muted?: boolean }) => (
    <Text style={{ color: muted ? theme.colors.textMuted : theme.colors.text }}>{children}</Text>
  );

  const content = (recipe: RecipeDetailDto) => {
    const macros = recipe.macrosPerServing;
    return (
      <>
        <Line muted>
          {[
            recipe.mealTypes.map((m) => t.recipes.mealTypes[m]).join(' · '),
            recipe.totalMinutes ? formatMinutes(recipe.totalMinutes) : null,
            t.recipes.servings(plural(recipe.servings, t.recipes.servingOne, t.recipes.servingOther)),
          ].filter(Boolean).join('  ·  ')}
        </Line>
        {recipe.description ? <Line>{recipe.description}</Line> : null}

        <Section title={t.recipes.perServing}>
          {macros ? (
            <>
              <Text style={{ color: theme.colors.text, fontSize: theme.typography.fontSize.xl, fontWeight: '700' }}>{formatKcal(macros.calories)}</Text>
              <Line>
                {t.recipes.macros(formatGrams(macros.protein), formatGrams(macros.carbohydrate), formatGrams(macros.fat))}
              </Line>
            </>
          ) : (
            <Line muted>{t.recipes.nutritionUnavailable}</Line>
          )}
        </Section>

        <Section title={t.recipes.ingredients}>
          {recipe.ingredients.map((i, n) => (
            <Line key={n}>
              {`• ${formatAmount(i.quantity, i.unit)} ${i.name}${i.note ? `, ${i.note}` : ''}`}
            </Line>
          ))}
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
          <Line>{t.recipes.detailFailed}</Line>
          <Button label={t.recipes.retry} onPress={fetchRecipe} />
        </>
      ) : null}
      {load.status === 'loaded' ? content(load.recipe) : null}
    </ScrollView>
  );
}
