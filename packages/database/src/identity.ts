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

type ResolvedBranding = {
  appName: string;
  logoKey: string | null;
  primaryColor: string;
  secondaryColor: string | null;
  supportEmail: string | null;
};

/** A tenant's own branded app: the app key identifies the tenant. */
export type ResolvedTenantApp = ResolvedBranding & {
  kind: 'TENANT';
  tenantId: string;
  tenantStatus: TenantStatus;
  appStatus: TenantAppStatus;
};

/** The platform's shared app: the app key identifies NO tenant. */
export type ResolvedSharedApp = ResolvedBranding & {
  kind: 'SHARED';
  appStatus: TenantAppStatus;
};

export type ResolvedApp = ResolvedTenantApp | ResolvedSharedApp;

export type ResolvedInviteCode = ResolvedBranding & {
  tenantId: string;
  tenantStatus: TenantStatus;
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

type AppRow = {
  kind: 'TENANT' | 'SHARED'; tenant_id: string | null; tenant_status: TenantStatus | null; app_status: TenantAppStatus;
  app_name: string; logo_key: string | null; primary_color: string; secondary_color: string | null; support_email: string | null;
};

/**
 * Public build-time app key → which app is calling (see 0005_shared_app).
 * TENANT: a tenant's own branded app, with that tenant's runtime branding.
 * SHARED: the platform app; carries no tenant — callers must get it elsewhere.
 */
export async function resolveApp(router: DatabaseRouter, appKey: string): Promise<ResolvedApp | null> {
  const rows = await router.controlPlane().$queryRaw<AppRow[]>`SELECT * FROM app_resolve_app(${appKey})`;
  const r = rows[0];
  if (!r) return null;
  const branding = { appName: r.app_name, logoKey: r.logo_key, primaryColor: r.primary_color, secondaryColor: r.secondary_color, supportEmail: r.support_email };
  if (r.kind === 'SHARED') return { kind: 'SHARED', appStatus: r.app_status, ...branding };
  return { kind: 'TENANT', tenantId: r.tenant_id!, tenantStatus: r.tenant_status!, appStatus: r.app_status, ...branding };
}

/** Invite code → tenant + public branding. Null for unknown, inactive or expired codes. */
export async function resolveInviteCode(router: DatabaseRouter, code: string): Promise<ResolvedInviteCode | null> {
  const rows = await router.controlPlane().$queryRaw<
    { tenant_id: string; tenant_status: TenantStatus; app_name: string; logo_key: string | null; primary_color: string; secondary_color: string | null; support_email: string | null }[]
  >`SELECT * FROM app_resolve_invite_code(${code})`;
  const r = rows[0];
  if (!r) return null;
  return {
    tenantId: r.tenant_id, tenantStatus: r.tenant_status, appName: r.app_name,
    logoKey: r.logo_key, primaryColor: r.primary_color, secondaryColor: r.secondary_color, supportEmail: r.support_email,
  };
}
