import type { TenantAppStatus, TenantStatus, UserRole } from '@limon/types';
import type { DatabaseRouter } from './client.js';

export type ResolvedIdentity = {
  userId: string;
  tenantId: string | null;
  role: UserRole;
  userStatus: 'INVITED' | 'ACTIVE' | 'DISABLED';
  tenantStatus: TenantStatus | null;
  email: string;
  /** The tenant's Identity Platform tenant; null until provisioned, and with dev auth. */
  identityTenantId: string | null;
};

export type ResolvedTenantApp = {
  tenantId: string;
  tenantStatus: TenantStatus;
  appStatus: TenantAppStatus;
  appName: string;
  logoKey: string | null;
  primaryColor: string;
  secondaryColor: string | null;
  supportEmail: string | null;
  /** Admission mode: the tenant's `invite_only` feature flag. */
  inviteOnly: boolean;
  /** The Identity Platform tenant its patients sign in to (public: it's in the app's build config). */
  identityTenantId: string | null;
};

/** Login uid (token `sub`) → application user. Uses a SECURITY DEFINER function (see 0017_identity_platform). */
export async function resolveIdentity(router: DatabaseRouter, authUserId: string): Promise<ResolvedIdentity | null> {
  const rows = await router.controlPlane().$queryRaw<
    {
      user_id: string; tenant_id: string | null; role: UserRole; user_status: ResolvedIdentity['userStatus'];
      tenant_status: TenantStatus | null; email: string; identity_tenant_id: string | null;
    }[]
  >`SELECT * FROM app_resolve_identity(${authUserId})`;
  const r = rows[0];
  if (!r) return null;
  return {
    userId: r.user_id, tenantId: r.tenant_id, role: r.role, userStatus: r.user_status, tenantStatus: r.tenant_status,
    email: r.email, identityTenantId: r.identity_tenant_id,
  };
}

/** Public build-time app key → tenant context + runtime branding + admission mode. */
export async function resolveTenantApp(router: DatabaseRouter, appKey: string): Promise<ResolvedTenantApp | null> {
  const rows = await router.controlPlane().$queryRaw<
    {
      tenant_id: string; tenant_status: TenantStatus; app_status: TenantAppStatus; app_name: string; logo_key: string | null;
      primary_color: string; secondary_color: string | null; support_email: string | null; invite_only: boolean;
      identity_tenant_id: string | null;
    }[]
  >`SELECT * FROM app_resolve_tenant_app(${appKey})`;
  const r = rows[0];
  if (!r) return null;
  return {
    tenantId: r.tenant_id, tenantStatus: r.tenant_status, appStatus: r.app_status, appName: r.app_name,
    logoKey: r.logo_key, primaryColor: r.primary_color, secondaryColor: r.secondary_color, supportEmail: r.support_email,
    inviteOnly: r.invite_only, identityTenantId: r.identity_tenant_id,
  };
}

/**
 * Before sign-up: is this an unused, unexpired invite code of this tenant?
 * Answers yes/no only (see 0006_admission_modes). Redemption happens at registration.
 */
export async function isInviteCodeValid(router: DatabaseRouter, tenantId: string, code: string): Promise<boolean> {
  const rows = await router.controlPlane().$queryRaw<{ valid: boolean }[]>`
    SELECT app_invite_code_is_valid(${tenantId}::uuid, ${code}) AS valid`;
  return rows[0]?.valid === true;
}
