import 'server-only';

/**
 * The dashboard server's configuration, read at request time (not inlined at build), so one
 * image serves every environment. Mirrors @limon/config's rule: dev auth only in development.
 */
export type AuthProvider = 'identity-platform' | 'dev';

export type FirebaseWebConfig = { apiKey: string; authDomain: string; projectId: string };

export function serverEnv() {
  const appEnv = process.env.APP_ENV ?? 'development';
  const authProvider = (process.env.AUTH_PROVIDER ?? 'dev') as AuthProvider;
  if (authProvider !== 'dev' && authProvider !== 'identity-platform') throw new Error('AUTH_PROVIDER: unknown provider');
  if (authProvider === 'dev' && appEnv !== 'development') throw new Error('AUTH_PROVIDER: dev auth is forbidden outside development');
  return {
    authProvider,
    /** Where the proxy sends API calls (server to server). */
    apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:4000',
    /** The dashboard's own public origin: state-changing requests must come from it. */
    origin: process.env.DASHBOARD_ORIGIN ?? 'http://localhost:3000',
    projectId: process.env.GCP_PROJECT_ID,
  };
}

/** The Firebase web config for the sign-in form. Public values; null with dev auth. */
export function firebaseWebConfig(): FirebaseWebConfig | null {
  if (serverEnv().authProvider !== 'identity-platform') return null;
  const { FIREBASE_API_KEY: apiKey, FIREBASE_AUTH_DOMAIN: authDomain, GCP_PROJECT_ID: projectId } = process.env;
  if (!apiKey || !authDomain || !projectId) throw new Error('FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN and GCP_PROJECT_ID are required for identity-platform');
  return { apiKey, authDomain, projectId };
}
