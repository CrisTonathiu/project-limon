import { ApiError } from '@limon/api-client';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import {
  addDislikedFood, emptyDraft, hasErrors, ONBOARDING_STEPS, stepErrors, toProfileInput, type OnboardingDraft,
} from '../../features/onboarding/onboarding-form';
import { ProfileFields } from '../../features/onboarding/ProfileFields';
import { t } from '../../i18n/es-MX';
import { api } from '../../services/api';
import { useSession } from '../../state/session-context';
import { useTenantTheme } from '../../theme/theme-context';

/**
 * The onboarding questionnaire, one topic per step. Shown after sign-up until the patient
 * has a profile (before the paywall: the profile API doesn't need a subscription).
 * Nothing is saved until the last step; the whole questionnaire goes in one PUT.
 */
export function OnboardingScreen() {
  const session = useSession();
  const { theme } = useTenantTheme();
  const [draft, setDraft] = useState<OnboardingDraft>(emptyDraft);
  const [stepIndex, setStepIndex] = useState(0);
  // Errors appear only after "Siguiente" is pressed, not while the patient is still typing.
  const [showErrors, setShowErrors] = useState(false);
  const [dislikeText, setDislikeText] = useState('');
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const step = ONBOARDING_STEPS[stepIndex]!;
  const isLast = stepIndex === ONBOARDING_STEPS.length - 1;
  const errors = showErrors ? stepErrors(step, draft) : {};
  const update = (patch: Partial<OnboardingDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const goBack = () => {
    setShowErrors(false);
    setStepIndex((i) => i - 1);
  };

  const goNext = async () => {
    if (hasErrors(stepErrors(step, draft))) return setShowErrors(true);
    setShowErrors(false);
    if (!isLast) return setStepIndex((i) => i + 1);

    // A food typed but not yet added with "Agregar" still counts.
    const input = toProfileInput({ ...draft, dislikedFoods: addDislikedFood(draft.dislikedFoods, dislikeText) });
    if (!input) return; // Every step was checked on the way here.
    setBusy(true);
    setSaveError(null);
    try {
      await api.patients.saveMyProfile(input);
      // Reloads the session; with a profile saved, the navigator moves on from onboarding.
      await session.refresh();
    } catch (err) {
      console.error('[onboarding] saving the profile failed', err);
      setSaveError(err instanceof ApiError && err.code === 'VALIDATION_ERROR' ? t.auth.errors.invalidData : t.common.networkError);
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.sm }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: theme.colors.textMuted }}>{t.onboarding.progress(stepIndex + 1, ONBOARDING_STEPS.length)}</Text>
        <Text style={{ fontSize: theme.typography.fontSize.xl, fontWeight: '700', color: theme.colors.text }}>
          {t.onboarding[step].title}
        </Text>
        {stepIndex === 0 ? <Text style={{ color: theme.colors.text }}>{t.onboarding.intro}</Text> : null}

        <ProfileFields step={step} draft={draft} update={update} errors={errors} dislikeText={dislikeText} setDislikeText={setDislikeText} />

        <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
          <Button label={busy ? t.onboarding.saving : isLast ? t.onboarding.finish : t.onboarding.next} disabled={busy} onPress={() => void goNext()} />
          {saveError ? <Text style={{ color: theme.colors.danger }}>{saveError}</Text> : null}
          {stepIndex > 0 ? (
            <Pressable accessibilityRole="button" onPress={goBack} disabled={busy} style={{ padding: theme.spacing.sm }}>
              <Text style={{ color: theme.colors.primary, textAlign: 'center' }}>{t.onboarding.back}</Text>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => void session.signOut()} style={{ padding: theme.spacing.sm }}>
              <Text style={{ color: theme.colors.textMuted, textAlign: 'center' }}>{t.common.signOut}</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
