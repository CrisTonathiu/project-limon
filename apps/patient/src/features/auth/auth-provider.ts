/**
 * Patient authentication abstraction.
 * - Cloud builds: Identity Platform (Firebase Auth JS SDK), signing in to THIS practice's
 *   identity tenant from the build config (ADR-006), so the same email can be a patient of
 *   two nutritionists as two separate logins. The person only ever types their email.
 * - Development: dev tokens from the API.
 * Screens depend on this interface only, selected once via `patientAuthProvider` below.
 * Each provider keeps its own session; the API client asks it for a token on every request.
 */
import { tenantUsername } from '@limon/tenant';
import * as SecureStore from 'expo-secure-store';
import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  initializeAuth,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type Persistence,
} from 'firebase/auth';
// Metro bundles @firebase/auth's React Native build, which has this; its default typings
// (the only ones TypeScript resolves through `firebase/auth`) don't declare it.
// @ts-expect-error -- see above
import { getReactNativePersistence as untypedReactNativePersistence } from 'firebase/auth';
import { buildConfig } from '../../config/build-config';
import { tokenStore } from '../../services/token-store';
import { createSecureAuthStorage, type AuthStorage } from './secure-auth-storage';

const getReactNativePersistence = untypedReactNativePersistence as (storage: AuthStorage) => Persistence;

export type SignUpResult = { status: 'signedIn' } | { status: 'needsConfirmation' };

export interface PatientAuthProvider {
  signUp(email: string, password: string): Promise<SignUpResult>;
  /** After signUp: has the patient opened the emailed link? Refreshes the token when so. */
  checkConfirmed(): Promise<boolean>;
  /** Sends the confirmation link again. */
  resendConfirmation(): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  /** The current token for the API, refreshed when it's about to expire; null when signed out. */
  getToken(): Promise<string | null>;
  /** Emails a link to choose a new password. Says nothing about whether the account exists. */
  sendPasswordReset(email: string): Promise<void>;
  signOut(): Promise<void>;
}

/**
 * Dev token subject: the tenant-namespaced email, as the Cognito username used to be, so
 * local accounts created before Identity Platform keep working.
 */
export function devSubjectFor(email: string): string {
  if (!buildConfig.tenantId) throw new Error('Build config is missing tenantId');
  return `dev|${tenantUsername(buildConfig.tenantId, email)}`;
}

async function devToken(subject: string): Promise<string> {
  const res = await fetch(`${buildConfig.apiBaseUrl}/api/v1/dev/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject }),
  });
  if (!res.ok) throw new Error('Authentication failed');
  return ((await res.json()) as { accessToken: string }).accessToken;
}

export const devAuthProvider: PatientAuthProvider = {
  async signIn(email) {
    await tokenStore.set(await devToken(email.startsWith('dev|') ? email : devSubjectFor(email)));
  },
  async signUp(email) {
    await tokenStore.set(await devToken(devSubjectFor(email)));
    return { status: 'signedIn' };
  },
  // Dev logins are always confirmed and have no password to reset.
  checkConfirmed: async () => true,
  async resendConfirmation() {},
  async sendPasswordReset() {},
  getToken: () => tokenStore.get(),
  signOut: () => tokenStore.clear(),
};

let authInstance: Auth | undefined;
/** Created on first use, so dev builds never touch Firebase. */
function auth(): Auth {
  if (!authInstance) {
    const { firebaseApiKey, firebaseAuthDomain, identityTenantId } = buildConfig;
    if (!firebaseApiKey || !firebaseAuthDomain || !identityTenantId) {
      throw new Error('Build config is missing the Identity Platform config (API key, auth domain or identity tenant)');
    }
    const app = initializeApp({ apiKey: firebaseApiKey, authDomain: firebaseAuthDomain });
    authInstance = initializeAuth(app, { persistence: getReactNativePersistence(createSecureAuthStorage(SecureStore)) });
    // Every sign-up and sign-in happens inside this practice's identity tenant.
    authInstance.tenantId = identityTenantId;
    // Verification and password-reset emails in Spanish.
    authInstance.languageCode = 'es';
  }
  return authInstance;
}

/** The signed-in user, once the SDK has restored any saved session. */
async function currentUser() {
  const a = auth();
  await a.authStateReady();
  return a.currentUser;
}

export const identityPlatformAuthProvider: PatientAuthProvider = {
  async signUp(email, password) {
    const { user } = await createUserWithEmailAndPassword(auth(), email, password);
    await sendEmailVerification(user);
    return { status: 'needsConfirmation' };
  },
  async checkConfirmed() {
    const user = await currentUser();
    if (!user) return false;
    await user.reload();
    if (!user.emailVerified) return false;
    // A fresh token, so the API sees email_verified: true.
    await user.getIdToken(true);
    return true;
  },
  async resendConfirmation() {
    const user = await currentUser();
    if (user) await sendEmailVerification(user);
  },
  async signIn(email, password) {
    await signInWithEmailAndPassword(auth(), email, password);
  },
  getToken: async () => (await currentUser())?.getIdToken() ?? null,
  sendPasswordReset: (email) => sendPasswordResetEmail(auth(), email),
  signOut: () => signOut(auth()),
};

export const patientAuthProvider: PatientAuthProvider =
  buildConfig.authProvider === 'identity-platform' ? identityPlatformAuthProvider : devAuthProvider;
