import { Permission } from '@limon/auth';
import { RegisterNutritionistSchema, RegisterPatientSchema } from '@limon/validation';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../infrastructure/container.js';
import { ctxOf, requireAuthentication, requireTenant } from '../../middleware/auth.js';
import { createAuthService } from './auth.service.js';

export async function authRoutes(app: FastifyInstance, c: Container) {
  const service = createAuthService(c);

  app.post(
    '/auth/register/nutritionist',
    { preHandler: requireAuthentication(c), config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const input = RegisterNutritionistSchema.parse(req.body);
      const result = await service.registerNutritionist(req.principal!, input, req.id);
      return reply.status(201).send(result);
    },
  );

  // Patient self-signup: tenant is taken from X-App-Key, never from the body.
  app.post(
    '/auth/register/patient',
    { preHandler: requireAuthentication(c), config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const input = RegisterPatientSchema.parse(req.body);
      const appKey = typeof req.headers['x-app-key'] === 'string' ? req.headers['x-app-key'] : undefined;
      const result = await service.registerPatient(req.principal!, appKey, input, req.id);
      return reply.status(201).send(result);
    },
  );

  app.get('/auth/me', { preHandler: requireTenant(c, Permission.TENANT_READ) }, async (req) => service.me(ctxOf(req)));

  // Local development token issuer. Not registered unless AUTH_PROVIDER=dev (which config forbids outside development).
  if (c.devVerifier) {
    const dev = c.devVerifier;
    app.post('/dev/token', async (req) => {
      const { subject, email } = z.object({ subject: z.string().min(1), email: z.string().email().optional() }).parse(req.body);
      return { accessToken: await dev.issue(subject, email) };
    });
  }
}
