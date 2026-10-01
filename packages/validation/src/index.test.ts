import { describe, expect, it } from 'vitest';
import { ageInYears, CreatePatientSchema, PatientProfileSchema, RegisterNutritionistSchema } from './index.js';

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
    expect(r).toMatchObject({ weightKg: 68.4, pregnantOrBreastfeeding: false, allergies: [], dislikedFoods: [] });
  });

  it('de-duplicates allergies and disliked foods', () => {
    const r = PatientProfileSchema.parse({ ...valid, allergies: ['milk', 'milk'], dislikedFoods: ['Hígado', ' hígado ', 'Brócoli'] });
    expect(r.allergies).toEqual(['milk']);
    expect(r.dislikedFoods).toEqual(['Hígado', 'Brócoli']);
  });

  it.each([
    ['unknown allergen', { allergies: ['chocolate'] }],
    ['meals per day out of range', { mealsPerDay: 6 }],
    ['height in meters', { heightCm: 1.62 }],
    ['future birth date', { dateOfBirth: '2999-01-01' }],
    ['pregnancy with sex MALE', { sex: 'MALE', pregnantOrBreastfeeding: true }],
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
