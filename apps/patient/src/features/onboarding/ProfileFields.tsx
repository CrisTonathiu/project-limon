import { ActivityLevel, Allergen, BiologicalSex } from '@limon/types';
import { mealSlotTypes } from '@limon/validation';
import type { ReactNode } from 'react';
import { Box, OptionCard, RoundButton, Text, TextField } from '../../design-system';
import { formatMealTime } from '../../i18n/format';
import { t } from '../../i18n/es-MX';
import { DislikedFoodsPicker } from './DislikedFoodsPicker';
import {
  MEAL_TIME_STEP_MINUTES, shiftMealTime, withMealsPerDay,
  type FieldError, type OnboardingDraft, type OnboardingStep, type StepErrors,
} from './onboarding-form';
import type { FoodCatalog } from './use-food-catalog';

const MEAL_OPTIONS = [3, 4, 5];

type Props = {
  step: OnboardingStep;
  draft: OnboardingDraft;
  update: (patch: Partial<OnboardingDraft>) => void;
  errors: StepErrors;
  /** For the disliked-foods step. */
  catalog: FoodCatalog;
};

/**
 * The fields of one questionnaire step. Onboarding shows one step per page; the profile
 * edit screen shows every step on one page.
 */
export function ProfileFields({ step, draft, update, errors, catalog }: Props) {
  /** `rangeMessage` explains the expected unit and range; only number fields can be out of range. */
  const errorText = (error: FieldError | undefined, rangeMessage?: string) =>
    error ? (
      <Text variant="label" color="danger">
        {error === 'outOfRange' ? rangeMessage : t.onboarding.errors[error]}
      </Text>
    ) : null;

  const Label = ({ children }: { children: ReactNode }) => (
    <Text variant="bodyStrong" marginTop="s">
      {children}
    </Text>
  );
  const Hint = ({ children }: { children: ReactNode }) => <Text variant="label">{children}</Text>;

  const steps = {
    aboutYou: () => (
      <>
        <Label>{t.onboarding.aboutYou.sex}</Label>
        <Hint>{t.onboarding.aboutYou.sexHint}</Hint>
        <OptionCard label={t.onboarding.aboutYou.female} selected={draft.sex === BiologicalSex.FEMALE} onPress={() => update({ sex: BiologicalSex.FEMALE })} />
        <OptionCard label={t.onboarding.aboutYou.male} selected={draft.sex === BiologicalSex.MALE} onPress={() => update({ sex: BiologicalSex.MALE })} />
        {errorText(errors.sex)}
        {draft.sex === BiologicalSex.FEMALE ? (
          <OptionCard
            multiple
            label={t.onboarding.aboutYou.pregnant}
            selected={draft.pregnantOrBreastfeeding}
            onPress={() => update({ pregnantOrBreastfeeding: !draft.pregnantOrBreastfeeding })}
          />
        ) : null}

        <Label>{t.onboarding.aboutYou.birthDate}</Label>
        <Box flexDirection="row" gap="s">
          <TextField
            flex={1} placeholder={t.onboarding.aboutYou.day} keyboardType="number-pad" maxLength={2}
            value={draft.birthDay} onChangeText={(birthDay) => update({ birthDay })}
          />
          <TextField
            flex={1} placeholder={t.onboarding.aboutYou.month} keyboardType="number-pad" maxLength={2}
            value={draft.birthMonth} onChangeText={(birthMonth) => update({ birthMonth })}
          />
          <TextField
            flex={2} placeholder={t.onboarding.aboutYou.year} keyboardType="number-pad" maxLength={4}
            value={draft.birthYear} onChangeText={(birthYear) => update({ birthYear })}
          />
        </Box>
        {errorText(errors.dateOfBirth)}
      </>
    ),
    body: () => (
      <>
        <Label>{t.onboarding.body.height}</Label>
        <TextField
          placeholder={t.onboarding.body.heightPlaceholder} accessibilityLabel={t.onboarding.body.height}
          keyboardType="number-pad" maxLength={3} suffix="cm"
          value={draft.heightCm} onChangeText={(heightCm) => update({ heightCm })}
        />
        {errorText(errors.heightCm, t.onboarding.errors.heightRange)}
        <Label>{t.onboarding.body.weight}</Label>
        <TextField
          placeholder={t.onboarding.body.weightPlaceholder} accessibilityLabel={t.onboarding.body.weight}
          keyboardType="decimal-pad" maxLength={5} suffix="kg"
          value={draft.weightKg} onChangeText={(weightKg) => update({ weightKg })}
        />
        {errorText(errors.weightKg, t.onboarding.errors.weightRange)}
      </>
    ),
    activity: () => (
      <>
        {Object.values(ActivityLevel).map((level) => (
          <OptionCard
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
          <OptionCard key={n} label={t.onboarding.meals.option(n)} selected={draft.mealsPerDay === n} onPress={() => update(withMealsPerDay(draft, n))} />
        ))}
        {errorText(errors.mealsPerDay)}
      </>
    ),
    mealTimes: () => (
      <>
        <Hint>{t.onboarding.mealTimes.hint}</Hint>
        {draft.mealsPerDay
          ? mealSlotTypes(draft.mealsPerDay).map((mealType, i) => {
              const time = draft.mealTimes[i];
              if (!time) return null;
              const shift = (minutes: number) =>
                update({ mealTimes: draft.mealTimes.map((value, j) => (j === i ? shiftMealTime(value, minutes) : value)) });
              return (
                <MealTimeRow
                  key={i}
                  meal={t.recipes.mealTypes[mealType]}
                  time={formatMealTime(time)}
                  onEarlier={() => shift(-MEAL_TIME_STEP_MINUTES)}
                  onLater={() => shift(MEAL_TIME_STEP_MINUTES)}
                />
              );
            })
          : null}
        {errorText(errors.mealTimes)}
      </>
    ),
    allergies: () => (
      <>
        <Hint>{t.onboarding.allergies.hint}</Hint>
        {Object.values(Allergen).map((allergen) => {
          const selected = draft.allergies.includes(allergen);
          return (
            <OptionCard
              key={allergen}
              multiple
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
        <DislikedFoodsPicker value={draft.dislikedFoods} onChange={(dislikedFoods) => update({ dislikedFoods })} catalog={catalog} />
      </>
    ),
  } satisfies Record<OnboardingStep, () => ReactNode>;

  return steps[step]();
}

/**
 * One meal's time with − and + (15 minutes a tap). Screen readers get one adjustable
 * element: swipe up or down to move the time.
 */
function MealTimeRow({ meal, time, onEarlier, onLater }: { meal: string; time: string; onEarlier: () => void; onLater: () => void }) {
  return (
    <Box
      flexDirection="row"
      alignItems="center"
      gap="m"
      minHeight={64}
      paddingLeft="l"
      paddingRight="s"
      borderRadius="m"
      backgroundColor="surface"
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={t.onboarding.mealTimes.a11y(meal, time)}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'increment' ? onLater() : onEarlier())}
    >
      <Text variant="bodyStrong" flex={1}>
        {meal}
      </Text>
      <RoundButton icon="minus" background="none" accessibilityLabel={t.onboarding.mealTimes.earlier(meal)} onPress={onEarlier} />
      <Text variant="number" minWidth={64} textAlign="center" style={{ fontVariant: ['tabular-nums'] }}>
        {time}
      </Text>
      <RoundButton icon="plus" background="none" accessibilityLabel={t.onboarding.mealTimes.later(meal)} onPress={onLater} />
    </Box>
  );
}
