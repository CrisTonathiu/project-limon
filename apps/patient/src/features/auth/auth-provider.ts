/**
 * Patient authentication abstraction.
 * - Production/cloud: Cognito (patient app client), full SRP via amazon-cognito-identity-js.
 *   The username is namespaced with the tenant UUID from build config (ADR-006), so the
 *   same email can be a patient of two nutritionists. The person only ever types their email.
 * - Development: dev tokens from the API.
 * Screens depend on this interface only, selected once via `patientAuthProvider` below.
 */
import { tenantUsername } from '@limon/tenant';
import { AuthenticationDetails, CognitoUser, CognitoUserAttribute, CognitoUserPool } from 'amazon-cognito-identity-js';
import { buildConfig } from '../../config/build-config';

export type SignUpResult = { status: 'signedIn'; token: string } | { status: 'needsConfirmation' };

export interface PatientAuthProvider {
  signUp(email: string, password: string): Promise<SignUpResult>;
  /** Only meaningful for Cognito, which requires email verification before sign-in. */
  confirmSignUp(email: string, code: string): Promise<void>;
  signIn(email: string, password: string): Promise<string>;
  signOut(): Promise<void>;
}

/** The identifier sent to Cognito. Exported for tests and for the dev provider. */
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
  async signUp(email) {
    return { status: 'signedIn', token: await devToken(`dev|${cognitoUsernameFor(email)}`) };
  },
  async confirmSignUp() {
    throw new Error('devAuthProvider never needs confirmation');
  },
  async signOut() {},
};

let pool: CognitoUserPool | undefined;
function userPool(): CognitoUserPool {
  if (!pool) {
    if (!buildConfig.cognitoUserPoolId || !buildConfig.cognitoPatientClientId) {
      throw new Error('Build config is missing Cognito user pool/client id');
    }
    pool = new CognitoUserPool({ UserPoolId: buildConfig.cognitoUserPoolId, ClientId: buildConfig.cognitoPatientClientId });
  }
  return pool;
}

const cognitoUserFor = (email: string) => new CognitoUser({ Username: cognitoUsernameFor(email), Pool: userPool() });

export const cognitoAuthProvider: PatientAuthProvider = {
  signUp: (email, password) =>
    new Promise((resolve, reject) => {
      userPool().signUp(
        cognitoUsernameFor(email),
        password,
        [new CognitoUserAttribute({ Name: 'email', Value: email })],
        [],
        (err) => (err ? reject(err) : resolve({ status: 'needsConfirmation' })),
      );
    }),
  confirmSignUp: (email, code) =>
    new Promise((resolve, reject) => {
      cognitoUserFor(email).confirmRegistration(code, true, (err) => (err ? reject(err) : resolve()));
    }),
  signIn: (email, password) =>
    new Promise((resolve, reject) => {
      const details = new AuthenticationDetails({ Username: cognitoUsernameFor(email), Password: password });
      cognitoUserFor(email).authenticateUser(details, {
        onSuccess: (session) => resolve(session.getAccessToken().getJwtToken()),
        onFailure: reject,
      });
    }),
  // Session persistence is our own SecureStore token, not the SDK's internal session cache
  // (session-context re-derives everything from the stored access token via /auth/me), so
  // there's nothing beyond that to tear down here.
  async signOut() {},
};

export const patientAuthProvider: PatientAuthProvider = buildConfig.authProvider === 'cognito' ? cognitoAuthProvider : devAuthProvider;
