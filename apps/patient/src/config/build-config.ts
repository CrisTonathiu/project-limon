import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Read-only view of the BUILD-TIME config injected by app.config.ts. */
type Extra = {
  tenantSlug: string;
  tenantId?: string;
  appKeys: { ios: string; android: string };
  apiBaseUrl: string;
  authProvider: 'dev' | 'cognito';
  cognitoUserPoolId?: string;
  cognitoPatientClientId?: string;
};
const extra = Constants.expoConfig?.extra as Extra;

export const buildConfig = {
  tenantSlug: extra.tenantSlug,
  /** Used to namespace the Cognito username so one email can exist in several tenants (ADR-006). */
  tenantId: extra.tenantId,
  appKey: Platform.OS === 'ios' ? extra.appKeys.ios : extra.appKeys.android,
  apiBaseUrl: extra.apiBaseUrl,
  /** "dev" (local dev-token API) or "cognito" (real user pool). Mirrors the API's AUTH_PROVIDER. */
  authProvider: extra.authProvider,
  cognitoUserPoolId: extra.cognitoUserPoolId,
  cognitoPatientClientId: extra.cognitoPatientClientId,
} as const;
