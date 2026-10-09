import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

/**
 * Server-side management of Identity Platform: one identity tenant per practice, holding
 * its patients' logins (ADR-006). Runs with the service account's own credentials (ADC);
 * on Cloud Run that's `api` / `worker`, which hold roles/identitytoolkit.admin.
 */
export interface IdentityAdmin {
  /** Creates the practice's identity tenant (email + password) and returns its id. */
  createTenant(slug: string): Promise<string>;
  /** Deletes a patient's login. Already gone counts as done (idempotent). */
  deleteUser(identityTenantId: string, uid: string): Promise<void>;
  /** Deletes the identity tenant and every login in it. Already gone counts as done. */
  deleteTenant(identityTenantId: string): Promise<void>;
}

/** Same rules as Cognito had: at least 10 characters, with upper, lower and digits. */
const PASSWORD_POLICY = {
  enforcementState: 'ENFORCE',
  forceUpgradeOnSignin: false,
  constraints: { minLength: 10, requireUppercase: true, requireLowercase: true, requireNumeric: true },
} as const;

/**
 * Identity Platform display names: 4–20 characters, letters, digits and hyphens, starting
 * with a letter. Only a label in the console; the tenant id is what the app and API use.
 */
export function identityTenantDisplayName(slug: string): string {
  let name = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^[^a-z]+/, '');
  name = name.slice(0, 20).replace(/-+$/, '');
  return name.length >= 4 ? name : `t-${name}`.padEnd(4, '0');
}

const notFound = (err: unknown) =>
  typeof err === 'object' && err !== null && 'code' in err && /not-found/.test(String((err as { code: unknown }).code));

export class FirebaseIdentityAdmin implements IdentityAdmin {
  private readonly auth;

  constructor(projectId: string) {
    const app = getApps().find((a) => a.name === 'limon-identity') ?? initializeApp({ projectId }, 'limon-identity');
    this.auth = getAuth(app);
  }

  async createTenant(slug: string): Promise<string> {
    const tenant = await this.auth.tenantManager().createTenant({
      displayName: identityTenantDisplayName(slug),
      emailSignInConfig: { enabled: true, passwordRequired: true },
      passwordPolicyConfig: PASSWORD_POLICY,
    });
    return tenant.tenantId;
  }

  async deleteUser(identityTenantId: string, uid: string): Promise<void> {
    try {
      await this.auth.tenantManager().authForTenant(identityTenantId).deleteUser(uid);
    } catch (err) {
      if (!notFound(err)) throw err;
    }
  }

  async deleteTenant(identityTenantId: string): Promise<void> {
    try {
      await this.auth.tenantManager().deleteTenant(identityTenantId);
    } catch (err) {
      if (!notFound(err)) throw err;
    }
  }
}
