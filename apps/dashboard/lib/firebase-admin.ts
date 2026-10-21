import 'server-only';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

/**
 * Project-level Identity Platform admin, with the service account's own credentials (ADC):
 * on Cloud Run the `dashboard` service account, locally your gcloud application-default login.
 * Used only to mint session cookies; the API verifies them.
 */
export function adminAuth(projectId: string) {
  const app = getApps().find((a) => a.name === 'limon-dashboard') ?? initializeApp({ projectId }, 'limon-dashboard');
  return getAuth(app);
}
