import { describe, expect, it } from 'vitest';
import { defaultTargetMl, history } from '../../src/modules/water/water.js';

describe('defaultTargetMl', () => {
  it('is 35 ml per kg, in steps of 50 ml', () => {
    expect(defaultTargetMl(68.4)).toBe(2400); // 2,394 ml
    expect(defaultTargetMl(80)).toBe(2800);
  });

  it('stays within the bounds of a custom target', () => {
    expect(defaultTargetMl(25)).toBe(1000);
    expect(defaultTargetMl(250)).toBe(6000);
  });
});

describe('history', () => {
  it('lists the last days oldest first, with 0 for days without water, across a month end', () => {
    expect(history('2026-10-02', 4, new Map([['2026-09-30', 1500], ['2026-10-02', 250]]))).toEqual([
      { date: '2026-09-29', totalMl: 0 },
      { date: '2026-09-30', totalMl: 1500 },
      { date: '2026-10-01', totalMl: 0 },
      { date: '2026-10-02', totalMl: 250 },
    ]);
  });
});
