import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { identityTenantDisplayName } from './identity-admin.js';
import { IdentityPlatformTokenVerifier } from './identity-platform.js';

const PROJECT = 'limon-test';
let sign: (claims: Record<string, unknown>, opts?: { iss?: string; aud?: string; exp?: string }) => Promise<string>;
let verifier: IdentityPlatformTokenVerifier;

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
  verifier = new IdentityPlatformTokenVerifier({ projectId: PROJECT, keys: createLocalJWKSet({ keys: [jwk] }) });
  sign = (claims, opts = {}) =>
    new SignJWT({ auth_time: Math.floor(Date.now() / 1000) - 60, ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setSubject('uid-1')
      .setIssuer(opts.iss ?? `https://securetoken.google.com/${PROJECT}`)
      .setAudience(opts.aud ?? PROJECT)
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '1h')
      .sign(privateKey);
});

describe('IdentityPlatformTokenVerifier', () => {
  it('returns the uid, email, verification and identity tenant', async () => {
    const t = await sign({ email: 'ana@x.com', email_verified: true, firebase: { tenant: 'carlos-a1b2c', sign_in_provider: 'password' } });
    expect(await verifier.verify(t)).toEqual({ subject: 'uid-1', email: 'ana@x.com', emailVerified: true, identityTenantId: 'carlos-a1b2c' });
  });

  it('treats a missing email_verified as unverified, and no tenant as a project-level login', async () => {
    const p = await verifier.verify(await sign({ email: 'n@x.com' }));
    expect(p.emailVerified).toBe(false);
    expect(p.identityTenantId).toBeNull();
  });

  it('rejects tokens for another project, expired tokens and future auth_time', async () => {
    await expect(verifier.verify(await sign({}, { aud: 'other-project' }))).rejects.toThrow();
    await expect(verifier.verify(await sign({}, { iss: 'https://securetoken.google.com/other-project' }))).rejects.toThrow();
    await expect(verifier.verify(await sign({}, { exp: '-1m' }))).rejects.toThrow();
    await expect(verifier.verify(await sign({ auth_time: Math.floor(Date.now() / 1000) + 3600 }))).rejects.toThrow();
  });

  it('rejects tokens signed by another key', async () => {
    const { privateKey } = await generateKeyPair('RS256');
    const forged = await new SignJWT({ auth_time: 1 })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setSubject('uid-1')
      .setIssuer(`https://securetoken.google.com/${PROJECT}`)
      .setAudience(PROJECT)
      .setExpirationTime('1h')
      .sign(privateKey);
    await expect(verifier.verify(forged)).rejects.toThrow();
  });
});

describe('identityTenantDisplayName', () => {
  it('fits Identity Platform rules: 4–20 chars, letters, digits and hyphens, starting with a letter', () => {
    expect(identityTenantDisplayName('carlos-nutrition')).toBe('carlos-nutrition');
    expect(identityTenantDisplayName('nutricion-integral-de-monterrey')).toBe('nutricion-integral-d');
    expect(identityTenantDisplayName('123-ana')).toBe('t-ana');
    expect(identityTenantDisplayName('a-')).toBe('t-a0');
  });
});
