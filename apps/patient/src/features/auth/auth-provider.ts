/**
 * Patient authentication abstraction.
 * - Production: Cognito (patient app client). The username is namespaced with the
 *   tenant UUID from build config (ADR-006), so the same email can be a patient of
 *   two nutritionists. The person only ever types their email.
 * - Development: dev tokens from the API.
 * Screens depend on this interface only.
 */
import { tenantUsername } from '@limon/tenant';
import { buildConfig } from '../../config/build-config';

export interface PatientAuthProvider {
  signIn(email: string, password: string): Promise<string>;
  signUp(email: string, password: string): Promise<string>;
  signOut(): Promise<void>;
}

/** The identifier sent to Cognito. Exported for tests and for the future Cognito provider. */
export function cognitoUsernameFor(email: string): string {
  if (!buildConfig.tenantId) throw new Error('Build config is missing tenantId');
  return tenantUsername(buildConfig.tenantId, email);
}

async function devToken(subject: string): Promise<string> {
  const res = await fetch(`${buildConfig.apiBaseUrl}/api/v1/dev/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject }),
  });
  if (!res.ok) throw new Error('Authentication failed');
  return ((await res.json()) as { accessToken: string }).accessToken;
}

export const devAuthProvider: PatientAuthProvider = {
  // Dev: the namespaced username doubles as the token subject, mirroring Cognito's `sub`.
  signIn: (email) => devToken(email.startsWith('dev|') ? email : `dev|${cognitoUsernameFor(email)}`),
  signUp: (email) => devToken(`dev|${cognitoUsernameFor(email)}`),
  async signOut() {},
};
