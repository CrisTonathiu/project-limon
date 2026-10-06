import type { TenantTx } from '@limon/database';
import type { ShoppingUnit } from '@limon/types';

/**
 * Every query filters by tenantId explicitly (defence in depth on top of RLS).
 */
export const shoppingListRepository = {
  checks: (tx: TenantTx, tenantId: string, patientId: string, weekStart: Date) =>
    tx.shoppingListCheck.findMany({ where: { tenantId, patientId, weekStart }, select: { foodId: true, unit: true, amount: true } }),

  /** Checks the food for the amount the list shows now. Checking it again updates the amount. */
  check: (tx: TenantTx, tenantId: string, patientId: string, weekStart: Date, foodId: string, unit: ShoppingUnit, amount: number) =>
    tx.shoppingListCheck.upsert({
      where: { tenantId_patientId_weekStart_foodId: { tenantId, patientId, weekStart, foodId } },
      create: { tenantId, patientId, weekStart, foodId, unit, amount },
      update: { unit, amount },
      select: { id: true },
    }),

  /** Idempotent. */
  uncheck: (tx: TenantTx, tenantId: string, patientId: string, weekStart: Date, foodId: string) =>
    tx.shoppingListCheck.deleteMany({ where: { tenantId, patientId, weekStart, foodId } }),
};
