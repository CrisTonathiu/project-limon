'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FirebaseWebConfig } from '@/lib/server-env';
import { devSignIn, sendPasswordReset, signIn, SignInError } from './client-auth';

const MESSAGES: Record<SignInError['code'], string> = {
  INVALID_CREDENTIALS: 'Wrong email or password.',
  EMAIL_NOT_VERIFIED: 'Confirm your email first. We sent you a new link.',
  TOO_MANY_ATTEMPTS: 'Too many attempts. Try again in a few minutes.',
  SESSION_FAILED: "We couldn't start your session. Try again.",
};

/**
 * Identity Platform sign-in (email + password), or a seeded dev subject when `firebase` is null.
 * There's no sign-up: the platform team creates practices and hands over a temporary password.
 */
export function LoginForm({ firebase, passwordChanged }: { firebase: FirebaseWebConfig | null; passwordChanged: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [subject, setSubject] = useState('dev|nutritionist|maria-nutrition');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(passwordChanged ? 'Password saved. Sign in with your new password.' : null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (firebase) await signIn(firebase, email, password);
      else await devSignIn(subject);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof SignInError ? MESSAGES[err.code] : (err as Error).message);
      setBusy(false);
    }
  }

  async function onForgotPassword() {
    if (!firebase) return;
    if (!email) return setError('Type your email first.');
    setError(null);
    await sendPasswordReset(firebase, email);
    setNotice('If that email has an account, we sent it a link to choose a new password.');
  }

  return (
    <main>
      <form className="card" onSubmit={onSubmit}>
        <h2>Sign in</h2>
        {firebase ? (
          <>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <label htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </>
        ) : (
          <>
            <label htmlFor="subject">Identity (dev)</label>
            <input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </>
        )}
        <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        {error && <p className="error">{error}</p>}
        {notice && <p className="muted">{notice}</p>}
        {firebase && (
          <p className="muted"><a href="#" onClick={(e) => { e.preventDefault(); void onForgotPassword(); }}>Forgot your password?</a></p>
        )}
      </form>
    </main>
  );
}
