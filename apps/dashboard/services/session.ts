'use client';

/**
 * Session abstraction for the dashboard.
 *
 * Foundation phase: stores the access token in sessionStorage (dev auth).
 * Production plan (docs/architecture/authentication.md): Cognito Hosted UI with
 * authorization-code + PKCE, tokens held in httpOnly Secure cookies set by a Next
 * route handler — never in web storage. Only this file changes.
 */
const KEY = 'limon.accessToken';

export const session = {
  getToken: async (): Promise<string | null> => (typeof window === 'undefined' ? null : sessionStorage.getItem(KEY)),
  setToken: (token: string) => sessionStorage.setItem(KEY, token),
  clear: () => sessionStorage.removeItem(KEY),
};
