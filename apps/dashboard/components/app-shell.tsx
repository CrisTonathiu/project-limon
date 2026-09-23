'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useMe } from '@/hooks/use-me';
import { session } from '@/services/session';

const NAV = [
  ['/dashboard', 'Overview'],
  ['/patients', 'Patients'],
  ['/meal-plans', 'Meal plans'],
  ['/recipes', 'Recipes'],
  ['/protocols', 'Protocols'],
  ['/payments', 'Payments'],
  ['/subscriptions', 'Subscriptions'],
  ['/app', 'My app'],
  ['/settings', 'Settings'],
] as const;

/** Authenticated layout. The API is the authority; this only mirrors its answer in the UI. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { me, error, loading } = useMe();
  const router = useRouter();

  useEffect(() => {
    if (error && 'status' in error && error.status === 401) router.replace('/login');
  }, [error, router]);

  if (loading) return <main className="muted">Loading…</main>;
  if (error) {
    const code = 'code' in error ? error.code : 'INTERNAL_ERROR';
    return (
      <main>
        <p className="error">{code === 'TENANT_SUSPENDED' ? 'This account is currently unavailable.' : error.message}</p>
        <Link href="/login">Back to login</Link>
      </main>
    );
  }

  return (
    <div className="shell">
      <nav className="nav">
        <div className="brand">{me?.tenant?.name ?? 'Limon'}</div>
        {NAV.map(([href, label]) => (
          <Link key={href} href={href}>{label}</Link>
        ))}
        <a href="#" onClick={() => { session.clear(); router.replace('/login'); }}>Sign out</a>
      </nav>
      <main>{children}</main>
    </div>
  );
}
