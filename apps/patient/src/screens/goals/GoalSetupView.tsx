import { GoalIntention, RecentWeightChange, type GoalPace } from '@limon/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Box,
  Button,
  Card,
  Entering,
  fonts,
  Icon,
  LoadState,
  OptionCard,
  RoundButton,
  ScreenScroll,
  Text,
  TextField,
} from '../../design-system';
import { stepError, type GoalForm, type GoalStep } from '../../features/goals/goal-form';
import { t } from '../../i18n/es-MX';

export type GoalSetupViewProps = {
  state:
    | { status: 'loading' }
    | { status: 'failed'; onRetry: () => void }
    | {
        status: 'asking';
        step: GoalStep;
        /** 1-based. */
        stepNumber: number;
        stepCount: number;
        form: GoalForm;
        /** The paces the clinic offers for the chosen direction. */
        paces: GoalPace[];
        canContinue: boolean;
        saving: boolean;
        saveFailed: boolean;
      }
    /** Saved: the explanation, one string per paragraph. */
    | { status: 'done'; paragraphs: string[] };
  onChange?: (patch: Partial<GoalForm>) => void;
  onNext?: () => void;
  onBack: () => void;
  onDone?: () => void;
};

const INTENTIONS = Object.values(GoalIntention);
const RECENT = Object.values(RecentWeightChange);

/**
 * Goal setting: the patient picks an intention, then (to lose or gain) a pace and an optional
 * amount, then answers one screening question. They never type a calorie number; the clinic's
 * rules choose the starting target, which the last screen explains.
 */
export function GoalSetupView(props: GoalSetupViewProps) {
  const { state } = props;
  const insets = useSafeAreaInsets();
  const footer =
    state.status === 'asking' ? (
      <Box gap="s">
        {state.saveFailed ? (
          <Text variant="label" color="danger">
            {t.goals.saveFailed}
          </Text>
        ) : null}
        <Button
          label={
            state.stepNumber === state.stepCount
              ? state.saving
                ? t.goals.saving
                : t.goals.save
              : t.goals.next
          }
          disabled={!state.canContinue}
          busy={state.saving}
          onPress={() => props.onNext?.()}
        />
      </Box>
    ) : state.status === 'done' ? (
      <Button label={t.goals.done} onPress={() => props.onDone?.()} />
    ) : null;

  return (
    <Box flex={1} backgroundColor="background">
      <ScreenScroll gap="l">
        <Box flexDirection="row" alignItems="center" gap="m">
          <RoundButton
            icon="chevronLeft"
            accessibilityLabel={t.common.back}
            onPress={props.onBack}
          />
          {state.status === 'asking' ? (
            <Text variant="label">{t.goals.step(state.stepNumber, state.stepCount)}</Text>
          ) : null}
        </Box>
        {state.status === 'loading' ? <LoadState status="loading" /> : null}
        {state.status === 'failed' ? (
          <LoadState
            status="failed"
            message={t.goals.loadFailed}
            retryLabel={t.goals.retry}
            onRetry={state.onRetry}
          />
        ) : null}
        {state.status === 'asking' ? <Step {...props} asking={state} /> : null}
        {state.status === 'done' ? <Result paragraphs={state.paragraphs} /> : null}
      </ScreenScroll>
      {footer ? (
        <Box
          paddingHorizontal="xl"
          paddingTop="m"
          backgroundColor="background"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          {footer}
        </Box>
      ) : null}
    </Box>
  );
}

type Asking = Extract<GoalSetupViewProps['state'], { status: 'asking' }>;

function Step({ asking, onChange }: GoalSetupViewProps & { asking: Asking }) {
  const { form, step } = asking;
  const set = (patch: Partial<GoalForm>) => onChange?.(patch);
  // Each step enters afresh, so the key restarts the animation.
  return (
    <Entering key={step} delay={0}>
      <Box gap="m">
        {step === 'intention' ? (
          <>
            <Question title={t.goals.intentionQuestion} />
            {INTENTIONS.map((i) => (
              <OptionCard
                key={i}
                label={t.goals.intentions[i].label}
                hint={t.goals.intentions[i].hint}
                selected={form.intention === i}
                onPress={() => set({ intention: i, pace: null })}
              />
            ))}
          </>
        ) : null}
        {step === 'details' && form.intention === GoalIntention.OTHER ? (
          <>
            <Question title={t.goals.otherDetails} />
            <TextField
              value={form.otherText}
              onChangeText={(otherText) => set({ otherText })}
              placeholder={t.goals.otherPlaceholder}
              multiline
            />
          </>
        ) : null}
        {step === 'details' && form.intention !== GoalIntention.OTHER ? (
          <>
            <Question
              title={
                form.intention === GoalIntention.GAIN_WEIGHT
                  ? t.goals.gainDetails
                  : t.goals.loseDetails
              }
            />
            {asking.paces.map((p) => (
              <OptionCard
                key={p}
                label={t.goals.paces[p].label}
                hint={t.goals.paces[p].hint}
                selected={form.pace === p}
                onPress={() => set({ pace: p })}
              />
            ))}
            <Box gap="s" marginTop="s">
              <Text variant="bodyStrong">
                {form.intention === GoalIntention.GAIN_WEIGHT
                  ? t.goals.desiredGain
                  : t.goals.desiredLose}
              </Text>
              <TextField
                value={form.desiredKg}
                onChangeText={(desiredKg) => set({ desiredKg })}
                placeholder={t.goals.desiredPlaceholder}
                keyboardType="decimal-pad"
                suffix="kg"
              />
              {stepError(step, form) ? (
                <Text variant="label" color="danger">
                  {stepError(step, form)}
                </Text>
              ) : null}
            </Box>
          </>
        ) : null}
        {step === 'screening' ? (
          <>
            <Question title={t.goals.screeningQuestion} />
            {RECENT.map((r) => (
              <OptionCard
                key={r}
                label={t.goals.recentChanges[r]}
                selected={form.recentWeightChange === r}
                onPress={() => set({ recentWeightChange: r })}
              />
            ))}
            <Text variant="caption" marginTop="s">
              {t.goals.medicalNote}
            </Text>
          </>
        ) : null}
      </Box>
    </Entering>
  );
}

function Question({ title }: { title: string }) {
  return (
    <Text variant="title" accessibilityRole="header" marginBottom="s">
      {title}
    </Text>
  );
}

function Result({ paragraphs }: { paragraphs: string[] }) {
  return (
    <Entering delay={0}>
      <Card variant="tint" borderRadius="l" padding="xl" gap="m">
        <Box
          width={44}
          height={44}
          borderRadius="pill"
          backgroundColor="surface"
          alignItems="center"
          justifyContent="center"
        >
          <Icon name="progress" color="primary" />
        </Box>
        <Text variant="title" accessibilityRole="header">
          {t.goals.resultTitle}
        </Text>
        {paragraphs.map((p) => (
          <Text key={p} variant="body" color="textOnTint">
            {p}
          </Text>
        ))}
      </Card>
    </Entering>
  );
}
