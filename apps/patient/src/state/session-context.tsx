import { ApiError } from '@limon/api-client';
import type { MeResponse } from '@limon/types';
import type { RegisterPatientInput } from '@limon/validation';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { devAuthProvider } from '../features/auth/auth-provider';
import { api } from '../services/api';
import { tokenStore } from '../services/token-store';

type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut'; error?: string }
  | { status: 'signedIn'; me: MeResponse };

type SignUpInput = Omit<RegisterPatientInput, 'privacyNoticeVersion' | 'termsVersion'> & { password: string };

type SessionApi = SessionState & {
  /** Paid access. Content screens stay locked until this is true. */
  entitled: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
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
      setState({ status: 'signedOut', error: messageFor(err) });
    }
  };

  const value: SessionApi = {
    ...state,
    entitled: state.status === 'signedIn' ? (state.me.entitlement?.active ?? false) : false,
    signIn: (email, password) => run(() => devAuthProvider.signIn(email, password)),
    signUp: async (input) => {
      const { password, ...profile } = input;
      await run(async () => {
        const token = await devAuthProvider.signUp(profile.email, password);
        await tokenStore.set(token);
        // Consent versions are recorded server-side against these exact documents.
        await api.auth.registerPatient({
          ...profile,
          privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
          termsVersion: TERMS_VERSION,
        });
        return token;
      });
    },
    signOut: async () => {
      await devAuthProvider.signOut();
      await tokenStore.clear();
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
