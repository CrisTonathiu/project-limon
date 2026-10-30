import type { PatientProfileDto } from '@limon/types';
import { describe, expect, it } from 'vitest';
import { onboardingSummary } from './onboarding-summary';

const profile: PatientProfileDto = {
  sex: 'FEMALE', dateOfBirth: '1990-05-20', heightCm: 162, weightKg: 68.4, activityLevel: 'LIGHT',
  mealsPerDay: 4, mealTimes: ['07:30', '14:00', '17:00', '20:30'], pregnantOrBreastfeeding: false,
  allergies: [], dislikedFoods: [], updatedAt: '2026-10-29T00:00:00.000Z',
  energyTarget: { status: 'READY', bmrKcal: 1410, maintenanceKcal: 1850, targetKcal: 1850, proteinG: 110, carbsG: 210, fatG: 60 },
};

describe('onboardingSummary', () => {
  it('names each meal time by its slot', () => {
    expect(onboardingSummary(profile).times).toEqual([
      { meal: 'Desayuno', time: '7:30' },
      { meal: 'Comida', time: '14:00' },
      { meal: 'Colación', time: '17:00' },
      { meal: 'Cena', time: '20:30' },
    ]);
  });

  it('gives the daily target, or why the nutritionist sets it', () => {
    expect(onboardingSummary(profile).target).toMatchObject({ kcal: '1,850 kcal' });
    const held = onboardingSummary({ ...profile, energyTarget: { status: 'CONSULT_NUTRITIONIST', reason: 'PREGNANT_OR_BREASTFEEDING' } });
    expect(held.target).toEqual({ hold: 'Durante el embarazo o la lactancia, tu nutriólogo definirá tu meta diaria.' });
  });
});
