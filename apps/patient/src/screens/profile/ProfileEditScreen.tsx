import { ApiError } from '@limon/api-client';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import {
  draftFromProfile, formErrors, hasErrors, ONBOARDING_STEPS, toProfileInput, type OnboardingDraft,
} from '../../features/onboarding/onboarding-form';
import { ProfileFields } from '../../features/onboarding/ProfileFields';
import { t } from '../../i18n/es-MX';
import type { AppStackParamList } from '../../navigation/types';
import { api } from '../../services/api';
import { useTenantTheme } from '../../theme/theme-context';

/**
 * Edits the questionnaire answers: the onboarding fields and checks, all on one page.
 * Saves the whole questionnaire in one PUT, like onboarding.
 */
export function ProfileEditScreen({ navigation, route }: NativeStackScreenProps<AppStackParamList, 'ProfileEdit'>) {
  const { theme } = useTenantTheme();
  const [draft, setDraft] = useState<OnboardingDraft>(() => draftFromProfile(route.params.profile));
  // As in onboarding, errors appear only once "Guardar" is pressed.
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.sm }}
      keyboardShouldPersistTaps="handled"
    >
      {ONBOARDING_STEPS.map((step) => (
        <View key={step} style={{ gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
          <Text style={{ fontSize: theme.typography.fontSize.lg, fontWeight: '700', color: theme.colors.text }}>
            {t.onboarding[step].title}
          </Text>
          <ProfileFields step={step} draft={draft} update={update} errors={errors} />
        </View>
      ))}

      {hasErrors(errors) ? <Text style={{ color: theme.colors.danger }}>{t.profile.fixErrors}</Text> : null}
      <Button label={busy ? t.profile.saving : t.profile.save} disabled={busy} onPress={() => void save()} />
      {saveError ? <Text style={{ color: theme.colors.danger }}>{saveError}</Text> : null}
    </ScrollView>
  );
}
