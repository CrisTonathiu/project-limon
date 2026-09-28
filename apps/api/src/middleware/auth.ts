import type { Permission, VerifiedPrincipal } from '@limon/auth';
import { resolveIdentity, resolveTenantApp } from '@limon/database';
import { createEntitlementService } from '../modules/subscriptions/entitlement.service.js';
import type { TenantContext } from '@limon/tenant';
import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import type { Container } from '../infrastructure/container.js';
import { Errors } from '../lib/errors.js';
import { resolveTenantContext } from './tenant-context.js';

declare module 'fastify' {
  interface FastifyRequest {
    principal?: VerifiedPrincipal;
    tenantContext?: TenantContext;
  }
}

async function authenticate(c: Container, req: FastifyRequest): Promise<VerifiedPrincipal> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw Errors.unauthenticated();
  try {
    return await c.verifier.verify(header.slice(7));
  } catch {
    throw Errors.unauthenticated();
  }
}

/** Authentication only — for flows that run before a tenant exists (e.g. registration). */
export function requireAuthentication(c: Container): preHandlerAsyncHookHandler {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    req.principal = await authenticate(c, req);
  };
}

/** Full pipeline. Handlers behind this can rely on req.tenantContext. */
export function requireTenant(c: Container, permission: Permission): preHandlerAsyncHookHandler {
  return async (req: FastifyRequest) => {
    const principal = await authenticate(c, req);
    req.principal = principal;
    const appKey = typeof req.headers['x-app-key'] === 'string' ? req.headers['x-app-key'] : undefined;
    const entitlements = createEntitlementService(c);
    const ctx = await resolveTenantContext(
      {
        resolveIdentity: (s) => resolveIdentity(c.db, s),
        resolveTenantApp: (k) => resolveTenantApp(c.db, k),
        hasActiveEntitlement: (tenantId, userId) => entitlements.isActiveForUser(tenantId, userId),
      },
      { principal, appKey, permission, requestId: req.id },
    );
    req.tenantContext = ctx;
  };
}

export function ctxOf(req: FastifyRequest): TenantContext {
  if (!req.tenantContext) throw new Error('tenantContext missing: route is not protected by requireTenant');
  return req.tenantContext;
}
