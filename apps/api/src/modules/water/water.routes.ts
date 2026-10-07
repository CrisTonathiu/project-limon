import { Permission } from '@limon/auth';
import { FeatureKey } from '@limon/types';
import { UuidParamSchema, WaterIntakeSchema, WaterQuerySchema, WaterTargetSchema } from '@limon/validation';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../../infrastructure/container.js';
import { ctxOf, requireFeature, requireTenant } from '../../middleware/auth.js';
import { createWaterService } from './water.service.js';

/** The patient's water tracker (paywalled, behind the water_tracker module). */
export async function waterRoutes(app: FastifyInstance, c: Container) {
  const service = createWaterService(c);
  const feature = requireFeature(c, FeatureKey.WATER_TRACKER);
  const read = [requireTenant(c, Permission.SELF_PROGRESS_READ), feature];
  const write = [requireTenant(c, Permission.SELF_PROGRESS_WRITE), feature];

  app.get('/water', { preHandler: read }, async (req, reply) =>
    reply.header('Cache-Control', 'no-store').send(await service.get(ctxOf(req), WaterQuerySchema.parse(req.query).days)),
  );
  app.post('/water/intakes', { preHandler: write }, async (req, reply) =>
    reply.status(201).send(await service.add(ctxOf(req), WaterIntakeSchema.parse(req.body).amountMl)),
  );
  app.delete('/water/intakes/:id', { preHandler: write }, async (req) => service.remove(ctxOf(req), UuidParamSchema.parse(req.params).id));
  app.put('/water/target', { preHandler: write }, async (req) => service.setTarget(ctxOf(req), WaterTargetSchema.parse(req.body).targetMl));
}
