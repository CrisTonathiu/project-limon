'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError } from '@limon/api-client';
import { RegisterNutritionistSchema } from '@limon/validation';
import type { FirebaseWebConfig } from '@/lib/server-env';
import { api } from '@/services/api';
import { devSignIn, finishSignUp, signUp, SignInError } from './client-auth';

const MESSAGES: Partial<Record<SignInError['code'], string>> = {
  EMAIL_IN_USE: 'That email already has an account. Sign in instead.',
  WEAK_PASSWORD: 'Use at least 10 characters, with upper and lower case letters and a number.',
  TOO_MANY_ATTEMPTS: 'Too many attempts. Try again in a few minutes.',
};

/**
 * Nutritionist signup: (1) project-level login (Identity Platform, or a dev subject) with a
 * session → (2) POST /auth/register/nutritionist, which creates Tenant + Nutritionist + TenantApps
 * and the practice's identity tenant → (3) Identity Platform: confirm the email, then sign in.
 */
export function RegisterForm({ firebase }: { firebase: FirebaseWebConfig | null }) {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', businessName: '', slug: '' });
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = RegisterNutritionistSchema.safeParse(form);
    if (!parsed.success) return setError(parsed.error.issues.map((i) => `${i.path[0]}: ${i.message}`).join('; '));
    setBusy(true);
    try {
      if (!firebase) {
        await devSignIn(`dev|nutritionist|${parsed.data.slug}`, parsed.data.email);
        await api.auth.registerNutritionist(parsed.data);
        return router.replace('/dashboard');
      }
      await signUp(firebase, parsed.data.email, password);
      try {
        await api.auth.registerNutritionist(parsed.data);
      } finally {
        await finishSignUp(firebase);
      }
      setSentTo(parsed.data.email);
    } catch (err) {
      if (err instanceof SignInError) setError(MESSAGES[err.code] ?? "We couldn't create your login. Try again.");
      else setError(err instanceof ApiError ? `${err.code}: ${err.message}` : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <main>
        <div className="card">
          <h2>Confirm your email</h2>
          <p>We sent a link to <strong>{sentTo}</strong>. Open it, then sign in.</p>
          <button type="button" onClick={() => router.replace('/login')}>Go to sign in</button>
        </div>
      </main>
    );
  }

  return (
    <main>
      <form className="card" onSubmit={onSubmit}>
        <h2>Create your nutrition practice</h2>
        <label>Email</label><input type="email" autoComplete="username" value={form.email} onChange={set('email')} />
        {firebase && (
          <>
            <label>Password</label>
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </>
        )}
        <label>First name</label><input value={form.firstName} onChange={set('firstName')} />
        <label>Last name</label><input value={form.lastName} onChange={set('lastName')} />
        <label>Business name</label><input value={form.businessName} onChange={set('businessName')} />
        <label>URL name (slug)</label><input value={form.slug} onChange={set('slug')} placeholder="maria-nutrition" />
        <button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );
}
