import { ENTITLED_PERMISSIONS, hasPermission, WRITE_PERMISSIONS, type Permission, type VerifiedPrincipal } from '@limon/auth';
import type { ResolvedIdentity, ResolvedTenantApp } from '@limon/database';
import { accessFor, createTenantContext, type TenantContext } from '@limon/tenant';
import { Errors } from '../lib/errors.js';

export type ResolveDeps = {
  resolveIdentity: (cognitoSub: string) => Promise<ResolvedIdentity | null>;
  resolveTenantApp: (appKey: string) => Promise<ResolvedTenantApp | null>;
  /** Does this patient have paid access right now? Checked server-side, never from the client. */
  hasActiveEntitlement: (tenantId: string, userId: string) => Promise<boolean>;
};

/**
 * The access-control pipeline (docs/architecture/authorization.md).
 * Pure function of (verified principal, app key header, required permission) → TenantContext.
 *
 *   authenticate → resolve user → resolve tenant → [verify app ↔ tenant]
 *   → validate tenant status → authorize permission → context for tenant-scoped queries
 *
 * Nothing here reads tenantId/userId/role from the request body, query or claims.
 */
export async function resolveTenantContext(
  deps: ResolveDeps,
  input: { principal: VerifiedPrincipal; appKey: string | undefined; permission: Permission; requestId: string },
): Promise<TenantContext> {
  // 2. Resolve application user from the verified Cognito subject
  const identity = await deps.resolveIdentity(input.principal.subject);
  if (!identity || identity.userStatus === 'DISABLED') throw Errors.forbidden();

  // 3. Resolve tenant (from the DATABASE, not the client)
  if (!identity.tenantId || !identity.tenantStatus) throw Errors.tenantNotFound();

  // 4. App identity: patients must come through a registered tenant app, and it must be THEIR tenant's app
  if (identity.role === 'PATIENT' && !input.appKey) throw Errors.appNotRecognized();
  if (input.appKey) {
    const app = await deps.resolveTenantApp(input.appKey);
    if (!app) throw Errors.appNotRecognized();
    if (app.tenantId !== identity.tenantId) throw Errors.tenantMismatch();
  }

  // 5. Tenant lifecycle
  const audience = identity.role === 'PATIENT' ? 'PATIENT' : 'NUTRITIONIST';
  const access = accessFor(identity.tenantStatus, audience);
  if (access === 'NONE') throw Errors.tenantSuspended();
  if (access === 'READ_ONLY' && WRITE_PERMISSIONS.has(input.permission)) throw Errors.tenantSuspended();

  // 6. Role → permission
  if (!hasPermission(identity.role, input.permission)) throw Errors.forbidden();

  // 7. Entitlement: patients pay for access. Store receipts/webhooks are the source of
  //    truth (written to patient_subscriptions); the client never asserts entitlement.
  if (identity.role === 'PATIENT' && ENTITLED_PERMISSIONS.has(input.permission)) {
    if (!(await deps.hasActiveEntitlement(identity.tenantId, identity.userId))) throw Errors.subscriptionRequired();
  }

  return createTenantContext({
    tenantId: identity.tenantId,
    userId: identity.userId,
    role: identity.role,
    tenantStatus: identity.tenantStatus,
    requestId: input.requestId,
  });
}
