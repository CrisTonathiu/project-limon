import { withTenant, type TenantTx } from '@limon/database';
import type { TenantContext } from '@limon/tenant';
import type { ShoppingListResponse } from '@limon/types';
import type { Container } from '../../infrastructure/container.js';
import { Errors } from '../../lib/errors.js';
import { createMealPlansService } from '../meal-plans/meal-plans.service.js';
import { buildShoppingList } from './shopping-list.js';
import { shoppingListRepository } from './shopping-list.repository.js';

type Logger = { warn: (obj: object, msg: string) => void };

export function createShoppingListService(c: Container) {
  const mealPlans = createMealPlansService(c);
  const scoped = async <T>(tenantId: string, fn: (tx: TenantTx) => Promise<T>) =>
    withTenant(c.db, await c.registry.getPlacement(tenantId), fn);

  /** The current week's list with the patient's checks, or why there's no plan. */
  const build = async (ctx: TenantContext, log: Logger) => {
    const week = await mealPlans.currentWeekIngredients(ctx, log);
    if (week.status !== 'READY') return week;
    const checks = await scoped(ctx.tenantId, (tx) => shoppingListRepository.checks(tx, ctx.tenantId, week.patientId, new Date(week.weekStart)));
    const sections = buildShoppingList(week.ingredients, new Map(checks.map((c) => [c.foodId, c])));
    return { ...week, sections };
  };

  return {
    /** GET /shopping-list/current */
    current: async (ctx: TenantContext, log: Logger): Promise<ShoppingListResponse> => {
      const list = await build(ctx, log);
      if (list.status !== 'READY') return list;
      return { status: 'READY', weekStart: list.weekStart, sections: list.sections };
    },

    /**
     * PUT /shopping-list/current/items/:foodId: check or uncheck a food of this week's list.
     * A check records the amount the list shows now, so a plan change that asks for more unchecks it.
     */
    setChecked: async (ctx: TenantContext, foodId: string, checked: boolean, log: Logger): Promise<void> => {
      const list = await build(ctx, log);
      if (list.status !== 'READY') throw Errors.conflict('There is no meal plan this week.');
      const item = list.sections.flatMap((s) => s.items).find((i) => i.foodId === foodId);
      // Unchecking a food the list no longer has is fine (the plan changed since the app loaded it).
      if (!item && checked) throw Errors.notFound('Shopping list item');

      const weekStart = new Date(list.weekStart);
      await scoped(ctx.tenantId, async (tx) => {
        if (checked) await shoppingListRepository.check(tx, ctx.tenantId, list.patientId, weekStart, foodId, item!.unit, item!.amount);
        else await shoppingListRepository.uncheck(tx, ctx.tenantId, list.patientId, weekStart, foodId);
      });
    },
  };
}
