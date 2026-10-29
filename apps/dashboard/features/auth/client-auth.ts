'use client';

import { getApps, initializeApp } from 'firebase/app';
import {
  inMemoryPersistence,
  initializeAuth,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import type { FirebaseWebConfig } from '@/lib/server-env';

/**
 * Nutritionist sign-in in the browser. Firebase signs in at the project level (no tenantId:
 * nutritionists live outside the practices' identity tenants) and keeps nothing: in-memory
 * persistence, and it signs out again once the server has turned the ID token into the
 * httpOnly session cookie. Nothing readable by page scripts outlives the sign-in.
 */
let auth: Auth | null = null;

function firebaseAuth(config: FirebaseWebConfig): Auth {
  if (auth) return auth;
  const app = getApps().find((a) => a.name === 'limon-dashboard') ?? initializeApp(config, 'limon-dashboard');
  auth = initializeAuth(app, { persistence: inMemoryPersistence });
  auth.languageCode = 'es';
  return auth;
}

export class SignInError extends Error {
  constructor(readonly code: 'INVALID_CREDENTIALS' | 'EMAIL_NOT_VERIFIED' | 'TOO_MANY_ATTEMPTS' | 'SESSION_FAILED') {
    super(code);
    this.name = 'SignInError';
  }
}

function mapFirebaseError(err: unknown): SignInError {
  const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : '';
  if (code === 'auth/too-many-requests') return new SignInError('TOO_MANY_ATTEMPTS');
  return new SignInError('INVALID_CREDENTIALS');
}

async function startSession(body: { idToken: string } | { subject: string; email?: string }) {
  const res = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new SignInError('SESSION_FAILED');
}

async function sessionFrom(a: Auth, user: User) {
  try {
    await startSession({ idToken: await user.getIdToken() });
  } finally {
    await signOut(a);
  }
}

/** Signs in and starts the session. A login whose email isn't confirmed gets a new link instead. */
export async function signIn(config: FirebaseWebConfig, email: string, password: string): Promise<void> {
  const a = firebaseAuth(config);
  const { user } = await signInWithEmailAndPassword(a, email, password).catch((err: unknown) => {
    throw mapFirebaseError(err);
  });
  if (!user.emailVerified) {
    await sendEmailVerification(user).catch(() => undefined);
    await signOut(a);
    throw new SignInError('EMAIL_NOT_VERIFIED');
  }
  await sessionFrom(a, user);
}

/** Emails a link to choose a new password. Says nothing about whether the account exists. */
export async function sendPasswordReset(config: FirebaseWebConfig, email: string): Promise<void> {
  await sendPasswordResetEmail(firebaseAuth(config), email).catch(() => undefined);
}

/** Development only: a dev token for a seeded subject, set as the session cookie by the server. */
export async function devSignIn(subject: string, email?: string): Promise<void> {
  await startSession({ subject, email });
}

/** Ends the session: the server clears the httpOnly cookie. */
export async function endSession(): Promise<void> {
  await fetch('/api/session', { method: 'DELETE' }).catch(() => undefined);
}
