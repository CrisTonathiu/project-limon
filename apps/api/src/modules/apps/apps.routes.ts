import { isInviteCodeValid, resolveTenantApp, type ResolvedTenantApp } from '@limon/database';
import type { TenantAppConfig } from '@limon/types';
import { InviteCodeSchema } from '@limon/validation';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Container } from '../../infrastructure/container.js';
import { Errors } from '../../lib/errors.js';

/** Resolves X-App-Key to a live tenant app, or throws the error the app shows. */
async function liveTenantApp(c: Container, req: FastifyRequest): Promise<ResolvedTenantApp> {
  const appKey = req.headers['x-app-key'];
  if (typeof appKey !== 'string' || appKey.length > 128) throw Errors.appNotRecognized();
  const app = await resolveTenantApp(c.db, appKey);
  if (!app || app.appStatus === 'REMOVED') throw Errors.appNotRecognized();
  if (app.tenantStatus === 'DELETION_PENDING' || app.tenantStatus === 'DELETED' || app.tenantStatus === 'SUSPENDED') {
    throw Errors.tenantSuspended();
  }
  return app;
}

export async function appsRoutes(app: FastifyInstance, c: Container) {
  /**
   * PUBLIC, unauthenticated. The patient app calls this on launch with its build-time
   * X-App-Key to fetch runtime branding and the admission mode. Returns only data that
   * is already public (what's shown on the store listing). Grants NO access to tenant data.
   */
  app.get('/apps/bootstrap', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const resolved = await liveTenantApp(c, req);
    reply.header('Cache-Control', 'public, max-age=300');
    const body: TenantAppConfig = {
      tenantId: resolved.tenantId,
      requiresInviteCode: resolved.inviteOnly,
      appName: resolved.appName,
      logoUrl: null, // TODO: CloudFront URL for branding/ once asset pipeline exists
      primaryColor: resolved.primaryColor,
      secondaryColor: resolved.secondaryColor,
      supportEmail: resolved.supportEmail,
    };
    return body;
  });

  /**
   * PUBLIC, unauthenticated. Checks a patient's invite code BEFORE they create their
   * login, so a typo is caught before an account exists. Scoped to the app's tenant,
   * answers yes/no only (204 or INVITE_CODE_INVALID), tightly rate-limited against
   * guessing. The code is checked again and redeemed at registration.
   */
  app.get<{ Params: { code: string } }>(
    '/invites/:code',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const tenantApp = await liveTenantApp(c, req);
      const parsed = InviteCodeSchema.safeParse(req.params.code);
      if (!parsed.success || !(await isInviteCodeValid(c.db, tenantApp.tenantId, parsed.data))) {
        throw Errors.inviteCodeInvalid();
      }
      return reply.header('Cache-Control', 'no-store').status(204).send();
    },
  );
}
