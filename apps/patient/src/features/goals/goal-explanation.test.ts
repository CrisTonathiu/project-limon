import type { EnergyTargetDto, PatientGoalDto } from '@limon/types';
import { describe, expect, it } from 'vitest';
import { explainGoal } from './goal-explanation';

const target: EnergyTargetDto = {
  status: 'READY',
  bmrKcal: 1410,
  maintenanceKcal: 1940,
  targetKcal: 1740,
  proteinG: 115,
  carbsG: 200,
  fatG: 58,
};
const goal: PatientGoalDto = {
  intention: 'LOSE_WEIGHT',
  pace: 'GENTLE',
  desiredChangeKg: 10,
  otherText: null,
  recentWeightChange: 'STABLE',
  decision: { goal: 'LOSE', pace: 'GENTLE', reason: 'AS_CHOSEN' },
  rulesVersion: 'platform-1',
  decidedAt: '2026-10-06T18:00:00.000Z',
};

describe('explainGoal', () => {
  it('says what they asked for and where they start', () => {
    expect(explainGoal(goal, target)).toEqual([
      'Te gustaría bajar 10 kg. Con tu perfil empezaremos con una meta gradual para bajar de peso: 1,740 kcal al día.',
      'Tu plan de comidas se ajustará a partir de la próxima semana.',
    ]);
  });

  it('explains why a risky request starts at maintenance', () => {
    const held = {
      ...goal,
      decision: { goal: 'MAINTAIN' as const, pace: null, reason: 'RECENT_WEIGHT_LOSS' as const },
    };
    expect(explainGoal(held, { ...target, targetKcal: 1940 })[0]).toContain(
      'Como bajaste de peso hace poco',
    );
  });

  it("puts the profile's own hold first", () => {
    expect(explainGoal(goal, { status: 'CONSULT_NUTRITIONIST', reason: 'MINOR' })).toEqual([
      'Por ser menor de edad, tu nutriólogo definirá tu meta diaria.',
    ]);
  });
});
