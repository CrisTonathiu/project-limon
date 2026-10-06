import { describe, expect, it } from 'vitest';
import { effectiveGoalRules } from '../../src/modules/patients/goal-rules.js';

describe('effectiveGoalRules', () => {
  it("uses the platform's guardrails when the clinic has no rules", () => {
    expect(effectiveGoalRules(null)).toEqual({
      minAge: 18,
      floorKcal: { FEMALE: 1200, MALE: 1500 },
      maxWeeklyLossShare: 0.01,
      minBmiToLose: 18.5,
      paces: { lose: ['GENTLE', 'MODERATE'], gain: ['GENTLE', 'MODERATE'] },
      version: 'platform-1',
    });
  });

  it("applies the clinic's stricter limits and its paces, in pace order", () => {
    const rules = effectiveGoalRules({
      version: 3,
      rules: {
        paces: { lose: ['MODERATE', 'GENTLE'], gain: ['GENTLE'] },
        floorKcal: { FEMALE: 1400 },
        maxWeeklyLossShare: 0.007,
      },
    });
    expect(rules).toMatchObject({
      floorKcal: { FEMALE: 1400, MALE: 1500 },
      maxWeeklyLossShare: 0.007,
      minBmiToLose: 18.5,
      paces: { lose: ['GENTLE', 'MODERATE'], gain: ['GENTLE'] },
      version: 'clinic-3',
    });
  });

  it('refuses a stored rule looser than the platform rather than falling back', () => {
    expect(() =>
      effectiveGoalRules({ version: 1, rules: { floorKcal: { FEMALE: 1000 } } }),
    ).toThrow();
    expect(() => effectiveGoalRules({ version: 1, rules: { maxWeeklyLossShare: 0.02 } })).toThrow();
  });
});
