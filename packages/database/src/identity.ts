import type { TenantAppStatus, TenantStatus, UserRole } from '@limon/types';
import type { DatabaseRouter } from './client.js';

export type ResolvedIdentity = {
  userId: string;
  tenantId: string | null;
  role: UserRole;
  userStatus: 'INVITED' | 'ACTIVE' | 'DISABLED';
  tenantStatus: TenantStatus | null;
  email: string;
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
};

/** Cognito `sub` → application user. Uses a SECURITY DEFINER function (see 0002_rls). */
export async function resolveIdentity(router: DatabaseRouter, cognitoSub: string): Promise<ResolvedIdentity | null> {
  const rows = await router.controlPlane().$queryRaw<
    { user_id: string; tenant_id: string | null; role: UserRole; user_status: ResolvedIdentity['userStatus']; tenant_status: TenantStatus | null; email: string }[]
  >`SELECT * FROM app_resolve_identity(${cognitoSub})`;
  const r = rows[0];
  if (!r) return null;
  return { userId: r.user_id, tenantId: r.tenant_id, role: r.role, userStatus: r.user_status, tenantStatus: r.tenant_status, email: r.email };
}

/** Public build-time app key → tenant context + runtime branding. */
export async function resolveTenantApp(router: DatabaseRouter, appKey: string): Promise<ResolvedTenantApp | null> {
  const rows = await router.controlPlane().$queryRaw<
    { tenant_id: string; tenant_status: TenantStatus; app_status: TenantAppStatus; app_name: string; logo_key: string | null; primary_color: string; secondary_color: string | null; support_email: string | null }[]
  >`SELECT * FROM app_resolve_tenant_app(${appKey})`;
  const r = rows[0];
  if (!r) return null;
  return {
    tenantId: r.tenant_id, tenantStatus: r.tenant_status, appStatus: r.app_status, appName: r.app_name,
    logoKey: r.logo_key, primaryColor: r.primary_color, secondaryColor: r.secondary_color, supportEmail: r.support_email,
  };
}
