'use client';

/**
 * Session abstraction for the dashboard.
 *
 * Foundation phase: stores the access token in sessionStorage (dev auth).
 * Production plan (docs/roadmap/mvp-2.md, D5): Identity Platform sign-in at the project
 * level, with the session held in an httpOnly Secure cookie set by a Next route handler —
 * never in web storage. Only this file changes.
 */
const KEY = 'limon.accessToken';

export const session = {
  getToken: async (): Promise<string | null> => (typeof window === 'undefined' ? null : sessionStorage.getItem(KEY)),
  setToken: (token: string) => sessionStorage.setItem(KEY, token),
  clear: () => sessionStorage.removeItem(KEY),
};
