import type { FoodOptionDto } from '@limon/types';
import { PATIENT_PROFILE_LIMITS } from '@limon/validation';
import { useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { Box, Button, Icon, Text, TextField, useAppTheme } from '../../design-system';
import { t } from '../../i18n/es-MX';
import { addDislikedFood, searchFoods } from './onboarding-form';
import type { FoodCatalog } from './use-food-catalog';

/**
 * Disliked foods, picked from the food catalog: the patient types, taps a match, and it
 * becomes a chip. Only catalog foods can be picked, so the meal plan can leave them out.
 * The screen loads the catalog (useFoodCatalog), so the views stay free of API calls.
 */
export function DislikedFoodsPicker({ value, onChange, catalog }: { value: FoodOptionDto[]; onChange: (foods: FoodOptionDto[]) => void; catalog: FoodCatalog }) {
  const { colors } = useAppTheme();
  const { load, retry } = catalog;
  const [query, setQuery] = useState('');

  const full = value.length >= PATIENT_PROFILE_LIMITS.dislikedFoods.maxItems;
  const matches = load.status === 'loaded' ? searchFoods(load.foods, query, value) : [];
  const pick = (food: FoodOptionDto) => {
    onChange(addDislikedFood(value, food));
    setQuery('');
  };

  const search = () => {
    if (load.status === 'loading') return <ActivityIndicator color={colors.primary} accessibilityLabel={t.onboarding.dislikes.loading} />;
    if (load.status === 'failed') {
      return (
        <Box gap="s">
          <Text variant="label" color="danger">
            {t.onboarding.dislikes.loadError}
          </Text>
          <Button variant="outline" label={t.onboarding.dislikes.retry} onPress={retry} />
        </Box>
      );
    }
    if (full) return <Text variant="label">{t.onboarding.dislikes.full}</Text>;
    return (
      <>
        <TextField
          placeholder={t.onboarding.dislikes.placeholder}
          accessibilityLabel={t.onboarding.dislikes.title}
          value={query}
          onChangeText={setQuery}
          // "Done" picks the best match, like tapping it.
          onSubmitEditing={() => matches[0] && pick(matches[0])}
          returnKeyType="done"
          autoCorrect={false}
          maxLength={60}
        />
        {matches.length ? (
          <Box backgroundColor="surface" borderRadius="m" overflow="hidden">
            {matches.map((food, i) => (
              <Pressable key={food.id} accessibilityRole="button" accessibilityLabel={t.onboarding.dislikes.add(food.name)} onPress={() => pick(food)}>
                <Box
                  minHeight={48}
                  paddingHorizontal="l"
                  justifyContent="center"
                  borderTopWidth={i ? 1 : 0}
                  borderTopColor="divider"
                >
                  <Text variant="body">{food.name}</Text>
                </Box>
              </Pressable>
            ))}
          </Box>
        ) : null}
        {query.trim() && !matches.length ? <Text variant="label">{t.onboarding.dislikes.noMatches}</Text> : null}
      </>
    );
  };

  return (
    <Box gap="s">
      {search()}
      <Box flexDirection="row" flexWrap="wrap" gap="s">
        {value.map((food) => (
          <Pressable
            key={food.id}
            accessibilityRole="button"
            accessibilityLabel={t.onboarding.dislikes.remove(food.name)}
            onPress={() => onChange(value.filter((f) => f.id !== food.id))}
          >
            <Box flexDirection="row" alignItems="center" gap="xs" minHeight={44} paddingLeft="l" paddingRight="m" borderRadius="pill" backgroundColor="primaryTint">
              <Text variant="chip">{food.name}</Text>
              <Icon name="close" size={16} color="textMuted" />
            </Box>
          </Pressable>
        ))}
      </Box>
    </Box>
  );
}
