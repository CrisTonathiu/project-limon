import { describe, expect, it } from 'vitest';
import {
  emptyGoalForm,
  goalSteps,
  parseDesiredKg,
  stepComplete,
  stepError,
  toGoalInput,
  type GoalForm,
} from './goal-form';

const lose: GoalForm = {
  ...emptyGoalForm,
  intention: 'LOSE_WEIGHT',
  pace: 'GENTLE',
  recentWeightChange: 'STABLE',
};

describe('goal form', () => {
  it('only asks for details to lose, gain or something else', () => {
    expect(goalSteps('LOSE_WEIGHT')).toEqual(['intention', 'details', 'screening']);
    expect(goalSteps('OTHER')).toEqual(['intention', 'details', 'screening']);
    expect(goalSteps('BUILD_MUSCLE')).toEqual(['intention', 'screening']);
    expect(goalSteps(null)).toEqual(['intention', 'screening']);
  });

  it('reads the desired kilos with a comma or a point, and leaves them optional', () => {
    expect(parseDesiredKg('7,5')).toBe(7.5);
    expect(parseDesiredKg(' 10 ')).toBe(10);
    expect(parseDesiredKg('')).toBeNull();
    expect(parseDesiredKg('diez')).toBeNaN();
    expect(stepError('details', { ...lose, desiredKg: '200' })).not.toBeNull();
    expect(stepComplete('details', { ...lose, desiredKg: '' })).toBe(true);
  });

  it('needs a pace to lose, and words for "other"', () => {
    expect(stepComplete('details', { ...lose, pace: null })).toBe(false);
    expect(stepComplete('details', { ...emptyGoalForm, intention: 'OTHER', otherText: '  ' })).toBe(
      false,
    );
  });

  it('builds the request with only the fields that intention takes', () => {
    expect(toGoalInput({ ...lose, desiredKg: '7,5', otherText: 'ignored' })).toEqual({
      intention: 'LOSE_WEIGHT',
      pace: 'GENTLE',
      desiredChangeKg: 7.5,
      recentWeightChange: 'STABLE',
    });
    expect(
      toGoalInput({
        ...emptyGoalForm,
        intention: 'BUILD_MUSCLE',
        pace: 'FAST',
        recentWeightChange: 'UNSURE',
      }),
    ).toEqual({
      intention: 'BUILD_MUSCLE',
      recentWeightChange: 'UNSURE',
    });
  });
});
