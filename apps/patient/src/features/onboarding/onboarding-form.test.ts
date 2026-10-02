import type { PatientProfileDto } from '@limon/types';
import { PatientProfileSchema } from '@limon/validation';
import { describe, expect, it } from 'vitest';
import {
  addDislikedFood, birthDateFrom, draftFromProfile, emptyDraft, formErrors, parseDecimal, searchFoods, stepErrors,
  toProfileInput, type OnboardingDraft,
} from './onboarding-form';

const today = new Date(2026, 9, 1); // Oct 1, 2026
const food = (n: number, name: string) => ({ id: `0000000${n}-0000-4000-8000-000000000000`, name });
const higado = food(1, 'Hígado de res');
const complete: OnboardingDraft = {
  ...emptyDraft,
  sex: 'FEMALE', birthDay: '20', birthMonth: '5', birthYear: '1990',
  heightCm: '162', weightKg: '68,4', activityLevel: 'LIGHT', mealsPerDay: 4,
  allergies: ['milk'], dislikedFoods: [higado],
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
  it('skips a food already picked', () => {
    const list = addDislikedFood(addDislikedFood([], higado), { ...higado });
    expect(list).toEqual([higado]);
  });
  it('stops at the maximum', () => {
    const full = Array.from({ length: 30 }, (_, i) => food(i, `Comida ${i}`));
    expect(addDislikedFood(full, food(99, 'Brócoli'))).toBe(full);
  });
});

describe('searchFoods', () => {
  // Sorted by name, as GET /foods/catalog returns it.
  const catalog = [food(2, 'Aceite de oliva'), food(3, 'Frijol negro'), higado, food(4, 'Hígado de pollo'), food(5, 'Piña'), food(6, 'Pollo, pechuga')];

  it('ignores case and accents, ñ included', () => {
    expect(searchFoods(catalog, 'HIGADO', []).map((f) => f.name)).toEqual(['Hígado de res', 'Hígado de pollo']);
    expect(searchFoods(catalog, 'pina', [])).toEqual([food(5, 'Piña')]);
  });

  it('needs every word, in any order, and lists names that start with the query first', () => {
    expect(searchFoods(catalog, 'pollo', []).map((f) => f.name)).toEqual(['Pollo, pechuga', 'Hígado de pollo']);
    expect(searchFoods(catalog, 'pollo higado', []).map((f) => f.name)).toEqual(['Hígado de pollo']);
  });

  it('leaves out foods already picked, and finds nothing for a blank query', () => {
    expect(searchFoods(catalog, 'hígado', [higado]).map((f) => f.name)).toEqual(['Hígado de pollo']);
    expect(searchFoods(catalog, '   ', [])).toEqual([]);
  });

  it('stops at the limit', () => {
    expect(searchFoods(catalog, 'o', [], 2)).toHaveLength(2);
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
      mealsPerDay: 4, pregnantOrBreastfeeding: false, allergies: ['milk'], dislikedFoodIds: [higado.id],
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
    const answers = {
      sex: 'FEMALE', dateOfBirth: '1990-05-20', heightCm: 162, weightKg: 68.4, activityLevel: 'LIGHT',
      mealsPerDay: 4, pregnantOrBreastfeeding: false,
    } as const;
    const saved: PatientProfileDto = {
      ...answers, allergies: ['milk'], dislikedFoods: [higado],
      energyTarget: { status: 'CONSULT_NUTRITIONIST', reason: 'MINOR' }, updatedAt: '2026-10-01T00:00:00.000Z',
    };
    const draft = draftFromProfile(saved);
    expect(draft).toMatchObject({ birthDay: '20', birthMonth: '5', birthYear: '1990', weightKg: '68.4', dislikedFoods: [higado] });
    expect(toProfileInput(draft, today)).toEqual({ ...answers, allergies: ['milk'], dislikedFoodIds: [higado.id] });
  });
});
