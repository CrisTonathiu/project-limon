import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Box,
  Button,
  Card,
  Entering,
  Icon,
  ProgressBar,
  RoundButton,
  ScreenScroll,
  Text,
} from '../../design-system';
import { NotificationPrimer } from '../../features/notifications/NotificationPrimer';
import { ProfileFields } from '../../features/onboarding/ProfileFields';
import type { OnboardingDraft, OnboardingStep, StepErrors } from '../../features/onboarding/onboarding-form';
import type { FoodCatalog } from '../../features/onboarding/use-food-catalog';
import { t } from '../../i18n/es-MX';

export type OnboardingViewProps = {
  /** The clinic's app name, or null while it loads. */
  clinic: string | null;
  state:
    | { status: 'welcome' }
    | {
        status: 'asking';
        step: OnboardingStep;
        /** 1-based. */
        stepNumber: number;
        stepCount: number;
        draft: OnboardingDraft;
        errors: StepErrors;
        catalog: FoodCatalog;
        saving: boolean;
        saveError: string | null;
      }
    /** Saved; notifications are off and can still be asked for. */
    | { status: 'primer'; requesting: boolean }
    | {
        status: 'ready';
        /** "1,850 kcal" and its macros, or why the nutritionist sets the target instead. */
        target: { kcal: string; macros: string } | { hold: string };
        /** "Desayuno", "8:00", in the order of the day. */
        times: { meal: string; time: string }[];
        finishing: boolean;
      };
  onStart?: () => void;
  onSignOut?: () => void;
  onChange?: (patch: Partial<OnboardingDraft>) => void;
  onNext?: () => void;
  onBack?: () => void;
  onAllowNotifications?: () => void;
  onSkipNotifications?: () => void;
  onFinish?: () => void;
};

/**
 * Onboarding: a welcome, the questionnaire one topic per page (meal times included), the
 * notification primer, and a summary of the plan's target and times. Before the paywall.
 */
export function OnboardingView(props: OnboardingViewProps) {
  const { state } = props;
  const insets = useSafeAreaInsets();

  const footer = (): ReactNode => {
    switch (state.status) {
      case 'welcome':
        return (
          <>
            <Button label={t.onboarding.welcome.start} onPress={() => props.onStart?.()} />
            <LinkButton label={t.common.signOut} onPress={() => props.onSignOut?.()} />
          </>
        );
      case 'asking': {
        const last = state.stepNumber === state.stepCount;
        return (
          <>
            {state.saveError ? (
              <Text variant="label" color="danger">
                {state.saveError}
              </Text>
            ) : null}
            <Button
              label={last ? (state.saving ? t.onboarding.saving : t.onboarding.finish) : t.onboarding.next}
              busy={state.saving}
              onPress={() => props.onNext?.()}
            />
          </>
        );
      }
      case 'primer':
        return (
          <>
            <Button label={t.notificationPrimer.allow} icon="bell" busy={state.requesting} onPress={() => props.onAllowNotifications?.()} />
            <Button variant="outline" label={t.notificationPrimer.later} disabled={state.requesting} onPress={() => props.onSkipNotifications?.()} />
          </>
        );
      case 'ready':
        return <Button label={t.onboarding.ready.start} busy={state.finishing} onPress={() => props.onFinish?.()} />;
    }
  };

  return (
    <Box flex={1} backgroundColor="background">
      <ScreenScroll gap="l">
        {state.status === 'asking' ? (
          <Box gap="m">
            <Box flexDirection="row" alignItems="center" gap="m">
              <RoundButton icon="chevronLeft" accessibilityLabel={t.onboarding.back} onPress={() => props.onBack?.()} />
              <Text variant="label">{t.onboarding.progress(state.stepNumber, state.stepCount)}</Text>
            </Box>
            <ProgressBar progress={state.stepNumber / state.stepCount} />
          </Box>
        ) : null}
        {/* Each page enters afresh, so the key restarts the animation. */}
        <Entering key={state.status === 'asking' ? state.step : state.status} delay={0}>
          <Box gap="m">{body(props)}</Box>
        </Entering>
      </ScreenScroll>
      <Box paddingHorizontal="xl" paddingTop="m" gap="s" backgroundColor="background" style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
        {footer()}
      </Box>
    </Box>
  );
}

function body({ state, clinic, onChange }: OnboardingViewProps): ReactNode {
  switch (state.status) {
    case 'welcome':
      return (
        <>
          <Card variant="tint" borderRadius="xl" padding="xl" gap="m" marginTop="xl">
            <Box width={56} height={56} borderRadius="pill" backgroundColor="surface" alignItems="center" justifyContent="center">
              <Icon name="bowl" color="primary" size={30} />
            </Box>
            <Text variant="title" accessibilityRole="header">
              {clinic ? t.onboarding.welcome.title(clinic) : t.onboarding.welcome.titleFallback}
            </Text>
            <Text variant="body" color="textOnTint">
              {t.onboarding.welcome.body}
            </Text>
          </Card>
        </>
      );
    case 'asking':
      return (
        <>
          <Text variant="title" accessibilityRole="header">
            {t.onboarding[state.step].title}
          </Text>
          <ProfileFields step={state.step} draft={state.draft} errors={state.errors} catalog={state.catalog} update={(patch) => onChange?.(patch)} />
        </>
      );
    case 'primer':
      return <NotificationPrimer clinic={clinic} />;
    case 'ready':
      return (
        <>
          <Card variant="tint" borderRadius="xl" padding="xl" gap="m">
            <Box width={44} height={44} borderRadius="pill" backgroundColor="surface" alignItems="center" justifyContent="center">
              <Icon name="check" color="primary" />
            </Box>
            <Text variant="title" accessibilityRole="header">
              {t.onboarding.ready.title}
            </Text>
            <Text variant="body" color="textOnTint">
              {t.onboarding.ready.body}
            </Text>
          </Card>
          <Card gap="s">
            <Text variant="label">{t.onboarding.ready.target}</Text>
            {'hold' in state.target ? (
              <Text variant="body">{state.target.hold}</Text>
            ) : (
              <>
                <Text variant="number">{state.target.kcal}</Text>
                <Text variant="caption">{state.target.macros}</Text>
              </>
            )}
          </Card>
          <Card gap="s">
            <Text variant="label">{t.onboarding.ready.times}</Text>
            {state.times.map(({ meal, time }, i) => (
              <Box key={i} flexDirection="row" alignItems="center" gap="m" minHeight={32}>
                <Icon name="clock" color="textMuted" size={18} />
                <Text variant="body" flex={1}>
                  {meal}
                </Text>
                <Text variant="bodyStrong">{time}</Text>
              </Box>
            ))}
          </Card>
        </>
      );
  }
}

/** A quiet text action under the main button ("Cerrar sesión"). */
function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Box minHeight={44} alignItems="center" justifyContent="center">
        <Text variant="label">{label}</Text>
      </Box>
    </Pressable>
  );
}
