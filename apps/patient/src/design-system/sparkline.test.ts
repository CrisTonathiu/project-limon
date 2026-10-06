import { describe, expect, it } from 'vitest';
import { sparklinePoints } from './sparkline';

describe('sparklinePoints', () => {
  it('spreads points across the width and puts the highest value at the top', () => {
    const points = sparklinePoints([78, 76, 73.8], 314, 90);
    expect(points.map((p) => p.x)).toEqual([7, 157, 307]);
    expect(points[0]!.y).toBe(7);
    expect(points[2]!.y).toBe(83);
  });

  it('keeps a flat series in the middle', () => {
    expect(sparklinePoints([70, 70, 70], 100, 90).every((p) => p.y === 45)).toBe(true);
  });
});
