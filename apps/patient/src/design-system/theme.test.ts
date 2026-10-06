import { mixHex, PLATFORM_DEFAULT_PRIMARY } from '@limon/ui';
import { describe, expect, it } from 'vitest';
import { buildTheme } from './theme';

describe('mixHex', () => {
  it('returns the base at 0 and the color at 1', () => {
    expect(mixHex('#3173BD', '#FFFFFF', 0)).toBe('#FFFFFF');
    expect(mixHex('#3173BD', '#FFFFFF', 1)).toBe('#3173BD');
  });

  it('blends each channel', () => {
    expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });
});

describe('buildTheme', () => {
  it('falls back to the platform primary', () => {
    expect(buildTheme().colors.primary).toBe(PLATFORM_DEFAULT_PRIMARY);
  });

  it('derives the tint and the on-color from the tenant primary', () => {
    const { colors } = buildTheme('#3173BD');
    expect(colors.primaryTint).toBe(mixHex('#3173BD', '#FFFFFF', 0.16));
    expect(colors.onPrimary).toBe('#FFFFFF');
    expect(buildTheme('#F6D54A').colors.onPrimary).toBe('#000000');
  });

  it('only uses color keys that exist in the palette', () => {
    const theme = buildTheme('#3173BD');
    const used = [
      ...Object.values(theme.textVariants).map((v) => v.color),
      ...Object.values(theme.cardVariants).map((v) => v.backgroundColor),
    ];
    for (const key of used) expect(theme.colors).toHaveProperty(key);
  });
});
