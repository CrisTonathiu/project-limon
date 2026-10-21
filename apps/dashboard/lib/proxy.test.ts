import { describe, expect, it } from 'vitest';
import { apiUrl, isAllowedOrigin } from './proxy';

describe('apiUrl', () => {
  it('maps the path under /api/v1 and keeps the query', () => {
    expect(apiUrl('https://api.test/', ['patients', 'p-1'], '?page=2')).toBe('https://api.test/api/v1/patients/p-1?page=2');
  });

  it('re-encodes each segment, so a decoded slash or query stays inside its segment', () => {
    expect(apiUrl('https://api.test', ['patients', 'a/b?x=1'], '')).toBe('https://api.test/api/v1/patients/a%2Fb%3Fx%3D1');
  });

  it('refuses dot segments and empty paths', () => {
    expect(apiUrl('https://api.test', ['..', 'health'], '')).toBeNull();
    expect(apiUrl('https://api.test', ['patients', '.'], '')).toBeNull();
    expect(apiUrl('https://api.test', [], '')).toBeNull();
  });
});

describe('isAllowedOrigin', () => {
  const self = 'https://dashboard.test';

  it('allows reads from anywhere (the SameSite=Strict cookie stays home)', () => {
    expect(isAllowedOrigin('GET', null, self)).toBe(true);
    expect(isAllowedOrigin('GET', 'https://evil.test', self)).toBe(true);
  });

  it('requires our own Origin on writes', () => {
    expect(isAllowedOrigin('POST', self, self)).toBe(true);
    expect(isAllowedOrigin('DELETE', 'https://evil.test', self)).toBe(false);
    expect(isAllowedOrigin('PUT', null, self)).toBe(false);
  });
});
