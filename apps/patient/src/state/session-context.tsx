import { ApiError } from '@limon/api-client';
import { UserRole, type FeatureKey, type MeResponse } from '@limon/types';
import type { RegisterPatientInput } from '@limon/validation';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { authErrorMessage } from '../features/auth/auth-errors';
import { patientAuthProvider } from '../features/auth/auth-provider';
import { clearMealReminders } from '../features/notifications/meal-reminders';
import { api } from '../services/api';

type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut'; error?: string }
  // Identity Platform: the patient must open the emailed link before registering; dev never reaches this.
  | { status: 'awaitingConfirmation'; email: string }
  // hasProfile: the patient finished the onboarding questionnaire (always true for other roles).
  | { status: 'signedIn'; me: MeResponse; hasProfile: boolean };

type SignUpInput = Omit<RegisterPatientInput, 'privacyNoticeVersion' | 'termsVersion'> & { password: string };

type SessionApi = SessionState & {
  /** Paid access. Content screens stay locked until this is true. */
  entitled: boolean;
  /** Is this module switched on for the tenant? Read from /auth/me at launch and sign-in; the API enforces it too. */
  hasFeature: (feature: FeatureKey) => boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  /**
   * Completes signUp once the patient has opened the emailed link. False while they haven't;
   * throws if checking fails, so the confirmation screen can say so.
   */
  checkConfirmation: () => Promise<boolean>;
  /** Sends the confirmation link again. Throws on failure (e.g. too many requests). */
  resendConfirmation: () => Promise<void>;
  /** Emails a link to choose a new password. Throws on failure. */
  sendPasswordReset: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Erases the patient's data and login, then signs out. Throws if the API call fails. */
  deleteAccount: () => Promise<void>;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionApi | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  // Held only in memory between signUp() and checkConfirmation() — never persisted.
  const pendingSignUp = useRef<SignUpInput | null>(null);

  // "Verify tenant": /auth/me succeeds only if the user belongs to THIS app's tenant,
  // the tenant is active, and it also returns the patient's entitlement.
  const verify = useCallback(async () => {
    try {
      const me = await api.auth.me();
      const hasProfile = me.user.role !== UserRole.PATIENT || (await api.patients.myProfile()).profile !== null;
      setState({ status: 'signedIn', me, hasProfile });
    } catch (err) {
      await patientAuthProvider.signOut();
      await clearMealReminders();
      setState({ status: 'signedOut', error: err instanceof ApiError && err.status === 401 ? undefined : authErrorMessage(err) });
    }
  }, []);

  useEffect(() => {
    patientAuthProvider.getToken().then((token) => (token ? verify() : setState({ status: 'signedOut' })));
  }, [verify]);

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
      await verify();
    } catch (err) {
      console.error('[session] auth flow failed', err);
      setState({ status: 'signedOut', error: authErrorMessage(err) });
    }
  };

  // Consent versions are recorded server-side against these exact documents.
  const completeRegistration = async (input: SignUpInput) => {
    const { password: _password, ...profile } = input;
    await api.auth.registerPatient({ ...profile, privacyNoticeVersion: PRIVACY_NOTICE_VERSION, termsVersion: TERMS_VERSION });
  };

  const value: SessionApi = {
    ...state,
    entitled: state.status === 'signedIn' ? (state.me.entitlement?.active ?? false) : false,
    hasFeature: (feature) => state.status === 'signedIn' && state.me.features.includes(feature),
    signIn: (email, password) => run(() => patientAuthProvider.signIn(email, password)),
    signUp: async (input) => {
      try {
        const result = await patientAuthProvider.signUp(input.email, input.password);
        if (result.status === 'needsConfirmation') {
          pendingSignUp.current = input;
          setState({ status: 'awaitingConfirmation', email: input.email });
          return;
        }
        await run(() => completeRegistration(input));
      } catch (err) {
        console.error('[session] sign-up failed', err);
        setState({ status: 'signedOut', error: authErrorMessage(err) });
      }
    },
    checkConfirmation: async () => {
      const input = pendingSignUp.current;
      if (!input) throw new Error('No sign-up in progress');
      // Left un-caught here (unlike signUp/run) so a failed check surfaces on the confirmation
      // screen itself instead of bouncing back to Sign In.
      if (!(await patientAuthProvider.checkConfirmed())) return false;
      pendingSignUp.current = null;
      await run(() => completeRegistration(input));
      return true;
    },
    resendConfirmation: () => patientAuthProvider.resendConfirmation(),
    sendPasswordReset: (email) => patientAuthProvider.sendPasswordReset(email),
    signOut: async () => {
      await patientAuthProvider.signOut();
      await clearMealReminders();
      pendingSignUp.current = null;
      setState({ status: 'signedOut' });
    },
    deleteAccount: async () => {
      // The API erases the data and deletes the login in one request (or neither).
      await api.patients.deleteMyAccount();
      await patientAuthProvider.signOut();
      await clearMealReminders();
      setState({ status: 'signedOut' });
    },
    refresh: verify,
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Bump when the published documents change; the accepted version is stored per patient. */
export const PRIVACY_NOTICE_VERSION = 'aviso-privacidad-2026-09';
export const TERMS_VERSION = 'terminos-2026-09';

export function useSession(): SessionApi {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession outside SessionProvider');
  return ctx;
}
