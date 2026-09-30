import { describe, expect, it } from 'vitest';
import { effectiveFeatures } from '../src/features.js';

describe('effectiveFeatures', () => {
  it('keeps enabled known keys', () => {
    expect(effectiveFeatures(['recipes', 'water_tracker'])).toEqual(['recipes', 'water_tracker']);
  });

  it('drops keys this build does not know', () => {
    expect(effectiveFeatures(['recipes', 'teleport'])).toEqual(['recipes']);
  });

  it('turns off a feature whose dependency is off', () => {
    expect(effectiveFeatures(['shopping_list'])).toEqual([]);
    expect(effectiveFeatures(['shopping_list', 'meal_plan'])).toEqual(['meal_plan', 'shopping_list']);
  });
});
