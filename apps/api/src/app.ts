import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import type { Container } from './infrastructure/container.js';
import { errorHandler } from './middleware/error-handler.js';
import { appsRoutes } from './modules/apps/apps.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { patientsRoutes } from './modules/patients/patients.routes.js';
import { subscriptionsRoutes } from './modules/subscriptions/subscriptions.routes.js';
import { tenantsRoutes } from './modules/tenants/tenants.routes.js';

const REQUEST_ID = /^[a-zA-Z0-9-]{8,64}$/;

export async function buildApp(c: Container) {
  const app = Fastify({
    trustProxy: true, // behind ALB/CloudFront
    bodyLimit: 1_048_576,
    disableRequestLogging: true, // replaced by the tenant-aware access log below
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    },
    logger: {
      level: c.env.APP_ENV === 'production' ? 'info' : 'debug',
      // Structured JSON → CloudWatch. Never log bodies or auth headers.
      redact: ['req.headers.authorization', 'req.headers.cookie', '*.email', '*.password'],
      serializers: {
        req: (req) => ({ method: req.method, url: req.url, requestId: req.id }),
      },
    },
  });

  await app.register(helmet);
  await app.register(cors, { origin: c.env.CORS_ORIGINS.split(',').map((s) => s.trim()), credentials: false });
  // Per-instance limiter. TODO(stage-2): Redis store or WAF rate rules for cross-task limits.
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });
  // Access log: answers "which tenant caused this request?" without logging bodies or PII.
  app.addHook('onResponse', async (req, reply) => {
    req.log.info(
      {
        requestId: req.id,
        tenantId: req.tenantContext?.tenantId,
        userId: req.tenantContext?.userId,
        method: req.method,
        route: req.routeOptions.url,
        statusCode: reply.statusCode,
        responseTimeMs: Math.round(reply.elapsedTime),
      },
      'request completed',
    );
  });
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler((req, reply) =>
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found.', requestId: req.id } }),
  );

  app.get('/health', async () => ({ status: 'ok' }));

  await app.register(
    async (v1) => {
      await authRoutes(v1, c);
      await appsRoutes(v1, c);
      await tenantsRoutes(v1, c);
      await patientsRoutes(v1, c);
      await subscriptionsRoutes(v1, c);
    },
    { prefix: '/api/v1' },
  );

  return app;
}
