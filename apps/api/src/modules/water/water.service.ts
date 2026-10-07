import { withTenant, type TenantTx } from '@limon/database';
import type { TenantContext } from '@limon/tenant';
import type { WaterResponse, WaterTodayDto } from '@limon/types';
import type { Container } from '../../infrastructure/container.js';
import { Errors } from '../../lib/errors.js';
import { localToday } from '../meal-plans/week.js';
import { createPatientsService } from '../patients/patients.service.js';
import { defaultTargetMl, history, lastDays } from './water.js';
import { waterRepository } from './water.repository.js';

/**
 * Water tracker: the patient logs glasses through the day against a daily target (35 ml per kg
 * by default, or their own). Days follow the patients' calendar (America/Mexico_City).
 */
export function createWaterService(c: Container) {
  const patients = createPatientsService(c);
  const scoped = async <T>(tenantId: string, fn: (tx: TenantTx) => Promise<T>) =>
    withTenant(c.db, await c.registry.getPlacement(tenantId), fn);

  /** Today's intakes against the target, read inside the caller's transaction. */
  const today = async (tx: TenantTx, tenantId: string, patientId: string, weightKg: number, date: string): Promise<WaterTodayDto> => {
    const intakes = await waterRepository.intakes(tx, tenantId, patientId, new Date(date));
    const custom = await waterRepository.targetMl(tx, tenantId, patientId);
    const fallback = defaultTargetMl(weightKg);
    return {
      date,
      targetMl: custom ?? fallback,
      defaultTargetMl: fallback,
      customTarget: custom !== null,
      totalMl: intakes.reduce((sum, i) => sum + i.amountMl, 0),
      intakes: intakes.map((i) => ({ id: i.id, amountMl: i.amountMl, createdAt: i.createdAt.toISOString() })),
    };
  };

  /** Runs `fn` for the signed-in patient, then returns today's water. */
  const thenToday = async (ctx: TenantContext, fn: (tx: TenantTx, patientId: string, date: string) => Promise<void>) => {
    const { patientId, weightKg } = await patients.currentWeight(ctx);
    const date = localToday(new Date());
    return scoped(ctx.tenantId, async (tx) => {
      await fn(tx, patientId, date);
      return today(tx, ctx.tenantId, patientId, weightKg, date);
    });
  };

  return {
    /** GET /water: today, plus the daily totals of the last `days` days. */
    get: async (ctx: TenantContext, days: number): Promise<WaterResponse> => {
      const { patientId, weightKg } = await patients.currentWeight(ctx);
      const date = localToday(new Date());
      return scoped(ctx.tenantId, async (tx) => {
        const from = new Date(lastDays(date, days)[0]!);
        const totals = await waterRepository.dailyTotals(tx, ctx.tenantId, patientId, from);
        const byDay = new Map(totals.map((t) => [t.date.toISOString().slice(0, 10), t.totalMl]));
        return { ...(await today(tx, ctx.tenantId, patientId, weightKg, date)), history: history(date, days, byDay) };
      });
    },

    /** POST /water/intakes: a glass for today. */
    add: (ctx: TenantContext, amountMl: number): Promise<WaterTodayDto> =>
      thenToday(ctx, async (tx, patientId, date) => {
        await waterRepository.add(tx, ctx.tenantId, patientId, new Date(date), amountMl);
      }),

    /** DELETE /water/intakes/:id: undo a glass (any day's). */
    remove: (ctx: TenantContext, id: string): Promise<WaterTodayDto> =>
      thenToday(ctx, async (tx, patientId) => {
        if (!(await waterRepository.remove(tx, ctx.tenantId, patientId, id))) throw Errors.notFound('Water intake');
      }),

    /** PUT /water/target: the patient's own target, or null for the default. */
    setTarget: (ctx: TenantContext, targetMl: number | null): Promise<WaterTodayDto> =>
      thenToday(ctx, async (tx, patientId) => {
        if (targetMl === null) await waterRepository.clearTarget(tx, ctx.tenantId, patientId);
        else await waterRepository.setTarget(tx, ctx.tenantId, patientId, targetMl);
      }),
  };
}
