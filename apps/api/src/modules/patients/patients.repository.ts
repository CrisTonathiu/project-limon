import type { TenantTx } from '@limon/database';
import type { CreatePatientInput } from '@limon/validation';

/**
 * Every query filters by tenantId explicitly (defence in depth on top of RLS).
 */
export const patientsRepository = {
  list: (tx: TenantTx, tenantId: string, limit = 50) =>
    tx.patient.findMany({ where: { tenantId, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: limit }),

  findById: (tx: TenantTx, tenantId: string, id: string) =>
    tx.patient.findFirst({ where: { id, tenantId, deletedAt: null } }),

  findByUserId: (tx: TenantTx, tenantId: string, userId: string) =>
    tx.patient.findFirst({ where: { userId, tenantId, deletedAt: null } }),

  create: (tx: TenantTx, tenantId: string, input: CreatePatientInput) =>
    tx.patient.create({
      data: {
        tenantId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email?.toLowerCase() ?? null,
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
      },
    }),
};
