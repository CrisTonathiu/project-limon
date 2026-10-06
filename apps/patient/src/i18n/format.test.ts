import { describe, expect, it } from 'vitest';
import {
  compareText, formatDate, formatDayHeading, formatDayRange, formatKcal, formatKg, formatLiters, formatNumber, formatPercent, formatSigned, parseDateOnly, plural, toDateOnly,
} from './format';

describe('es-MX formatting', () => {
  it('formats numbers with Mexican separators', () => {
    expect(formatNumber(1234.5)).toBe('1,235');
    expect(formatNumber(1234.56, 1)).toBe('1,234.6');
    expect(formatKcal(1850)).toBe('1,850 kcal');
    expect(formatKg(72)).toBe('72 kg');
    expect(formatKg(72.46)).toBe('72.5 kg');
    expect(formatPercent(0.235)).toBe('23.5 %');
    expect(formatSigned(-4.2, 1)).toBe('−4.2');
    expect(formatSigned(1.5, 1)).toBe('+1.5');
    expect(formatSigned(0)).toBe('0');
    expect(formatLiters(1500)).toBe('1.5 L');
    expect(formatLiters(2000)).toBe('2 L');
  });

  it('pluralizes in Spanish', () => {
    expect(plural(1, 'porción', 'porciones')).toBe('1 porción');
    expect(plural(0, 'porción', 'porciones')).toBe('0 porciones');
    expect(plural(1.5, 'porción', 'porciones')).toBe('2 porciones');
  });

  it('keeps date-only strings on the same calendar day', () => {
    const d = parseDateOnly('2026-10-05');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 5]);
    expect(toDateOnly(d)).toBe('2026-10-05');
    expect(formatDate('2026-10-05')).toBe('lunes, 5 de octubre');
    expect(formatDayHeading(d)).toBe('Lunes 5 de octubre');
    expect(formatDayRange('2026-10-05', '2026-10-11')).toBe('5 al 11 de octubre');
    expect(formatDayRange('2026-09-28', '2026-10-04')).toBe('28 de septiembre al 4 de octubre');
    expect(formatDate('2026-10-05', 'full')).toBe('5 de octubre de 2026');
    expect(() => parseDateOnly('octubre')).toThrow();
  });

  it('sorts Spanish text', () => {
    expect(['nuez', 'ñame', 'árbol', 'zanahoria'].sort(compareText)).toEqual(['árbol', 'nuez', 'ñame', 'zanahoria']);
  });
});
