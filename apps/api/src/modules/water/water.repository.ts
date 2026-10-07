import type { TenantTx } from '@limon/database';

/**
 * Every query filters by tenantId explicitly (defence in depth on top of RLS).
 */
export const waterRepository = {
  /** One day's intakes, newest first. */
  intakes: (tx: TenantTx, tenantId: string, patientId: string, date: Date) =>
    tx.waterIntake.findMany({
      where: { tenantId, patientId, date },
      orderBy: { createdAt: 'desc' },
      select: { id: true, amountMl: true, createdAt: true },
    }),

  /** Total per day from `from` on. */
  dailyTotals: async (tx: TenantTx, tenantId: string, patientId: string, from: Date) =>
    (
      await tx.waterIntake.groupBy({
        by: ['date'],
        where: { tenantId, patientId, date: { gte: from } },
        _sum: { amountMl: true },
      })
    ).map((g) => ({ date: g.date, totalMl: g._sum.amountMl ?? 0 })),

  add: (tx: TenantTx, tenantId: string, patientId: string, date: Date, amountMl: number) =>
    tx.waterIntake.create({ data: { tenantId, patientId, date, amountMl }, select: { id: true } }),

  /** Only the patient's own intake; returns how many rows went (0 or 1). */
  remove: async (tx: TenantTx, tenantId: string, patientId: string, id: string) =>
    (await tx.waterIntake.deleteMany({ where: { id, tenantId, patientId } })).count,

  targetMl: async (tx: TenantTx, tenantId: string, patientId: string) =>
    (await tx.waterSettings.findUnique({ where: { tenantId_patientId: { tenantId, patientId } }, select: { targetMl: true } }))
      ?.targetMl ?? null,

  setTarget: (tx: TenantTx, tenantId: string, patientId: string, targetMl: number) =>
    tx.waterSettings.upsert({
      where: { tenantId_patientId: { tenantId, patientId } },
      create: { tenantId, patientId, targetMl },
      update: { targetMl },
    }),

  /** Back to the default target. Idempotent. */
  clearTarget: (tx: TenantTx, tenantId: string, patientId: string) =>
    tx.waterSettings.deleteMany({ where: { tenantId, patientId } }),
};
