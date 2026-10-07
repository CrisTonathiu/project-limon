import { describe, expect, it } from 'vitest';
import { emptyMeasurementForm, fieldError, measurementsInput, measurementsValid, parseDecimal, stepWeight } from './body-log-form';

describe('parseDecimal', () => {
  it('takes a comma or a dot', () => {
    expect(parseDecimal(' 73,8 ')).toBe(73.8);
    expect(parseDecimal('73.8')).toBe(73.8);
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('7a')).toBeNaN();
  });
});

describe('fieldError', () => {
  it('requires the weight but not the measurements', () => {
    expect(fieldError('weightKg', '')).toBe('Escribe tu peso.');
    expect(fieldError('waistCm', '')).toBeNull();
  });

  it('checks the limits the API uses', () => {
    expect(fieldError('weightKg', '20')).toBe('Debe estar entre 25 y 350.');
    expect(fieldError('bodyFatPct', '80')).toBe('Debe estar entre 2 y 75.');
    expect(fieldError('armCm', '31,5')).toBeNull();
  });
});

describe('stepWeight', () => {
  it('moves by 0.1 kg from what is typed, or from the current weight', () => {
    expect(stepWeight('73.8', 0.1, 70)).toBe('73.9');
    expect(stepWeight('', -0.1, 70)).toBe('69.9');
    expect(stepWeight('25', -0.1, 70)).toBe('25');
  });
});

describe('measurements', () => {
  it('sends only what was filled in, once something is and all of it is valid', () => {
    const form = { ...emptyMeasurementForm, waistCm: '82,5', bodyFatPct: '29' };
    expect(measurementsValid(form)).toBe(true);
    expect(measurementsInput(form)).toEqual({ waistCm: 82.5, bodyFatPct: 29 });
    expect(measurementsValid(emptyMeasurementForm)).toBe(false);
    expect(measurementsValid({ ...form, hipCm: '5' })).toBe(false);
  });
});
