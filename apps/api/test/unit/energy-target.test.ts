import { describe, expect, it } from 'vitest';
import {
  ENERGY_GUARDRAILS,
  energyTarget,
  type EnergyInput,
} from '../../src/modules/patients/energy-target.js';

const today = new Date('2026-10-01T12:00:00');
/** 30-year-old man, 75 kg, 178 cm: BMR 1,717.5, maintenance 1,717.5 × 1.55 = 2,662.1. */
const man: EnergyInput = {
  sex: 'MALE',
  dateOfBirth: '1996-01-15',
  heightCm: 178,
  weightKg: 75,
  activityLevel: 'MODERATE',
  pregnantOrBreastfeeding: false,
};
const woman: EnergyInput = {
  ...man,
  sex: 'FEMALE',
  dateOfBirth: '1986-03-10',
  heightCm: 155,
  weightKg: 50,
  activityLevel: 'LIGHT',
};

describe('energyTarget', () => {
  it('maintains by default: target = maintenance, macros add up to it', () => {
    const t = energyTarget(man, undefined, today);
    expect(t).toEqual({
      status: 'READY',
      bmrKcal: 1720,
      maintenanceKcal: 2660,
      targetKcal: 2660,
      proteinG: 100,
      carbsG: 365,
      fatG: 89,
    });
    if (t.status !== 'READY') throw new Error();
    expect(Math.abs(t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9 - t.targetKcal)).toBeLessThanOrEqual(
      2,
    );
  });

  it('adds the surplus for weight gain, +20% at most (bulk)', () => {
    expect(energyTarget(man, { type: 'GAIN', pace: 'GENTLE' }, today)).toMatchObject({
      targetKcal: 2930,
    });
    expect(energyTarget(man, { type: 'GAIN', pace: 'FAST' }, today)).toMatchObject({
      targetKcal: 3190,
    });
  });

  it('removes the deficit for weight loss', () => {
    // 25% of 2,662 = 666 kcal, under the 825 kcal/day that 1% of 75 kg per week allows.
    expect(energyTarget(man, { type: 'LOSE', pace: 'FAST' }, today)).toMatchObject({
      targetKcal: 2000,
    });
  });

  it('caps the deficit at 1% of body weight per week', () => {
    // Maintenance 2,461: 25% would be 615 kcal, but 1% of 55 kg per week is 605 kcal/day.
    const active = {
      ...woman,
      dateOfBirth: '2001-01-01',
      heightCm: 165,
      weightKg: 55,
      activityLevel: 'VERY_ACTIVE' as const,
    };
    expect(energyTarget(active, { type: 'LOSE', pace: 'FAST' }, today)).toMatchObject({
      targetKcal: 1860,
    });
  });

  it('never goes below the floor for the patient sex', () => {
    // Maintenance 1,523: a 25% deficit would be 1,142 kcal.
    expect(energyTarget(woman, { type: 'LOSE', pace: 'FAST' }, today)).toMatchObject({
      targetKcal: 1200,
    });
  });

  it('keeps protein within 30% of the kcal for heavy patients', () => {
    // 1.6 g/kg × 120 kg = 192 g, more than 30% of 2,010 kcal.
    const heavy = {
      ...man,
      dateOfBirth: '1986-01-01',
      heightCm: 175,
      weightKg: 120,
      activityLevel: 'SEDENTARY' as const,
    };
    expect(energyTarget(heavy, { type: 'LOSE', pace: 'MODERATE' }, today)).toMatchObject({
      targetKcal: 2010,
      proteinG: 151,
    });
  });

  it.each([
    ['under 18', { ...man, dateOfBirth: '2010-01-01' }, undefined, 'MINOR'],
    [
      'pregnant or breastfeeding',
      { ...woman, pregnantOrBreastfeeding: true },
      undefined,
      'PREGNANT_OR_BREASTFEEDING',
    ],
    [
      'underweight and losing',
      { ...man, heightCm: 170, weightKg: 48 },
      { type: 'LOSE', pace: 'GENTLE' } as const,
      'UNDERWEIGHT',
    ],
    // 70 years, 45 kg, sedentary: maintenance 1,052 kcal.
    [
      'maintenance below the floor',
      {
        ...woman,
        dateOfBirth: '1956-01-01',
        heightCm: 150,
        weightKg: 45,
        activityLevel: 'SEDENTARY' as const,
      },
      undefined,
      'BELOW_FLOOR',
    ],
  ])('sends the patient to their nutritionist when %s', (_, input, goal, reason) => {
    expect(energyTarget(input, goal, today)).toEqual({ status: 'CONSULT_NUTRITIONIST', reason });
  });

  it('lets an underweight patient maintain or gain', () => {
    expect(
      energyTarget(
        { ...man, heightCm: 170, weightKg: 48 },
        { type: 'GAIN', pace: 'GENTLE' },
        today,
      ),
    ).toMatchObject({ status: 'READY' });
  });

  it("applies a clinic's stricter guardrails", () => {
    const strict = {
      ...ENERGY_GUARDRAILS,
      floorKcal: { FEMALE: 1500, MALE: 1800 },
      maxWeeklyLossShare: 0.005,
    };
    // 0.5% of 75 kg per week is 413 kcal/day, less than the 25% (666 kcal) FAST would take.
    expect(energyTarget(man, { type: 'LOSE', pace: 'FAST' }, today, strict)).toMatchObject({
      targetKcal: 2250,
    });
  });
});
