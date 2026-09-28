import { describe, expect, it } from 'vitest';
import { generateInviteCode, normalizeInviteCode } from './invite-code.js';

describe('generateInviteCode', () => {
  it('produces XXXX-XXXX codes without look-alike characters', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateInviteCode();
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    }
  });

  it('does not repeat', () => {
    const codes = new Set(Array.from({ length: 1000 }, generateInviteCode));
    expect(codes.size).toBe(1000);
  });
});

describe('normalizeInviteCode', () => {
  it('ignores case and surrounding whitespace', () => {
    expect(normalizeInviteCode(' abcd-efgh ')).toBe('ABCD-EFGH');
  });
});
