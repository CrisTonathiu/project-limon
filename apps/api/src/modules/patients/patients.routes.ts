import { Permission } from '@limon/auth';
import { FeatureKey } from '@limon/types';
import {
  BodyLogSchema,
  CreatePatientSchema,
  IsoDateParamSchema,
  PatientProfileSchema,
  ProgressQuerySchema,
  SetGoalSchema,
  UuidParamSchema,
} from '@limon/validation';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../../infrastructure/container.js';
import { ctxOf, requireFeature, requireTenant } from '../../middleware/auth.js';
import { createPatientsService } from './patients.service.js';

export async function patientsRoutes(app: FastifyInstance, c: Container) {
  const service = createPatientsService(c);

  app.get(
    '/patients/me',
    { preHandler: requireTenant(c, Permission.SELF_PATIENT_READ) },
    async (req) => service.me(ctxOf(req)),
  );
  app.delete(
    '/patients/me',
    { preHandler: requireTenant(c, Permission.SELF_PATIENT_WRITE) },
    async (req, reply) => {
      await service.deleteMyAccount(ctxOf(req));
      return reply.status(204).send();
    },
  );
  app.get(
    '/patients/me/profile',
    { preHandler: requireTenant(c, Permission.SELF_PATIENT_READ) },
    async (req) => service.myProfile(ctxOf(req)),
  );
  app.put(
    '/patients/me/profile',
    { preHandler: requireTenant(c, Permission.SELF_PATIENT_WRITE) },
    async (req) => service.saveMyProfile(ctxOf(req), PatientProfileSchema.parse(req.body)),
  );
  const goals = requireFeature(c, FeatureKey.GOAL_TRACKER);
  app.get(
    '/patients/me/goal',
    { preHandler: [requireTenant(c, Permission.SELF_PATIENT_READ), goals] },
    async (req) => service.myGoal(ctxOf(req)),
  );
  app.put(
    '/patients/me/goal',
    { preHandler: [requireTenant(c, Permission.SELF_PATIENT_WRITE), goals] },
    async (req) => service.setMyGoal(ctxOf(req), SetGoalSchema.parse(req.body)),
  );
  // Weigh-ins and body measurements: part of the goal tracker, and paywalled.
  const readProgress = [requireTenant(c, Permission.SELF_PROGRESS_READ), goals];
  const writeProgress = [requireTenant(c, Permission.SELF_PROGRESS_WRITE), goals];
  app.get('/patients/me/progress', { preHandler: readProgress }, async (req, reply) =>
    reply
      .header('Cache-Control', 'no-store')
      .send(await service.myProgress(ctxOf(req), ProgressQuerySchema.parse(req.query).period)),
  );
  app.get('/patients/me/body-logs', { preHandler: readProgress }, async (req, reply) =>
    reply.header('Cache-Control', 'no-store').send(await service.myBodyLogs(ctxOf(req))),
  );
  app.put('/patients/me/body-logs/:date', { preHandler: writeProgress }, async (req) =>
    service.saveMyBodyLog(
      ctxOf(req),
      IsoDateParamSchema.parse(req.params).date,
      BodyLogSchema.parse(req.body),
    ),
  );
  app.delete('/patients/me/body-logs/:date', { preHandler: writeProgress }, async (req, reply) => {
    await service.deleteMyBodyLog(ctxOf(req), IsoDateParamSchema.parse(req.params).date);
    return reply.status(204).send();
  });
  app.get('/patients', { preHandler: requireTenant(c, Permission.PATIENTS_READ) }, async (req) =>
    service.list(ctxOf(req)),
  );
  app.get(
    '/patients/:id',
    { preHandler: requireTenant(c, Permission.PATIENTS_READ) },
    async (req) => service.get(ctxOf(req), UuidParamSchema.parse(req.params).id),
  );
  app.post(
    '/patients',
    { preHandler: requireTenant(c, Permission.PATIENTS_WRITE) },
    async (req, reply) =>
      reply.status(201).send(await service.create(ctxOf(req), CreatePatientSchema.parse(req.body))),
  );
}
