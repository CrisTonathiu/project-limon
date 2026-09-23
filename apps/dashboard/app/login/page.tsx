'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { devLogin } from '@/features/auth/dev-login';
import { session } from '@/services/session';

/**
 * Foundation login. Dev: exchanges a seeded Cognito-style subject for a dev token.
 * Production: replaced by Cognito Hosted UI redirect (see services/session.ts).
 */
export default function LoginPage() {
  const router = useRouter();
  const [subject, setSubject] = useState('dev|nutritionist|maria-nutrition');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      session.setToken(await devLogin(subject));
      router.replace('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <main>
      <form className="card" onSubmit={onSubmit}>
        <h2>Sign in</h2>
        <label htmlFor="subject">Identity (dev)</label>
        <input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <button type="submit">Sign in</button>
        {error && <p className="error">{error}</p>}
        <p className="muted">New nutritionist? <Link href="/register">Create your practice</Link></p>
      </form>
    </main>
  );
}
