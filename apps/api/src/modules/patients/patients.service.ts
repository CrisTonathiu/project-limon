import { withTenant, writeAudit } from '@limon/database';
import type { TenantContext } from '@limon/tenant';
import type { PatientDto } from '@limon/types';
import type { CreatePatientInput } from '@limon/validation';
import type { Container } from '../../infrastructure/container.js';
import { Errors } from '../../lib/errors.js';
import { patientsRepository } from './patients.repository.js';

type PatientRow = NonNullable<Awaited<ReturnType<typeof patientsRepository.findById>>>;
const toDto = (p: PatientRow): PatientDto => ({
  id: p.id, tenantId: p.tenantId, firstName: p.firstName, lastName: p.lastName, email: p.email, createdAt: p.createdAt.toISOString(),
});

export function createPatientsService(c: Container) {
  const scoped = async <T>(ctx: TenantContext, fn: Parameters<typeof withTenant<T>>[2]) =>
    withTenant(c.db, await c.registry.getPlacement(ctx.tenantId), fn);

  return {
    list: (ctx: TenantContext) => scoped(ctx, async (tx) => ({ items: (await patientsRepository.list(tx, ctx.tenantId)).map(toDto) })),

    get: (ctx: TenantContext, id: string) =>
      scoped(ctx, async (tx) => {
        const p = await patientsRepository.findById(tx, ctx.tenantId, id);
        // Another tenant's patient is indistinguishable from a non-existent one (no enumeration).
        if (!p) throw Errors.notFound('Patient');
        return toDto(p);
      }),

    me: (ctx: TenantContext) =>
      scoped(ctx, async (tx) => {
        const p = await patientsRepository.findByUserId(tx, ctx.tenantId, ctx.userId);
        if (!p) throw Errors.notFound('Patient');
        return toDto(p);
      }),

    create: (ctx: TenantContext, input: CreatePatientInput) =>
      scoped(ctx, async (tx) => {
        const p = await patientsRepository.create(tx, ctx.tenantId, input);
        await writeAudit(tx, ctx, { action: 'PatientCreated', resourceType: 'Patient', resourceId: p.id });
        return toDto(p);
      }),
  };
}
