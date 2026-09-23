import { describe, expect, it } from 'vitest';
import { hasPermission, Permission } from './permissions.js';
import { DevTokenVerifier } from './dev.js';

describe('permissions', () => {
  it('patients cannot manage other patients', () => {
    expect(hasPermission('PATIENT', Permission.PATIENTS_READ)).toBe(false);
    expect(hasPermission('PATIENT', Permission.PATIENTS_WRITE)).toBe(false);
  });
  it('platform admins do not implicitly get tenant data permissions', () => {
    expect(hasPermission('PLATFORM_ADMIN', Permission.PATIENTS_READ)).toBe(false);
  });
});

describe('DevTokenVerifier', () => {
  it('round-trips and rejects tampered tokens', async () => {
    const v = new DevTokenVerifier('secret');
    const t = await v.issue('sub-1', 'a@b.c');
    expect((await v.verify(t)).subject).toBe('sub-1');
    await expect(new DevTokenVerifier('other').verify(t)).rejects.toThrow();
  });
});
