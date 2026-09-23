'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError } from '@limon/api-client';
import { RegisterNutritionistSchema } from '@limon/validation';
import { devLogin } from '@/features/auth/dev-login';
import { api } from '@/services/api';
import { session } from '@/services/session';

/**
 * Nutritionist signup: (1) Cognito sign-up (dev: token for a new subject) → (2) POST /auth/register/nutritionist,
 * which atomically creates Tenant + Nutritionist + TenantApps.
 */
export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', businessName: '', slug: '' });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = RegisterNutritionistSchema.safeParse(form);
    if (!parsed.success) return setError(parsed.error.issues.map((i) => `${i.path[0]}: ${i.message}`).join('; '));
    try {
      session.setToken(await devLogin(`dev|nutritionist|${parsed.data.slug}`, parsed.data.email));
      await api.auth.registerNutritionist(parsed.data);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code}: ${err.message}` : (err as Error).message);
    }
  }

  return (
    <main>
      <form className="card" onSubmit={onSubmit}>
        <h2>Create your nutrition practice</h2>
        <label>Email</label><input type="email" value={form.email} onChange={set('email')} />
        <label>First name</label><input value={form.firstName} onChange={set('firstName')} />
        <label>Last name</label><input value={form.lastName} onChange={set('lastName')} />
        <label>Business name</label><input value={form.businessName} onChange={set('businessName')} />
        <label>URL name (slug)</label><input value={form.slug} onChange={set('slug')} placeholder="maria-nutrition" />
        <button type="submit">Create account</button>
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );
}
