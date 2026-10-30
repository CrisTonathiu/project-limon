import { ApiError } from '@limon/api-client';
import type { PatientProfileDto } from '@limon/types';
import { useState } from 'react';
import { notificationPermission, requestNotifications } from '../../features/notifications/notification-permission';
import {
  emptyDraft, hasErrors, ONBOARDING_STEPS, stepErrors, toProfileInput, type OnboardingDraft,
} from '../../features/onboarding/onboarding-form';
import { onboardingSummary } from '../../features/onboarding/onboarding-summary';
import { useFoodCatalog } from '../../features/onboarding/use-food-catalog';
import { t } from '../../i18n/es-MX';
import { api } from '../../services/api';
import { useSession } from '../../state/session-context';
import { useTenantTheme } from '../../theme/theme-context';
import { OnboardingView, type OnboardingViewProps } from './OnboardingView';

type Phase = 'welcome' | 'asking' | 'primer' | 'ready';

/**
 * Onboarding, shown after sign-up until the patient has a profile (before the paywall: the
 * profile API doesn't need a subscription). Nothing is saved until the last question; the
 * whole questionnaire goes in one PUT. The primer and the summary come after the save, and
 * the navigator only moves on once the patient taps "Empezar" (the session refresh).
 */
export function OnboardingScreen() {
  const session = useSession();
  const { config } = useTenantTheme();
  const clinic = config?.appName ?? (session.status === 'signedIn' ? session.me.tenant?.name : null) ?? null;

  const [phase, setPhase] = useState<Phase>('welcome');
  const [draft, setDraft] = useState<OnboardingDraft>(emptyDraft);
  const [stepIndex, setStepIndex] = useState(0);
  // Errors appear only after "Siguiente" is pressed, not while the patient is still typing.
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<PatientProfileDto | null>(null);
  const catalog = useFoodCatalog();

  const step = ONBOARDING_STEPS[stepIndex]!;
  const isLast = stepIndex === ONBOARDING_STEPS.length - 1;

  const goBack = () => {
    setShowErrors(false);
    if (stepIndex === 0) setPhase('welcome');
    else setStepIndex((i) => i - 1);
  };

  const goNext = async () => {
    if (hasErrors(stepErrors(step, draft))) return setShowErrors(true);
    setShowErrors(false);
    if (!isLast) return setStepIndex((i) => i + 1);

    const input = toProfileInput(draft);
    if (!input) return; // Every step was checked on the way here.
    setBusy(true);
    setSaveError(null);
    try {
      const { profile } = await api.patients.saveMyProfile(input);
      setSaved(profile);
      // The primer only when the system prompt can still be shown (not after a reinstall that kept it).
      setPhase((await notificationPermission().catch(() => 'blocked' as const)) === 'askable' ? 'primer' : 'ready');
    } catch (err) {
      console.error('[onboarding] saving the profile failed', err);
      setSaveError(err instanceof ApiError && err.code === 'VALIDATION_ERROR' ? t.auth.errors.invalidData : t.common.networkError);
    } finally {
      setBusy(false);
    }
  };

  const allowNotifications = async () => {
    setBusy(true);
    try {
      await requestNotifications();
    } catch (err) {
      console.error('[onboarding] asking for notifications failed', err);
    }
    // Allowed or not, the patient made their choice; reminders follow the permission.
    setBusy(false);
    setPhase('ready');
  };

  const finish = async () => {
    setBusy(true);
    // With a profile saved, the navigator moves on from onboarding.
    await session.refresh();
  };

  const state = (): OnboardingViewProps['state'] => {
    if (phase === 'welcome') return { status: 'welcome' };
    if (phase === 'primer') return { status: 'primer', requesting: busy };
    if (phase === 'ready' && saved) return { status: 'ready', ...onboardingSummary(saved), finishing: busy };
    return {
      status: 'asking',
      step,
      stepNumber: stepIndex + 1,
      stepCount: ONBOARDING_STEPS.length,
      draft,
      errors: showErrors ? stepErrors(step, draft) : {},
      catalog,
      saving: busy,
      saveError,
    };
  };

  return (
    <OnboardingView
      clinic={clinic}
      state={state()}
      onStart={() => setPhase('asking')}
      onSignOut={() => void session.signOut()}
      onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
      onNext={() => void goNext()}
      onBack={goBack}
      onAllowNotifications={() => void allowNotifications()}
      onSkipNotifications={() => setPhase('ready')}
      onFinish={() => void finish()}
    />
  );
}
