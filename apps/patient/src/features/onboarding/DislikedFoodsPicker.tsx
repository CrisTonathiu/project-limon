import type { FoodOptionDto } from '@limon/types';
import { PATIENT_PROFILE_LIMITS } from '@limon/validation';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { t } from '../../i18n/es-MX';
import { useTenantTheme } from '../../theme/theme-context';
import { addDislikedFood, searchFoods } from './onboarding-form';
import { useFoodCatalog } from './use-food-catalog';

/**
 * Disliked foods, picked from the food catalog: the patient types, taps a match, and it
 * becomes a chip. Only catalog foods can be picked, so the meal plan can leave them out.
 */
export function DislikedFoodsPicker({ value, onChange }: { value: FoodOptionDto[]; onChange: (foods: FoodOptionDto[]) => void }) {
  const { theme } = useTenantTheme();
  const { load, retry } = useFoodCatalog();
  const [query, setQuery] = useState('');

  const full = value.length >= PATIENT_PROFILE_LIMITS.dislikedFoods.maxItems;
  const matches = load.status === 'loaded' ? searchFoods(load.foods, query, value) : [];
  const pick = (food: FoodOptionDto) => {
    onChange(addDislikedFood(value, food));
    setQuery('');
  };

  const search = () => {
    if (load.status === 'loading') return <ActivityIndicator color={theme.colors.primary} accessibilityLabel={t.onboarding.dislikes.loading} />;
    if (load.status === 'failed') {
      return (
        <View style={{ gap: theme.spacing.xs }}>
          <Text style={{ color: theme.colors.danger }}>{t.onboarding.dislikes.loadError}</Text>
          <Pressable accessibilityRole="button" onPress={retry} style={{ paddingVertical: theme.spacing.xs }}>
            <Text style={{ color: theme.colors.primary, fontWeight: '600' }}>{t.onboarding.dislikes.retry}</Text>
          </Pressable>
        </View>
      );
    }
    if (full) return <Text style={{ color: theme.colors.textMuted }}>{t.onboarding.dislikes.full}</Text>;
    return (
      <>
        <TextInput
          placeholder={t.onboarding.dislikes.placeholder}
          placeholderTextColor={theme.colors.textMuted}
          value={query}
          onChangeText={setQuery}
          // "Done" picks the best match, like tapping it.
          onSubmitEditing={() => matches[0] && pick(matches[0])}
          returnKeyType="done"
          autoCorrect={false}
          accessibilityLabel={t.onboarding.dislikes.title}
          style={{
            borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm,
            padding: theme.spacing.sm, color: theme.colors.text,
          }}
        />
        {matches.map((food) => (
          <Pressable
            key={food.id}
            accessibilityRole="button"
            accessibilityLabel={t.onboarding.dislikes.add(food.name)}
            onPress={() => pick(food)}
            style={{ paddingVertical: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}
          >
            <Text style={{ color: theme.colors.text }}>{food.name}</Text>
          </Pressable>
        ))}
        {query.trim() && !matches.length ? <Text style={{ color: theme.colors.textMuted }}>{t.onboarding.dislikes.noMatches}</Text> : null}
      </>
    );
  };

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {search()}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {value.map((food) => (
          <Pressable
            key={food.id}
            accessibilityRole="button"
            accessibilityLabel={t.onboarding.dislikes.remove(food.name)}
            onPress={() => onChange(value.filter((f) => f.id !== food.id))}
            style={{
              backgroundColor: theme.colors.surface, borderRadius: theme.radius.pill,
              paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.md,
            }}
          >
            <Text style={{ color: theme.colors.text }}>{food.name} ✕</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
