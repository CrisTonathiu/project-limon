import { describe, expect, it } from 'vitest';
import { formatAmount, formatMinutes, formatQuantity } from './recipe-format';

describe('formatQuantity', () => {
  it.each([
    [2, '2'],
    [0.5, '½'],
    [0.25, '¼'],
    [1.5, '1 ½'],
    [1 / 3, '⅓'],
    [2.75, '2 ¾'],
    [0.15, '0.15'],
    [1250, '1,250'],
  ])('%s → %s', (quantity, text) => {
    expect(formatQuantity(quantity)).toBe(text);
  });
});

describe('formatAmount', () => {
  it.each([
    [1, 'PIECE', '1 pieza'],
    [0.5, 'PIECE', '½ pieza'],
    [4, 'PIECE', '4 piezas'],
    [1.5, 'CUP', '1 ½ tazas'],
    [2, 'TBSP', '2 cdas.'],
    [1, 'TSP', '1 cdita.'],
    [100, 'G', '100 g'],
    [250, 'ML', '250 ml'],
  ] as const)('%s %s → %s', (quantity, unit, text) => {
    expect(formatAmount(quantity, unit)).toBe(text);
  });
});

describe('formatMinutes', () => {
  it.each([
    [15, '15 min'],
    [60, '1 h'],
    [90, '1 h 30 min'],
  ])('%s → %s', (minutes, text) => {
    expect(formatMinutes(minutes)).toBe(text);
  });
});
