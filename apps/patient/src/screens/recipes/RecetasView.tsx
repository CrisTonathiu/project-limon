import { Pressable, ScrollView, TextInput } from 'react-native';
import Animated from 'react-native-reanimated';
import {
  Box,
  Entering,
  FilterChip,
  fonts,
  Icon,
  LoadState,
  ScreenHeader,
  ScreenScroll,
  Text,
  useAppTheme,
  usePressScale,
  type AppTheme,
} from '../../design-system';
import { t } from '../../i18n/es-MX';

export type RecipeCard = {
  id: string;
  title: string;
  /** "10 min · 1 porción" */
  meta: string;
};

export type RecetasViewProps<F extends string> = {
  query: string;
  onChangeQuery: (query: string) => void;
  filters: { key: F; label: string }[];
  filter: F;
  onSelectFilter: (key: F) => void;
  state:
    | { status: 'loading' }
    | { status: 'failed'; onRetry: () => void }
    | { status: 'loaded'; recipes: RecipeCard[] };
  onOpenRecipe?: (recipe: RecipeCard) => void;
};

type ColorKey = keyof AppTheme['colors'];
/** Recipes have no photos yet: each card gets a tinted block, cycling through these. */
const BLOCKS: [ColorKey, ColorKey][] = [
  ['primaryTint', 'primary'],
  ['accentTrack', 'accentText'],
  ['divider', 'textMuted'],
];

/** Recetas (docs/ui/mockups/04-recetas.html): search, meal-type chips and a two-column grid. */
export function RecetasView<F extends string>(props: RecetasViewProps<F>) {
  const { colors, spacing } = useAppTheme();
  const { state } = props;
  const rows: RecipeCard[][] = [];
  if (state.status === 'loaded') {
    for (let i = 0; i < state.recipes.length; i += 2) rows.push(state.recipes.slice(i, i + 2));
  }
  return (
    <ScreenScroll>
      <ScreenHeader title={t.nav.recipes} delay={0} />
      <Entering delay={60}>
        <Box
          flexDirection="row"
          alignItems="center"
          gap="s"
          backgroundColor="surface"
          borderRadius="pill"
          paddingHorizontal="l"
          minHeight={48}
        >
          <Icon name="search" color="textMuted" />
          <TextInput
            value={props.query}
            onChangeText={props.onChangeQuery}
            placeholder={t.recipes.searchPlaceholder}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={t.recipes.searchPlaceholder}
            returnKeyType="search"
            autoCorrect={false}
            clearButtonMode="while-editing"
            style={{
              flex: 1,
              minHeight: 44,
              fontFamily: fonts.body,
              fontSize: 15,
              color: colors.text,
            }}
          />
        </Box>
      </Entering>
      <Entering delay={120}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          // Let the chips run to the screen edge.
          style={{ marginHorizontal: -spacing.xl }}
          contentContainerStyle={{ gap: spacing.s, paddingHorizontal: spacing.xl }}
          accessibilityRole="radiogroup"
        >
          {props.filters.map((f) => (
            <FilterChip
              key={f.key}
              label={f.label}
              selected={f.key === props.filter}
              onPress={() => props.onSelectFilter(f.key)}
            />
          ))}
        </ScrollView>
      </Entering>
      {state.status === 'loading' ? <LoadState status="loading" /> : null}
      {state.status === 'failed' ? (
        <LoadState
          status="failed"
          message={t.recipes.loadFailed}
          retryLabel={t.recipes.retry}
          onRetry={state.onRetry}
        />
      ) : null}
      {state.status === 'loaded' && !state.recipes.length ? (
        <Text variant="label">{props.query.trim() ? t.recipes.noMatches : t.recipes.empty}</Text>
      ) : null}
      {rows.map((row, r) => (
        <Box key={row[0]!.id} flexDirection="row" gap="m">
          {row.map((recipe, c) => {
            const i = r * 2 + c;
            return (
              <Box key={recipe.id} flex={1}>
                <Card
                  recipe={recipe}
                  block={BLOCKS[i % BLOCKS.length]!}
                  delay={180 + Math.min(i, 8) * 70}
                  onPress={() => props.onOpenRecipe?.(recipe)}
                />
              </Box>
            );
          })}
          {row.length === 1 ? <Box flex={1} /> : null}
        </Box>
      ))}
    </ScreenScroll>
  );
}

function Card({
  recipe,
  block: [bg, fg],
  delay,
  onPress,
}: {
  recipe: RecipeCard;
  block: [ColorKey, ColorKey];
  delay: number;
  onPress: () => void;
}) {
  const press = usePressScale();
  return (
    <Entering delay={delay}>
      <Pressable
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityLabel={`${recipe.title}, ${recipe.meta}`}
      >
        <Animated.View style={press.style}>
          <Box backgroundColor="surface" borderRadius="m" overflow="hidden">
            <Box height={96} backgroundColor={bg} alignItems="center" justifyContent="center">
              <Icon name="bowl" color={fg} size={36} strokeWidth={1.6} />
            </Box>
            <Box paddingHorizontal="m" paddingTop="s" paddingBottom="m" gap="xs">
              <Text variant="bodyStrong" lineHeight={19}>
                {recipe.title}
              </Text>
              <Text variant="caption">{recipe.meta}</Text>
            </Box>
          </Box>
        </Animated.View>
      </Pressable>
    </Entering>
  );
}
