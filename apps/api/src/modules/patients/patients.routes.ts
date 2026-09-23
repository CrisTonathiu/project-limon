import { Permission } from '@limon/auth';
import { CreatePatientSchema, UuidParamSchema } from '@limon/validation';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../../infrastructure/container.js';
import { ctxOf, requireTenant } from '../../middleware/auth.js';
import { createPatientsService } from './patients.service.js';

export async function patientsRoutes(app: FastifyInstance, c: Container) {
  const service = createPatientsService(c);

  app.get('/patients/me', { preHandler: requireTenant(c, Permission.SELF_PATIENT_READ) }, async (req) => service.me(ctxOf(req)));
  app.get('/patients', { preHandler: requireTenant(c, Permission.PATIENTS_READ) }, async (req) => service.list(ctxOf(req)));
  app.get('/patients/:id', { preHandler: requireTenant(c, Permission.PATIENTS_READ) }, async (req) =>
    service.get(ctxOf(req), UuidParamSchema.parse(req.params).id),
  );
  app.post('/patients', { preHandler: requireTenant(c, Permission.PATIENTS_WRITE) }, async (req, reply) =>
    reply.status(201).send(await service.create(ctxOf(req), CreatePatientSchema.parse(req.body))),
  );
}
