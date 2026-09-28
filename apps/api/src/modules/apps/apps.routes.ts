import { resolveApp, resolveInviteCode } from '@limon/database';
import type { TenantAppConfig } from '@limon/types';
import { InviteCodeSchema } from '@limon/validation';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../../infrastructure/container.js';
import { Errors } from '../../lib/errors.js';

/** Tenant statuses that hide a tenant's public branding (bootstrap, invite lookup). */
const UNAVAILABLE = new Set(['DELETION_PENDING', 'DELETED', 'SUSPENDED']);

export async function appsRoutes(app: FastifyInstance, c: Container) {
  /**
   * PUBLIC, unauthenticated. The patient app calls this on launch with its build-time
   * X-App-Key to fetch runtime branding. Returns only data that is already public
   * (what's shown on the store listing). Grants NO access to tenant data.
   *
   * A tenant's own app gets that tenant's branding. The shared platform app gets the
   * platform branding and `requiresInviteCode: true`: the tenant comes from GET /invites/:code.
   */
  app.get('/apps/bootstrap', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const appKey = req.headers['x-app-key'];
    if (typeof appKey !== 'string' || appKey.length > 128) throw Errors.appNotRecognized();
    const resolved = await resolveApp(c.db, appKey);
    if (!resolved || resolved.appStatus === 'REMOVED') throw Errors.appNotRecognized();
    if (resolved.kind === 'SHARED') {
      if (resolved.appStatus === 'DISABLED') throw Errors.appNotRecognized();
    } else if (UNAVAILABLE.has(resolved.tenantStatus)) {
      throw Errors.tenantSuspended();
    }
    reply.header('Cache-Control', 'public, max-age=300');
    const body: TenantAppConfig = {
      tenantId: resolved.kind === 'TENANT' ? resolved.tenantId : null,
      requiresInviteCode: resolved.kind === 'SHARED',
      appName: resolved.appName,
      logoUrl: null, // TODO: CloudFront URL for branding/ once asset pipeline exists
      primaryColor: resolved.primaryColor,
      secondaryColor: resolved.secondaryColor,
      supportEmail: resolved.supportEmail,
    };
    return body;
  });

  /**
   * PUBLIC, unauthenticated. The shared app calls this when a patient types an invite
   * code, to learn which nutritionist they are joining and apply that branding before
   * signup. Exact match only (no listing), tightly rate-limited against guessing.
   * The tenant is re-resolved from the code at registration; this response is display only.
   */
  app.get<{ Params: { code: string } }>(
    '/invites/:code',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const parsed = InviteCodeSchema.safeParse(req.params.code);
      if (!parsed.success) throw Errors.inviteCodeInvalid();
      const invite = await resolveInviteCode(c.db, parsed.data);
      if (!invite) throw Errors.inviteCodeInvalid();
      if (UNAVAILABLE.has(invite.tenantStatus)) throw Errors.tenantSuspended();
      reply.header('Cache-Control', 'no-store');
      const body: TenantAppConfig = {
        tenantId: invite.tenantId,
        requiresInviteCode: false,
        appName: invite.appName,
        logoUrl: null, // TODO: CloudFront URL for branding/ once asset pipeline exists
        primaryColor: invite.primaryColor,
        secondaryColor: invite.secondaryColor,
        supportEmail: invite.supportEmail,
      };
      return body;
    },
  );
}
