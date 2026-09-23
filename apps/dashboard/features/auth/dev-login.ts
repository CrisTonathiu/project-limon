'use client';

import { publicEnv } from '@/lib/env';

/** Development only: obtains a dev token from the API's /dev/token endpoint (absent outside development). */
export async function devLogin(subject: string, email?: string): Promise<string> {
  const res = await fetch(`${publicEnv.apiBaseUrl}/api/v1/dev/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject, email }),
  });
  if (!res.ok) throw new Error('Dev login unavailable');
  return ((await res.json()) as { accessToken: string }).accessToken;
}
