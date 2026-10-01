import { ApiError } from '@limon/api-client';
import { ActivityLevel, Allergen, BiologicalSex } from '@limon/types';
import { PATIENT_PROFILE_LIMITS } from '@limon/validation';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { Choice } from '../../components/Choice';
import {
  addDislikedFood, emptyDraft, hasErrors, ONBOARDING_STEPS, stepErrors, toProfileInput,
  type FieldError, type OnboardingDraft,
} from '../../features/onboarding/onboarding-form';
import { t } from '../../i18n/es-MX';
import { api } from '../../services/api';
import { useSession } from '../../state/session-context';
import { useTenantTheme } from '../../theme/theme-context';

const MEAL_OPTIONS = [3, 4, 5];

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

  /** `rangeMessage` explains the expected unit and range; only number fields can be out of range. */
  const errorText = (error: FieldError | undefined, rangeMessage?: string) =>
    error ? (
      <Text style={{ color: theme.colors.danger }}>{error === 'outOfRange' ? rangeMessage : t.onboarding.errors[error]}</Text>
    ) : null;

  const input = (props: TextInputProps) => (
    <TextInput
      {...props}
      placeholderTextColor={theme.colors.textMuted}
      style={[
        {
          borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm,
          padding: theme.spacing.sm, color: theme.colors.text,
        },
        props.style,
      ]}
    />
  );

  const Label = ({ children }: { children: ReactNode }) => (
    <Text style={{ color: theme.colors.text, fontWeight: '600', marginTop: theme.spacing.sm }}>{children}</Text>
  );
  const Hint = ({ children }: { children: ReactNode }) => <Text style={{ color: theme.colors.textMuted }}>{children}</Text>;

  const steps = {
    aboutYou: () => (
      <>
        <Label>{t.onboarding.aboutYou.sex}</Label>
        <Hint>{t.onboarding.aboutYou.sexHint}</Hint>
        <Choice label={t.onboarding.aboutYou.female} selected={draft.sex === BiologicalSex.FEMALE} onPress={() => update({ sex: BiologicalSex.FEMALE })} />
        <Choice label={t.onboarding.aboutYou.male} selected={draft.sex === BiologicalSex.MALE} onPress={() => update({ sex: BiologicalSex.MALE })} />
        {errorText(errors.sex)}
        {draft.sex === BiologicalSex.FEMALE ? (
          <Choice
            role="checkbox"
            label={t.onboarding.aboutYou.pregnant}
            selected={draft.pregnantOrBreastfeeding}
            onPress={() => update({ pregnantOrBreastfeeding: !draft.pregnantOrBreastfeeding })}
          />
        ) : null}

        <Label>{t.onboarding.aboutYou.birthDate}</Label>
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          {input({
            placeholder: t.onboarding.aboutYou.day, keyboardType: 'number-pad', maxLength: 2, style: { flex: 1 },
            value: draft.birthDay, onChangeText: (birthDay) => update({ birthDay }), accessibilityLabel: t.onboarding.aboutYou.day,
          })}
          {input({
            placeholder: t.onboarding.aboutYou.month, keyboardType: 'number-pad', maxLength: 2, style: { flex: 1 },
            value: draft.birthMonth, onChangeText: (birthMonth) => update({ birthMonth }), accessibilityLabel: t.onboarding.aboutYou.month,
          })}
          {input({
            placeholder: t.onboarding.aboutYou.year, keyboardType: 'number-pad', maxLength: 4, style: { flex: 2 },
            value: draft.birthYear, onChangeText: (birthYear) => update({ birthYear }), accessibilityLabel: t.onboarding.aboutYou.year,
          })}
        </View>
        {errorText(errors.dateOfBirth)}
      </>
    ),
    body: () => (
      <>
        <Label>{t.onboarding.body.height}</Label>
        {input({
          placeholder: t.onboarding.body.heightPlaceholder, keyboardType: 'number-pad', maxLength: 3,
          value: draft.heightCm, onChangeText: (heightCm) => update({ heightCm }), accessibilityLabel: t.onboarding.body.height,
        })}
        {errorText(errors.heightCm, t.onboarding.errors.heightRange)}
        <Label>{t.onboarding.body.weight}</Label>
        {input({
          placeholder: t.onboarding.body.weightPlaceholder, keyboardType: 'decimal-pad', maxLength: 5,
          value: draft.weightKg, onChangeText: (weightKg) => update({ weightKg }), accessibilityLabel: t.onboarding.body.weight,
        })}
        {errorText(errors.weightKg, t.onboarding.errors.weightRange)}
      </>
    ),
    activity: () => (
      <>
        {Object.values(ActivityLevel).map((level) => (
          <Choice
            key={level}
            label={t.onboarding.activity.levels[level].label}
            hint={t.onboarding.activity.levels[level].hint}
            selected={draft.activityLevel === level}
            onPress={() => update({ activityLevel: level })}
          />
        ))}
        {errorText(errors.activityLevel)}
      </>
    ),
    meals: () => (
      <>
        <Hint>{t.onboarding.meals.hint}</Hint>
        {MEAL_OPTIONS.map((n) => (
          <Choice key={n} label={t.onboarding.meals.option(n)} selected={draft.mealsPerDay === n} onPress={() => update({ mealsPerDay: n })} />
        ))}
        {errorText(errors.mealsPerDay)}
      </>
    ),
    allergies: () => (
      <>
        <Hint>{t.onboarding.allergies.hint}</Hint>
        {Object.values(Allergen).map((allergen) => {
          const selected = draft.allergies.includes(allergen);
          return (
            <Choice
              key={allergen}
              role="checkbox"
              label={t.onboarding.allergies.names[allergen]}
              selected={selected}
              onPress={() =>
                update({ allergies: selected ? draft.allergies.filter((a) => a !== allergen) : [...draft.allergies, allergen] })
              }
            />
          );
        })}
      </>
    ),
    // Free text for now; becomes a pick from the food catalog in week 3.
    dislikes: () => {
      const add = () => {
        update({ dislikedFoods: addDislikedFood(draft.dislikedFoods, dislikeText) });
        setDislikeText('');
      };
      const full = draft.dislikedFoods.length >= PATIENT_PROFILE_LIMITS.dislikedFoods.maxItems;
      return (
        <>
          <Hint>{t.onboarding.dislikes.hint}</Hint>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            {input({
              placeholder: t.onboarding.dislikes.placeholder, maxLength: PATIENT_PROFILE_LIMITS.dislikedFoods.maxLength,
              value: dislikeText, onChangeText: setDislikeText, onSubmitEditing: add, returnKeyType: 'done',
              editable: !full, style: { flex: 1 }, accessibilityLabel: t.onboarding.dislikes.title,
            })}
            <Pressable accessibilityRole="button" onPress={add} disabled={full} style={{ justifyContent: 'center', paddingHorizontal: theme.spacing.sm }}>
              <Text style={{ color: theme.colors.primary, fontWeight: '600' }}>{t.onboarding.dislikes.add}</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {draft.dislikedFoods.map((food) => (
              <Pressable
                key={food}
                accessibilityRole="button"
                accessibilityLabel={t.onboarding.dislikes.remove(food)}
                onPress={() => update({ dislikedFoods: draft.dislikedFoods.filter((f) => f !== food) })}
                style={{
                  backgroundColor: theme.colors.surface, borderRadius: theme.radius.pill,
                  paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.md,
                }}
              >
                <Text style={{ color: theme.colors.text }}>{food} ✕</Text>
              </Pressable>
            ))}
          </View>
        </>
      );
    },
  } satisfies Record<(typeof ONBOARDING_STEPS)[number], () => ReactNode>;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.sm }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: theme.colors.textMuted }}>{t.onboarding.progress(stepIndex + 1, ONBOARDING_STEPS.length)}</Text>
        <Text style={{ fontSize: theme.typography.fontSize.xl, fontWeight: '700', color: theme.colors.text }}>
          {t.onboarding[step].title}
        </Text>
        {stepIndex === 0 ? <Text style={{ color: theme.colors.text }}>{t.onboarding.intro}</Text> : null}

        {steps[step]()}

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
