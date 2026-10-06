import type { RecipeMacros } from '@limon/types';
import {
  Box,
  Card,
  Chip,
  DetailBody,
  DetailHeader,
  LoadState,
  MacroBar,
  ScreenScroll,
  Text,
} from '../../design-system';
import { macroShares } from '../../features/recipes/macro-shares';
import { t } from '../../i18n/es-MX';
import { formatGrams, formatKcal } from '../../i18n/format';
import { AmountList, Section, StepList } from './RecipeParts';

export type RecipeDetailData = {
  title: string;
  /** Meal types, time and servings, shown as chips in the header. */
  meta: string[];
  description: string | null;
  /** Null when FatSecret couldn't give every ingredient: no partial numbers. */
  macrosPerServing: RecipeMacros | null;
  ingredients: { key: string; name: string; amount: string }[];
  steps: string[];
};

export type RecipeDetailViewProps = {
  state:
    | { status: 'loading' }
    | { status: 'failed'; onRetry: () => void }
    | ({ status: 'loaded' } & RecipeDetailData);
  /** Shown while the recipe loads. */
  fallbackTitle: string;
  onBack: () => void;
};

/** Detalle de receta (docs/ui/mockups/05-detalle-de-receta.html). */
export function RecipeDetailView({ state, fallbackTitle, onBack }: RecipeDetailViewProps) {
  const recipe = state.status === 'loaded' ? state : null;
  return (
    <ScreenScroll bleed gap="none">
      <DetailHeader
        title={recipe?.title ?? fallbackTitle}
        backLabel={t.common.back}
        onBack={onBack}
        delay={0}
      >
        {recipe ? (
          <Box flexDirection="row" flexWrap="wrap" gap="s">
            {recipe.meta.map((m) => (
              <Chip key={m} label={m} size="m" />
            ))}
          </Box>
        ) : null}
      </DetailHeader>
      <DetailBody gap="l">
        {state.status === 'loading' ? <LoadState status="loading" /> : null}
        {state.status === 'failed' ? (
          <LoadState
            status="failed"
            message={t.recipes.detailFailed}
            retryLabel={t.recipes.retry}
            onRetry={state.onRetry}
          />
        ) : null}
        {recipe ? (
          <>
            {recipe.description ? <Text variant="body">{recipe.description}</Text> : null}
            <PerServing macros={recipe.macrosPerServing} />
            <Section title={t.recipes.ingredients} delay={160}>
              <AmountList rows={recipe.ingredients} />
            </Section>
            <Section title={t.recipes.steps} delay={240}>
              <StepList steps={recipe.steps} />
            </Section>
          </>
        ) : null}
      </DetailBody>
    </ScreenScroll>
  );
}

function PerServing({ macros }: { macros: RecipeMacros | null }) {
  if (!macros) {
    return (
      <Card borderRadius="l" delay={80}>
        <Text variant="label">{t.recipes.nutritionUnavailable}</Text>
      </Card>
    );
  }
  const share = macroShares(macros);
  return (
    <Card borderRadius="l" delay={80} gap="m">
      <Box flexDirection="row" justifyContent="space-between" alignItems="baseline">
        <Text variant="label">{t.recipes.perServing}</Text>
        <Text variant="number">{formatKcal(macros.calories)}</Text>
      </Box>
      <MacroBar
        label={t.macros.proteinLabel}
        value={formatGrams(macros.protein)}
        progress={share.protein}
        color="primary"
        delay={300}
      />
      <MacroBar
        label={t.macros.carbsLabel}
        value={formatGrams(macros.carbohydrate)}
        progress={share.carbohydrate}
        color="accent"
        delay={420}
      />
      <MacroBar
        label={t.macros.fatLabel}
        value={formatGrams(macros.fat)}
        progress={share.fat}
        color="neutralStrong"
        delay={540}
      />
      <Text variant="caption" fontSize={11}>
        {t.recipes.attribution}
      </Text>
    </Card>
  );
}
