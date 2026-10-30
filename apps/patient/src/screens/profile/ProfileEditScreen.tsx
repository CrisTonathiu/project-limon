import { ApiError } from '@limon/api-client';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Button, Text, useAppTheme } from '../../design-system';
import {
  draftFromProfile, formErrors, hasErrors, ONBOARDING_STEPS, toProfileInput, type OnboardingDraft,
} from '../../features/onboarding/onboarding-form';
import { ProfileFields } from '../../features/onboarding/ProfileFields';
import { useFoodCatalog } from '../../features/onboarding/use-food-catalog';
import { t } from '../../i18n/es-MX';
import type { AppStackParamList } from '../../navigation/types';
import { api } from '../../services/api';

/**
 * Edits the questionnaire answers: the onboarding fields and checks, all on one page.
 * Saves the whole questionnaire in one PUT, like onboarding.
 */
export function ProfileEditScreen({ navigation, route }: NativeStackScreenProps<AppStackParamList, 'ProfileEdit'>) {
  const { spacing } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<OnboardingDraft>(() => draftFromProfile(route.params.profile));
  // As in onboarding, errors appear only once "Guardar" is pressed.
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const catalog = useFoodCatalog();

  const errors = showErrors ? formErrors(draft) : {};
  const update = (patch: Partial<OnboardingDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const save = async () => {
    const input = toProfileInput(draft);
    if (!input) return setShowErrors(true);
    setBusy(true);
    setSaveError(null);
    try {
      await api.patients.saveMyProfile(input);
      // The profile screen reloads on focus.
      navigation.goBack();
    } catch (err) {
      console.error('[profile] saving the profile failed', err);
      setSaveError(err instanceof ApiError && err.code === 'VALIDATION_ERROR' ? t.auth.errors.invalidData : t.common.networkError);
      setBusy(false);
    }
  };

  return (
    <Box flex={1} backgroundColor="background">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xl + insets.bottom, gap: spacing.s }}
      >
        {ONBOARDING_STEPS.map((step) => (
          <Box key={step} gap="s" marginBottom="l">
            <Text variant="h2" accessibilityRole="header">
              {t.onboarding[step].title}
            </Text>
            <ProfileFields step={step} draft={draft} update={update} errors={errors} catalog={catalog} />
          </Box>
        ))}

        {hasErrors(errors) ? (
          <Text variant="label" color="danger">
            {t.profile.fixErrors}
          </Text>
        ) : null}
        <Button label={busy ? t.profile.saving : t.profile.save} busy={busy} onPress={() => void save()} />
        {saveError ? (
          <Text variant="label" color="danger">
            {saveError}
          </Text>
        ) : null}
      </ScrollView>
    </Box>
  );
}
