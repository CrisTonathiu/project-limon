import { describe, expect, it } from 'vitest';
import { ENTITLED_PERMISSIONS, hasPermission, Permission, WRITE_PERMISSIONS } from './permissions.js';
import { DevTokenVerifier } from './dev.js';

describe('permissions', () => {
  it('patients cannot manage other patients', () => {
    expect(hasPermission('PATIENT', Permission.PATIENTS_READ)).toBe(false);
    expect(hasPermission('PATIENT', Permission.PATIENTS_WRITE)).toBe(false);
  });
  it('patients edit their own profile, even before paying, but not while the tenant is suspended', () => {
    expect(hasPermission('PATIENT', Permission.SELF_PATIENT_WRITE)).toBe(true);
    expect(ENTITLED_PERMISSIONS.has(Permission.SELF_PATIENT_WRITE)).toBe(false);
    expect(WRITE_PERMISSIONS.has(Permission.SELF_PATIENT_WRITE)).toBe(true);
  });
  it('patients log their weigh-ins and water only with a subscription, and not while the tenant is suspended', () => {
    expect(hasPermission('PATIENT', Permission.SELF_PROGRESS_WRITE)).toBe(true);
    expect(ENTITLED_PERMISSIONS.has(Permission.SELF_PROGRESS_READ)).toBe(true);
    expect(ENTITLED_PERMISSIONS.has(Permission.SELF_PROGRESS_WRITE)).toBe(true);
    expect(WRITE_PERMISSIONS.has(Permission.SELF_PROGRESS_WRITE)).toBe(true);
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
