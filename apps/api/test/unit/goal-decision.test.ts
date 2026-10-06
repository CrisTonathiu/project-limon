import type { SetGoalInput } from '@limon/validation';
import { describe, expect, it } from 'vitest';
import { decideGoal, paceAllowed } from '../../src/modules/patients/goal-decision.js';
import { effectiveGoalRules } from '../../src/modules/patients/goal-rules.js';

const rules = effectiveGoalRules(null);
/** 80 kg, 165 cm: BMI 29.4. */
const body = { weightKg: 80, heightCm: 165 };
const lose = (extra: Partial<SetGoalInput> = {}): SetGoalInput => ({
  intention: 'LOSE_WEIGHT',
  pace: 'GENTLE',
  recentWeightChange: 'STABLE',
  ...extra,
});

describe('decideGoal', () => {
  it('loses at the pace the patient picked', () => {
    expect(decideGoal(lose({ desiredChangeKg: 10 }), body, rules)).toEqual({
      goal: { type: 'LOSE', pace: 'GENTLE' },
      reason: 'AS_CHOSEN',
    });
  });

  it('maintains for maintain weight, nutrition quality and other', () => {
    for (const intention of ['MAINTAIN_WEIGHT', 'NUTRITION_QUALITY'] as const) {
      expect(decideGoal({ intention, recentWeightChange: 'STABLE' }, body, rules)).toEqual({
        goal: { type: 'MAINTAIN' },
        reason: 'MAINTAIN',
      });
    }
    expect(
      decideGoal(
        { intention: 'OTHER', otherText: 'Dormir mejor', recentWeightChange: 'UNSURE' },
        body,
        rules,
      ),
    ).toEqual({
      goal: { type: 'MAINTAIN' },
      reason: 'OTHER',
    });
  });

  it('builds muscle with a lean gain', () => {
    expect(
      decideGoal({ intention: 'BUILD_MUSCLE', recentWeightChange: 'STABLE' }, body, rules),
    ).toEqual({
      goal: { type: 'GAIN', pace: 'GENTLE' },
      reason: 'LEAN_GAIN',
    });
  });

  it('starts at maintenance after a big recent loss', () => {
    expect(decideGoal(lose({ recentWeightChange: 'LOST' }), body, rules)).toEqual({
      goal: { type: 'MAINTAIN' },
      reason: 'RECENT_WEIGHT_LOSS',
    });
  });

  it('starts at maintenance when the desired weight is under a healthy BMI', () => {
    // 80 − 32 = 48 kg at 165 cm is BMI 17.6.
    expect(decideGoal(lose({ desiredChangeKg: 32 }), body, rules)).toEqual({
      goal: { type: 'MAINTAIN' },
      reason: 'DESIRED_WEIGHT_TOO_LOW',
    });
    // 80 − 28 = 52 kg is BMI 19.1: fine.
    expect(decideGoal(lose({ desiredChangeKg: 28 }), body, rules).reason).toBe('AS_CHOSEN');
  });

  it("uses the clinic's healthy-BMI limit for the desired weight", () => {
    const strict = effectiveGoalRules({ version: 1, rules: { minBmiToLose: 20 } });
    expect(decideGoal(lose({ desiredChangeKg: 28 }), body, strict).reason).toBe(
      'DESIRED_WEIGHT_TOO_LOW',
    );
  });
});

describe('paceAllowed', () => {
  it('only accepts paces the clinic offers for that direction', () => {
    expect(paceAllowed(lose({ pace: 'MODERATE' }), rules)).toBe(true);
    expect(paceAllowed(lose({ pace: 'FAST' }), rules)).toBe(false);
    const fast = effectiveGoalRules({
      version: 1,
      rules: { paces: { lose: ['GENTLE', 'FAST'], gain: ['GENTLE'] } },
    });
    expect(paceAllowed(lose({ pace: 'FAST' }), fast)).toBe(true);
    expect(
      paceAllowed(
        { intention: 'GAIN_WEIGHT', pace: 'MODERATE', recentWeightChange: 'STABLE' },
        fast,
      ),
    ).toBe(false);
  });
});
