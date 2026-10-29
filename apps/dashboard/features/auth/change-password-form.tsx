'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError } from '@limon/api-client';
import { PasswordSchema } from '@limon/validation';
import { useMe } from '@/hooks/use-me';
import { api } from '@/services/api';
import { endSession } from './client-auth';

const POLICY = 'Use at least 10 characters, with upper and lower case letters and a number.';

/**
 * First sign-in with the temporary password the platform team issued: the nutritionist chooses
 * their own, the session ends, and they sign in again with it. Nothing else is reachable until
 * then (the API answers PASSWORD_CHANGE_REQUIRED everywhere but here and /auth/me).
 */
export function ChangePasswordForm() {
  const { me, error: meError, loading } = useMe();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (meError && 'status' in meError && meError.status === 401) router.replace('/login');
    else if (me && !me.user.passwordChangeRequired) router.replace('/dashboard');
  }, [me, meError, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!PasswordSchema.safeParse(password).success) return setError(POLICY);
    if (password !== confirm) return setError("The passwords don't match.");
    setBusy(true);
    try {
      await api.auth.changePassword({ password });
      await endSession();
      router.replace('/login?password=changed');
    } catch (err) {
      const code = err instanceof ApiError ? err.code : null;
      setError(code === 'VALIDATION_ERROR' ? POLICY : code === 'RATE_LIMITED' ? 'Too many attempts. Try again in a few minutes.' : "We couldn't save your password. Try again.");
      setBusy(false);
    }
  }

  if (loading || !me?.user.passwordChangeRequired) return <main className="muted">Loading…</main>;

  return (
    <main>
      <form className="card" onSubmit={onSubmit}>
        <h2>Choose your password</h2>
        <p className="muted">You signed in with a temporary password. Choose your own to continue.</p>
        <input type="email" autoComplete="username" value={me.user.email} readOnly hidden />
        <label htmlFor="password">New password</label>
        <input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <label htmlFor="confirm">Repeat it</label>
        <input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        <p className="muted">{POLICY}</p>
        <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );
}
