import { resolveTenantApp } from '@limon/database';
import type { TenantAppConfig } from '@limon/types';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../../infrastructure/container.js';
import { Errors } from '../../lib/errors.js';

export async function appsRoutes(app: FastifyInstance, c: Container) {
  /**
   * PUBLIC, unauthenticated. The patient app calls this on launch with its build-time
   * X-App-Key to fetch runtime branding. Returns only data that is already public
   * (what's shown on the store listing). Grants NO access to tenant data.
   */
  app.get('/apps/bootstrap', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const appKey = req.headers['x-app-key'];
    if (typeof appKey !== 'string' || appKey.length > 128) throw Errors.appNotRecognized();
    const resolved = await resolveTenantApp(c.db, appKey);
    if (!resolved || resolved.appStatus === 'REMOVED') throw Errors.appNotRecognized();
    if (resolved.tenantStatus === 'DELETION_PENDING' || resolved.tenantStatus === 'DELETED' || resolved.tenantStatus === 'SUSPENDED') {
      throw Errors.tenantSuspended();
    }
    reply.header('Cache-Control', 'public, max-age=300');
    const body: TenantAppConfig = {
      tenantId: resolved.tenantId,
      appName: resolved.appName,
      logoUrl: null, // TODO: CloudFront URL for branding/ once asset pipeline exists
      primaryColor: resolved.primaryColor,
      secondaryColor: resolved.secondaryColor,
      supportEmail: resolved.supportEmail,
    };
    return body;
  });
}
