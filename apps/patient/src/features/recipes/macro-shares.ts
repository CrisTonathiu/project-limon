import type { RecipeMacros } from '@limon/types';

/** kcal per gram (Atwater). */
const KCAL = { protein: 4, carbohydrate: 4, fat: 9 } as const;

/**
 * Each macro's share of the energy from all three (0 to 1), for the macro bars. All zero when
 * there is no energy, so the bars stay empty instead of dividing by zero.
 */
export function macroShares(m: Pick<RecipeMacros, 'protein' | 'carbohydrate' | 'fat'>) {
  const kcal = {
    protein: m.protein * KCAL.protein,
    carbohydrate: m.carbohydrate * KCAL.carbohydrate,
    fat: m.fat * KCAL.fat,
  };
  const total = kcal.protein + kcal.carbohydrate + kcal.fat;
  if (total <= 0) return { protein: 0, carbohydrate: 0, fat: 0 };
  return {
    protein: kcal.protein / total,
    carbohydrate: kcal.carbohydrate / total,
    fat: kcal.fat / total,
  };
}
