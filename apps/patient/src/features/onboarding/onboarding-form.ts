import { BiologicalSex, type ActivityLevel, type Allergen, type PatientProfileDto } from '@limon/types';
import { PATIENT_PROFILE_LIMITS as L, type PatientProfileInput } from '@limon/validation';
import { toDateOnly } from '../../i18n/format';

/**
 * The onboarding questionnaire as the patient fills it in: text fields stay strings until
 * submit, so a half-typed "68," isn't lost. Each step is checked before moving on; the
 * API validates the whole thing again with PatientProfileSchema.
 */
export const ONBOARDING_STEPS = ['aboutYou', 'body', 'activity', 'meals', 'allergies', 'dislikes'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export type OnboardingDraft = {
  sex: BiologicalSex | null;
  pregnantOrBreastfeeding: boolean;
  birthDay: string;
  birthMonth: string;
  birthYear: string;
  heightCm: string;
  weightKg: string;
  activityLevel: ActivityLevel | null;
  mealsPerDay: number | null;
  allergies: Allergen[];
  dislikedFoods: string[];
};

export const emptyDraft: OnboardingDraft = {
  sex: null, pregnantOrBreastfeeding: false, birthDay: '', birthMonth: '', birthYear: '',
  heightCm: '', weightKg: '', activityLevel: null, mealsPerDay: null, allergies: [], dislikedFoods: [],
};

/** A saved profile as an editable draft (the profile screen's edit form). */
export function draftFromProfile(profile: PatientProfileDto): OnboardingDraft {
  const [year = '', month = '', day = ''] = profile.dateOfBirth.split('-');
  return {
    sex: profile.sex,
    pregnantOrBreastfeeding: profile.pregnantOrBreastfeeding,
    // "05" → "5": what the patient would have typed.
    birthDay: String(Number(day)),
    birthMonth: String(Number(month)),
    birthYear: year,
    heightCm: String(profile.heightCm),
    weightKg: String(profile.weightKg),
    activityLevel: profile.activityLevel,
    mealsPerDay: profile.mealsPerDay,
    allergies: profile.allergies,
    dislikedFoods: profile.dislikedFoods,
  };
}

export type DraftField = 'sex' | 'dateOfBirth' | 'heightCm' | 'weightKg' | 'activityLevel' | 'mealsPerDay';
export type FieldError = 'required' | 'invalidDate' | 'futureDate' | 'outOfRange';
export type StepErrors = Partial<Record<DraftField, FieldError>>;

/** "68,5" and "68.5" both mean 68.5 (phones in Mexico offer either separator). */
export function parseDecimal(text: string): number | null {
  const s = text.trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

/** Day, month and year fields → "1990-05-20", or null when that day doesn't exist (31/02). */
export function birthDateFrom(day: string, month: string, year: string): string | null {
  if (![day, month, year].every((s) => /^\d+$/.test(s.trim())) || year.trim().length !== 4) return null;
  const [d, m, y] = [day, month, year].map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return toDateOnly(date);
}

const isBlank = (...fields: string[]) => fields.every((f) => f.trim() === '');

function rangeError(text: string, { min, max }: { min: number; max: number }): FieldError | undefined {
  if (isBlank(text)) return 'required';
  const n = parseDecimal(text);
  return n === null || n < min || n > max ? 'outOfRange' : undefined;
}

export function stepErrors(step: OnboardingStep, draft: OnboardingDraft, today = new Date()): StepErrors {
  const errors: StepErrors = {};
  switch (step) {
    case 'aboutYou': {
      if (!draft.sex) errors.sex = 'required';
      const dob = birthDateFrom(draft.birthDay, draft.birthMonth, draft.birthYear);
      if (isBlank(draft.birthDay, draft.birthMonth, draft.birthYear)) errors.dateOfBirth = 'required';
      else if (!dob || dob < L.minBirthDate) errors.dateOfBirth = 'invalidDate';
      else if (dob > toDateOnly(today)) errors.dateOfBirth = 'futureDate';
      break;
    }
    case 'body': {
      const height = rangeError(draft.heightCm, L.heightCm);
      const weight = rangeError(draft.weightKg, L.weightKg);
      if (height) errors.heightCm = height;
      if (weight) errors.weightKg = weight;
      break;
    }
    case 'activity':
      if (!draft.activityLevel) errors.activityLevel = 'required';
      break;
    case 'meals':
      if (draft.mealsPerDay === null) errors.mealsPerDay = 'required';
      break;
    // Allergies and disliked foods are optional.
  }
  return errors;
}

/** Every step's errors at once, for the edit form that shows all fields together. */
export function formErrors(draft: OnboardingDraft, today = new Date()): StepErrors {
  return Object.assign({}, ...ONBOARDING_STEPS.map((step) => stepErrors(step, draft, today))) as StepErrors;
}

export const hasErrors = (errors: StepErrors) => Object.keys(errors).length > 0;

/** Adds a disliked food unless it's blank, already listed (any casing) or the list is full. */
export function addDislikedFood(list: string[], text: string): string[] {
  const food = text.trim().slice(0, L.dislikedFoods.maxLength);
  if (!food || list.length >= L.dislikedFoods.maxItems) return list;
  if (list.some((f) => f.toLowerCase() === food.toLowerCase())) return list;
  return [...list, food];
}

/** The PUT body, or null while any step still has errors. */
export function toProfileInput(draft: OnboardingDraft, today = new Date()): PatientProfileInput | null {
  if (ONBOARDING_STEPS.some((step) => hasErrors(stepErrors(step, draft, today)))) return null;
  const dateOfBirth = birthDateFrom(draft.birthDay, draft.birthMonth, draft.birthYear);
  const heightCm = parseDecimal(draft.heightCm);
  const weightKg = parseDecimal(draft.weightKg);
  const { sex, activityLevel, mealsPerDay } = draft;
  if (!sex || !activityLevel || mealsPerDay === null || !dateOfBirth || heightCm === null || weightKg === null) return null;
  return {
    sex,
    dateOfBirth,
    heightCm: Math.round(heightCm),
    weightKg,
    activityLevel,
    mealsPerDay,
    // The answer is kept while toggling sex, but only sent for FEMALE (the API rejects it otherwise).
    pregnantOrBreastfeeding: sex === BiologicalSex.FEMALE && draft.pregnantOrBreastfeeding,
    allergies: draft.allergies,
    dislikedFoods: draft.dislikedFoods,
  };
}
