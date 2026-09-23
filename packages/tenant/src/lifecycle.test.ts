import { describe, expect, it } from 'vitest';
import { accessFor, canTransition } from './lifecycle.js';
import { tenantObjectKey } from './storage.js';
import { parseTenantUsername, tenantUsername } from './identity.js';

describe('tenant lifecycle', () => {
  it('cannot jump from ACTIVE straight to DELETED', () => {
    expect(canTransition('ACTIVE', 'DELETED')).toBe(false);
  });
  it('suspended tenants lock out patients but keep nutritionists read-only', () => {
    expect(accessFor('SUSPENDED', 'PATIENT')).toBe('NONE');
    expect(accessFor('SUSPENDED', 'NUTRITIONIST')).toBe('READ_ONLY');
  });
  it('deleted is terminal', () => {
    expect(canTransition('DELETED', 'ACTIVE')).toBe(false);
  });
});

describe('tenantObjectKey', () => {
  const t = '9f4f2c3e-1111-4222-8333-444455556666';
  it('builds tenant-scoped keys', () => {
    expect(tenantObjectKey(t, 'branding', 'logo.png')).toBe(`tenants/${t}/branding/logo.png`);
  });
  it('blocks path traversal', () => {
    expect(() => tenantObjectKey(t, 'patients', '..')).toThrow();
    expect(tenantObjectKey(t, 'patients', '../x')).toBe(`tenants/${t}/patients/.._x`);
  });
  it('rejects non-uuid tenant ids (e.g. slugs)', () => {
    expect(() => tenantObjectKey('maria-nutrition', 'branding', 'a')).toThrow();
  });
});

describe('tenantUsername', () => {
  const t = '9f4f2c3e-1111-4222-8333-444455556666';
  it('lets the same email exist in two tenants', () => {
    const other = '11111111-1111-4111-8111-111111111111';
    expect(tenantUsername(t, 'Ana@X.com ')).not.toBe(tenantUsername(other, 'ana@x.com'));
    expect(tenantUsername(t, 'Ana@X.com ')).toBe(`${t}#ana@x.com`);
  });
  it('round-trips', () => {
    expect(parseTenantUsername(tenantUsername(t, 'ana@x.com'))).toEqual({ tenantId: t, email: 'ana@x.com' });
  });
});
