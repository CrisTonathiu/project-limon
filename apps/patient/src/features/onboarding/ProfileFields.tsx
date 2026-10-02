import { ActivityLevel, Allergen, BiologicalSex } from '@limon/types';
import type { ReactNode } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { Choice } from '../../components/Choice';
import { t } from '../../i18n/es-MX';
import { useTenantTheme } from '../../theme/theme-context';
import { DislikedFoodsPicker } from './DislikedFoodsPicker';
import type { FieldError, OnboardingDraft, OnboardingStep, StepErrors } from './onboarding-form';

const MEAL_OPTIONS = [3, 4, 5];

type Props = {
  step: OnboardingStep;
  draft: OnboardingDraft;
  update: (patch: Partial<OnboardingDraft>) => void;
  errors: StepErrors;
};

/**
 * The fields of one questionnaire step. Onboarding shows one step per page; the profile
 * edit screen shows every step on one page.
 */
export function ProfileFields({ step, draft, update, errors }: Props) {
  const { theme } = useTenantTheme();

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
    dislikes: () => (
      <>
        <Hint>{t.onboarding.dislikes.hint}</Hint>
        <DislikedFoodsPicker value={draft.dislikedFoods} onChange={(dislikedFoods) => update({ dislikedFoods })} />
      </>
    ),
  } satisfies Record<OnboardingStep, () => ReactNode>;

  return steps[step]();
}
