import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Read-only view of the BUILD-TIME config injected by app.config.ts. */
type Extra = {
  tenantSlug: string;
  tenantId?: string;
  appKeys: { ios: string; android: string };
  apiBaseUrl: string;
  authProvider: 'dev' | 'identity-platform';
  identityTenantId?: string;
  firebaseApiKey?: string;
  firebaseAuthDomain?: string;
};
const extra = Constants.expoConfig?.extra as Extra;

/**
 * Development only: on a real phone, "localhost" is the phone itself. When the API URL
 * points at localhost, reuse the host the Expo dev server was reached on (the Mac's
 * LAN address, e.g. "192.168.1.20:8081") so the phone reaches the API on the same machine.
 */
function resolveApiBaseUrl(url: string): string {
  const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (!__DEV__ || !devHost) return url;
  return url.replace(/\/\/(localhost|127\.0\.0\.1)(?=[:/]|$)/, `//${devHost}`);
}

export const buildConfig = {
  tenantSlug: extra.tenantSlug,
  /** Namespaces dev token subjects (tenantUsername in @limon/tenant). */
  tenantId: extra.tenantId,
  appKey: Platform.OS === 'ios' ? extra.appKeys.ios : extra.appKeys.android,
  apiBaseUrl: resolveApiBaseUrl(extra.apiBaseUrl),
  /** "dev" (local dev-token API) or "identity-platform". Mirrors the API's AUTH_PROVIDER. */
  authProvider: extra.authProvider,
  /** This practice's Identity Platform tenant: its patients' logins live there (ADR-006). */
  identityTenantId: extra.identityTenantId,
  /** The GCP project's public web config (per environment, not per practice). */
  firebaseApiKey: extra.firebaseApiKey,
  firebaseAuthDomain: extra.firebaseAuthDomain,
} as const;
