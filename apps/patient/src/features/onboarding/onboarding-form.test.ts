import type { PatientProfileDto } from '@limon/types';
import { PatientProfileSchema } from '@limon/validation';
import { describe, expect, it } from 'vitest';
import {
  addDislikedFood, birthDateFrom, draftFromProfile, emptyDraft, formErrors, parseDecimal, stepErrors, toProfileInput,
  type OnboardingDraft,
} from './onboarding-form';

const today = new Date(2026, 9, 1); // Oct 1, 2026
const complete: OnboardingDraft = {
  ...emptyDraft,
  sex: 'FEMALE', birthDay: '20', birthMonth: '5', birthYear: '1990',
  heightCm: '162', weightKg: '68,4', activityLevel: 'LIGHT', mealsPerDay: 4,
  allergies: ['milk'], dislikedFoods: ['Hígado'],
};

describe('parseDecimal', () => {
  it('accepts a comma or a dot', () => {
    expect(parseDecimal('68,5')).toBe(68.5);
    expect(parseDecimal(' 68.5 ')).toBe(68.5);
    expect(parseDecimal('162')).toBe(162);
  });
  it.each(['', '68,', 'abc', '-5', '1.2.3'])('rejects %j', (text) => {
    expect(parseDecimal(text)).toBeNull();
  });
});

describe('birthDateFrom', () => {
  it('builds an ISO date from day, month and year', () => {
    expect(birthDateFrom('5', '1', '1990')).toBe('1990-01-05');
  });
  it.each([
    ['31', '2', '1990'],
    ['29', '2', '2025'],
    ['1', '13', '1990'],
    ['1', '1', '90'],
    ['', '1', '1990'],
  ])('rejects %s/%s/%s', (d, m, y) => {
    expect(birthDateFrom(d, m, y)).toBeNull();
  });
});

describe('stepErrors', () => {
  it('flags every required answer on an empty draft', () => {
    expect(stepErrors('aboutYou', emptyDraft, today)).toEqual({ sex: 'required', dateOfBirth: 'required' });
    expect(stepErrors('body', emptyDraft, today)).toEqual({ heightCm: 'required', weightKg: 'required' });
    expect(stepErrors('activity', emptyDraft, today)).toEqual({ activityLevel: 'required' });
    expect(stepErrors('meals', emptyDraft, today)).toEqual({ mealsPerDay: 'required' });
    expect(stepErrors('allergies', emptyDraft, today)).toEqual({});
    expect(stepErrors('dislikes', emptyDraft, today)).toEqual({});
  });

  it('rejects impossible, too old and future birth dates', () => {
    const dob = (birthDay: string, birthMonth: string, birthYear: string) =>
      stepErrors('aboutYou', { ...complete, birthDay, birthMonth, birthYear }, today).dateOfBirth;
    expect(dob('31', '4', '1990')).toBe('invalidDate');
    expect(dob('1', '1', '1899')).toBe('invalidDate');
    expect(dob('2', '10', '2026')).toBe('futureDate');
    expect(dob('1', '10', '2026')).toBeUndefined();
  });

  it('rejects height in meters and weights out of range', () => {
    expect(stepErrors('body', { ...complete, heightCm: '1.62', weightKg: '400' }, today)).toEqual({
      heightCm: 'outOfRange', weightKg: 'outOfRange',
    });
  });
});

describe('addDislikedFood', () => {
  it('trims and skips blanks and duplicates in any casing', () => {
    let list = addDislikedFood([], '  Hígado ');
    list = addDislikedFood(list, 'hígado');
    list = addDislikedFood(list, '   ');
    expect(list).toEqual(['Hígado']);
  });
  it('stops at the maximum', () => {
    const full = Array.from({ length: 30 }, (_, i) => `Comida ${i}`);
    expect(addDislikedFood(full, 'Brócoli')).toBe(full);
  });
});

describe('toProfileInput', () => {
  it('returns null while a step has errors', () => {
    expect(toProfileInput({ ...complete, mealsPerDay: null }, today)).toBeNull();
  });

  it('produces a body the API schema accepts', () => {
    const input = toProfileInput(complete, today);
    expect(input).toEqual({
      sex: 'FEMALE', dateOfBirth: '1990-05-20', heightCm: 162, weightKg: 68.4, activityLevel: 'LIGHT',
      mealsPerDay: 4, pregnantOrBreastfeeding: false, allergies: ['milk'], dislikedFoods: ['Hígado'],
    });
    expect(PatientProfileSchema.safeParse(input).success).toBe(true);
  });

  it('drops a pregnancy answer left over after switching to MALE', () => {
    const input = toProfileInput({ ...complete, sex: 'MALE', pregnantOrBreastfeeding: true }, today);
    expect(input?.pregnantOrBreastfeeding).toBe(false);
    expect(PatientProfileSchema.safeParse(input).success).toBe(true);
  });
});

describe('formErrors', () => {
  it('collects the errors of every step', () => {
    expect(formErrors({ ...complete, sex: null, weightKg: '', mealsPerDay: null }, today)).toEqual({
      sex: 'required', weightKg: 'required', mealsPerDay: 'required',
    });
    expect(formErrors(complete, today)).toEqual({});
  });
});

describe('draftFromProfile', () => {
  it('round-trips a saved profile back to the same PUT body', () => {
    const saved = {
      sex: 'FEMALE', dateOfBirth: '1990-05-20', heightCm: 162, weightKg: 68.4, activityLevel: 'LIGHT',
      mealsPerDay: 4, pregnantOrBreastfeeding: false, allergies: ['milk'], dislikedFoods: ['Hígado'],
    } as const satisfies Omit<PatientProfileDto, 'energyTarget' | 'updatedAt'>;
    const draft = draftFromProfile({
      ...saved, allergies: [...saved.allergies], dislikedFoods: [...saved.dislikedFoods],
      energyTarget: { status: 'CONSULT_NUTRITIONIST', reason: 'MINOR' }, updatedAt: '2026-10-01T00:00:00.000Z',
    });
    expect(draft).toMatchObject({ birthDay: '20', birthMonth: '5', birthYear: '1990', weightKg: '68.4' });
    expect(toProfileInput(draft, today)).toEqual(saved);
  });
});
