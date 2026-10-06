import { describe, expect, it } from 'vitest';
import { ageInYears, CreatePatientSchema, GoalRulesSchema, PatientProfileSchema, RegisterNutritionistSchema, SetGoalSchema } from './index.js';

describe('validation schemas', () => {
  it('rejects client-supplied tenantId (never trusted from clients)', () => {
    const r = CreatePatientSchema.safeParse({ firstName: 'A', lastName: 'B', tenantId: 'x' });
    expect(r.success).toBe(false);
  });

  it('rejects invalid slugs', () => {
    const r = RegisterNutritionistSchema.safeParse({
      email: 'm@x.com', firstName: 'M', lastName: 'N', businessName: 'Maria', slug: 'Maria Nutrition',
    });
    expect(r.success).toBe(false);
  });
});

describe('PatientProfileSchema', () => {
  const valid = {
    sex: 'FEMALE', dateOfBirth: '1990-05-20', heightCm: 162, weightKg: 68.44,
    activityLevel: 'LIGHT', mealsPerDay: 4,
  };

  it('accepts a complete questionnaire and fills defaults', () => {
    const r = PatientProfileSchema.parse(valid);
    expect(r).toMatchObject({ weightKg: 68.4, pregnantOrBreastfeeding: false, allergies: [], dislikedFoodIds: [] });
  });

  it('de-duplicates allergies and disliked foods', () => {
    const [higado, brocoli] = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
    const r = PatientProfileSchema.parse({ ...valid, allergies: ['milk', 'milk'], dislikedFoodIds: [higado, brocoli, higado] });
    expect(r.allergies).toEqual(['milk']);
    expect(r.dislikedFoodIds).toEqual([higado, brocoli]);
  });

  it.each([
    ['unknown allergen', { allergies: ['chocolate'] }],
    ['meals per day out of range', { mealsPerDay: 6 }],
    ['height in meters', { heightCm: 1.62 }],
    ['future birth date', { dateOfBirth: '2999-01-01' }],
    ['pregnancy with sex MALE', { sex: 'MALE', pregnantOrBreastfeeding: true }],
    ['disliked food as free text', { dislikedFoodIds: ['Hígado'] }],
    ['the old free-text field', { dislikedFoods: ['Hígado'] }],
    ['client-supplied patientId', { patientId: '11111111-1111-4111-8111-111111111111' }],
  ])('rejects %s', (_label, patch) => {
    expect(PatientProfileSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });

  it('accepts minors (the energy target applies that guardrail)', () => {
    expect(PatientProfileSchema.safeParse({ ...valid, dateOfBirth: '2015-01-01' }).success).toBe(true);
  });
});

describe('ageInYears', () => {
  const today = new Date(2026, 8, 30); // Sep 30, 2026
  it('counts whole years, turning over on the birthday', () => {
    expect(ageInYears('2008-09-30', today)).toBe(18);
    expect(ageInYears('2008-10-01', today)).toBe(17);
  });
});

describe('SetGoalSchema', () => {
  it('needs a pace to lose or gain, and refuses one otherwise', () => {
    expect(SetGoalSchema.safeParse({ intention: 'LOSE_WEIGHT', recentWeightChange: 'STABLE' }).success).toBe(false);
    expect(SetGoalSchema.safeParse({ intention: 'LOSE_WEIGHT', pace: 'GENTLE', desiredChangeKg: 10, recentWeightChange: 'STABLE' }).success).toBe(true);
    expect(SetGoalSchema.safeParse({ intention: 'MAINTAIN_WEIGHT', pace: 'GENTLE', recentWeightChange: 'STABLE' }).success).toBe(false);
    expect(SetGoalSchema.safeParse({ intention: 'NUTRITION_QUALITY', desiredChangeKg: 3, recentWeightChange: 'STABLE' }).success).toBe(false);
  });

  it('only takes free text for OTHER, and never a calorie number', () => {
    expect(SetGoalSchema.safeParse({ intention: 'OTHER', otherText: 'Dormir mejor', recentWeightChange: 'UNSURE' }).success).toBe(true);
    expect(SetGoalSchema.safeParse({ intention: 'BUILD_MUSCLE', otherText: 'x', recentWeightChange: 'STABLE' }).success).toBe(false);
    expect(SetGoalSchema.safeParse({ intention: 'LOSE_WEIGHT', pace: 'GENTLE', recentWeightChange: 'STABLE', targetKcal: 1200 }).success).toBe(false);
  });
});

describe('GoalRulesSchema', () => {
  it('accepts rules stricter than the platform', () => {
    expect(
      GoalRulesSchema.safeParse({ paces: { lose: ['GENTLE'], gain: ['GENTLE'] }, floorKcal: { FEMALE: 1400 }, maxWeeklyLossShare: 0.0075, minAge: 21 })
        .success,
    ).toBe(true);
  });

  it('refuses anything looser than the platform', () => {
    for (const looser of [{ floorKcal: { MALE: 1400 } }, { maxWeeklyLossShare: 0.015 }, { minBmiToLose: 17 }, { minAge: 16 }]) {
      expect(GoalRulesSchema.safeParse(looser).success).toBe(false);
    }
    expect(GoalRulesSchema.safeParse({ paces: { lose: [], gain: ['GENTLE'] } }).success).toBe(false);
  });
});
