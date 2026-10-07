import type { WaterTodayDto } from '@limon/types';
import { describe, expect, it } from 'vitest';
import { isPendingIntake, parseIntakeMl, stepTarget, waterProgress, withIntake, withoutIntake } from './water';

const today: WaterTodayDto = {
  date: '2026-10-06',
  targetMl: 2400,
  defaultTargetMl: 2400,
  customTarget: false,
  totalMl: 500,
  intakes: [
    { id: 'b', amountMl: 250, createdAt: '2026-10-06T16:00:00Z' },
    { id: 'a', amountMl: 250, createdAt: '2026-10-06T14:00:00Z' },
  ],
};

describe('optimistic water', () => {
  it('adds a pending glass on top', () => {
    const next = withIntake(today, 500, new Date('2026-10-06T18:00:00Z'));
    expect(next.totalMl).toBe(1000);
    expect(next.intakes[0]).toMatchObject({ amountMl: 500 });
    expect(isPendingIntake(next.intakes[0]!.id)).toBe(true);
  });

  it('removes a glass, and ignores one it does not have', () => {
    expect(withoutIntake(today, 'b')).toMatchObject({ totalMl: 250, intakes: [{ id: 'a' }] });
    expect(withoutIntake(today, 'zzz')).toBe(today);
  });
});

describe('waterProgress', () => {
  it('stops at a full ring', () => {
    expect(waterProgress({ totalMl: 1200, targetMl: 2400 })).toBe(0.5);
    expect(waterProgress({ totalMl: 3000, targetMl: 2400 })).toBe(1);
  });
});

describe('parseIntakeMl', () => {
  it('takes whole millilitres within the limits', () => {
    expect(parseIntakeMl(' 330 ')).toBe(330);
    expect(parseIntakeMl('20')).toBeNull();
    expect(parseIntakeMl('2.5')).toBeNull();
  });
});

describe('stepTarget', () => {
  it('moves by 250 ml on the 50 ml grid, within the limits', () => {
    expect(stepTarget(2400, 250)).toBe(2650);
    expect(stepTarget(1100, -250)).toBe(1000);
    expect(stepTarget(5900, 250)).toBe(6000);
  });
});
