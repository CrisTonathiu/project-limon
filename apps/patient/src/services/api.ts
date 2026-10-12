import { createApiClient } from '@limon/api-client';
import { buildConfig } from '../config/build-config';
import { patientAuthProvider } from '../features/auth/auth-provider';

/** Every request carries X-App-Key; the API still authenticates and checks tenant membership. */
export const api = createApiClient({
  baseUrl: buildConfig.apiBaseUrl,
  appKey: buildConfig.appKey,
  getAccessToken: () => patientAuthProvider.getToken(),
});
