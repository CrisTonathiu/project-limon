import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Read-only view of the BUILD-TIME config injected by app.config.ts. */
type Extra = { tenantSlug: string; tenantId?: string; appKeys: { ios: string; android: string }; apiBaseUrl: string };
const extra = Constants.expoConfig?.extra as Extra;

export const buildConfig = {
  tenantSlug: extra.tenantSlug,
  /** Used to namespace the Cognito username so one email can exist in several tenants (ADR-006). */
  tenantId: extra.tenantId,
  appKey: Platform.OS === 'ios' ? extra.appKeys.ios : extra.appKeys.android,
  apiBaseUrl: extra.apiBaseUrl,
} as const;
