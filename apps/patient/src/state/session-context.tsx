import { ApiError } from '@limon/api-client';
import type { MeResponse } from '@limon/types';
import type { RegisterPatientInput } from '@limon/validation';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { patientAuthProvider } from '../features/auth/auth-provider';
import { api } from '../services/api';
import { tokenStore } from '../services/token-store';

type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut'; error?: string }
  // Cognito requires email verification before sign-in; the dev provider never reaches this.
  | { status: 'awaitingConfirmation'; email: string }
  | { status: 'signedIn'; me: MeResponse };

type SignUpInput = Omit<RegisterPatientInput, 'privacyNoticeVersion' | 'termsVersion'> & { password: string };

type SessionApi = SessionState & {
  /** Paid access. Content screens stay locked until this is true. */
  entitled: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  /** Completes signUp after the emailed code is entered. Only used on the Cognito path. */
  confirmSignUp: (code: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionApi | null>(null);

function messageFor(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'TENANT_MISMATCH':
        return 'This account belongs to a different practice.';
      case 'TENANT_SUSPENDED':
        return 'This service is currently unavailable.';
      case 'CONFLICT':
        return 'This account already exists. Try signing in.';
      case 'VALIDATION_ERROR':
        return err.message;
      default:
        return 'Something went wrong. Please try again.';
    }
  }
  return 'Something went wrong. Please try again.';
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  // Held only in memory between signUp() and confirmSignUp() — never persisted.
  const pendingSignUp = useRef<SignUpInput | null>(null);

  // "Verify tenant": /auth/me succeeds only if the user belongs to THIS app's tenant,
  // the tenant is active, and it also returns the patient's entitlement.
  const verify = useCallback(async () => {
    try {
      setState({ status: 'signedIn', me: await api.auth.me() });
    } catch (err) {
      await tokenStore.clear();
      setState({ status: 'signedOut', error: err instanceof ApiError && err.status === 401 ? undefined : messageFor(err) });
    }
  }, []);

  useEffect(() => {
    tokenStore.get().then((t) => (t ? verify() : setState({ status: 'signedOut' })));
  }, [verify]);

  const run = async (fn: () => Promise<string>) => {
    try {
      await tokenStore.set(await fn());
      await verify();
    } catch (err) {
      console.error('[session] auth flow failed', err);
      setState({ status: 'signedOut', error: messageFor(err) });
    }
  };

  // Consent versions are recorded server-side against these exact documents.
  const completeRegistration = async (input: SignUpInput, token: string) => {
    const { password: _password, ...profile } = input;
    await tokenStore.set(token);
    await api.auth.registerPatient({ ...profile, privacyNoticeVersion: PRIVACY_NOTICE_VERSION, termsVersion: TERMS_VERSION });
    return token;
  };

  const value: SessionApi = {
    ...state,
    entitled: state.status === 'signedIn' ? (state.me.entitlement?.active ?? false) : false,
    signIn: (email, password) => run(() => patientAuthProvider.signIn(email, password)),
    signUp: async (input) => {
      try {
        const result = await patientAuthProvider.signUp(input.email, input.password);
        if (result.status === 'needsConfirmation') {
          pendingSignUp.current = input;
          setState({ status: 'awaitingConfirmation', email: input.email });
          return;
        }
        await run(() => completeRegistration(input, result.token));
      } catch (err) {
        console.error('[session] sign-up failed', err);
        setState({ status: 'signedOut', error: messageFor(err) });
      }
    },
    confirmSignUp: async (code) => {
      const input = pendingSignUp.current;
      if (!input) throw new Error('No sign-up in progress');
      // Left un-caught here (unlike signUp/run) so a wrong code surfaces on the confirmation
      // screen itself instead of bouncing back to Sign In.
      await patientAuthProvider.confirmSignUp(input.email, code);
      const token = await patientAuthProvider.signIn(input.email, input.password);
      pendingSignUp.current = null;
      await run(() => completeRegistration(input, token));
    },
    signOut: async () => {
      await patientAuthProvider.signOut();
      await tokenStore.clear();
      pendingSignUp.current = null;
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
