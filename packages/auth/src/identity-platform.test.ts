import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { identityTenantDisplayName } from './identity-admin.js';
import { createRemoteX509KeySet, IdentityPlatformTokenVerifier } from './identity-platform.js';

const PROJECT = 'limon-test';
let sign: (claims: Record<string, unknown>, opts?: { iss?: string; aud?: string; exp?: string }) => Promise<string>;
let signSession: (claims: Record<string, unknown>, opts?: { iss?: string }) => Promise<string>;
let verifier: IdentityPlatformTokenVerifier;

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
  const session = await generateKeyPair('RS256');
  const sessionJwk = { ...(await exportJWK(session.publicKey)), kid: 's1', alg: 'RS256' };
  verifier = new IdentityPlatformTokenVerifier({
    projectId: PROJECT,
    keys: createLocalJWKSet({ keys: [jwk] }),
    sessionKeys: createLocalJWKSet({ keys: [sessionJwk] }),
  });
  signSession = (claims, opts = {}) =>
    new SignJWT({ auth_time: Math.floor(Date.now() / 1000) - 60, ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 's1' })
      .setSubject('uid-1')
      .setIssuer(opts.iss ?? `https://session.firebase.google.com/${PROJECT}`)
      .setAudience(PROJECT)
      .setIssuedAt()
      .setExpirationTime('12h')
      .sign(session.privateKey);
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

describe('IdentityPlatformTokenVerifier with session cookies', () => {
  it('accepts a session cookie for this project, read like an ID token', async () => {
    const t = await signSession({ email: 'n@x.com', email_verified: true, firebase: { sign_in_provider: 'password' } });
    expect(await verifier.verify(t)).toEqual({ subject: 'uid-1', email: 'n@x.com', emailVerified: true, identityTenantId: null });
  });

  it('rejects a session cookie for another project', async () => {
    await expect(verifier.verify(await signSession({}, { iss: 'https://session.firebase.google.com/other-project' }))).rejects.toThrow();
  });

  it('checks each kind against its own keys: a session-signed ID token and an ID-signed session cookie fail', async () => {
    await expect(verifier.verify(await signSession({}, { iss: `https://securetoken.google.com/${PROJECT}` }))).rejects.toThrow();
    const idSigned = await sign({}, { iss: `https://session.firebase.google.com/${PROJECT}` });
    await expect(verifier.verify(idSigned)).rejects.toThrow();
  });

  it('rejects anything that is not a JWT', async () => {
    await expect(verifier.verify('not-a-token')).rejects.toThrow();
  });
});

/** A throwaway self-signed certificate (public key only; its private key was discarded). */
const TEST_CERT = '-----BEGIN CERTIFICATE-----\nMIIDDTCCAfWgAwIBAgIUCRv/8yYoXW3H/4nxelO95zcriVcwDQYJKoZIhvcNAQEL\nBQAwFTETMBEGA1UEAwwKbGltb24tdGVzdDAgFw0yNjEwMjExNzIzNTdaGA8yMTI2\nMDkyNzE3MjM1N1owFTETMBEGA1UEAwwKbGltb24tdGVzdDCCASIwDQYJKoZIhvcN\nAQEBBQADggEPADCCAQoCggEBAKBzoMpOJqtwrq/LtaIQOGJD/8BXpxIYzMKmcVJo\nCaAU7Cw5ltZrIDYoXpn5UlH1bI6Z++FWKXOh+6TTJs46LkpVpV1WEt4EHgiUtHRw\nJVTpB9NFuPKsv8QIDLWuUb1ih0lYBzw4z6uSbuZ3n1mQGW9vDBri8Hc5A4M5l5yu\nNuPLJmAxzJhZ0UpiSwFf+NNrTMk65jTqF6vgxdbC22x0SynlXZ+VcgqTM5ovRzB5\nlsWjNsejS8yd1jeAFFbU3e+ZIefAaQIOqdxtcg7ESdvb4MdBSMmV0SOn/HhJvCHv\npmURIFvVBcH97xAcSYMZdIl0I8E1NxUAH2cFPcq1Whhgq/ECAwEAAaNTMFEwHQYD\nVR0OBBYEFPtXcIFLfZYgMFhnAIS/Mol/JncmMB8GA1UdIwQYMBaAFPtXcIFLfZYg\nMFhnAIS/Mol/JncmMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEB\nAEB4hYtgVg5vZnlYXzpgwEEfe9QVnnQrcfbCrHl0ay2C3KDOhhEn/FTPtgxZX5Wo\nK5vuWLH4MxxrcEpmrMVT6TYl45389s8ArR2p8+2K1nZF6yGBJJpACyuuEfGbE7YL\nm8ya7iTSL8oDNmwqTi87v1l1HujAYd7//7HZJT4Rs2AoHHGkHhJlQUWROHnUExuz\nB7JS3UM91/nyMxeYM1ovC9eq3inWJt+Tyjht18awCoEoVmk4JiKclluGQoyB8PTi\nXTEXa3JgDfc9wNPuwnDmiEZeKi4s64N1knsFj+4CnI9jjjJhWfn3wy3cAP3mH893\nPnPATFrcnnbOw+ENQge1PC0=\n-----END CERTIFICATE-----\n';

describe('createRemoteX509KeySet', () => {
  const certsResponse = (maxAge: number) =>
    new Response(JSON.stringify({ c1: TEST_CERT }), { headers: { 'cache-control': `public, max-age=${maxAge}` } });

  it('imports the certificates and caches them for max-age', async () => {
    const fetchImpl = vi.fn(async () => certsResponse(3600));
    const getKey = createRemoteX509KeySet('https://keys.test', fetchImpl);
    const key = await getKey({ alg: 'RS256', kid: 'c1' }, {} as never);
    expect(key).toBeDefined();
    await getKey({ alg: 'RS256', kid: 'c1' }, {} as never);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refetches once the cache expires', async () => {
    const fetchImpl = vi.fn(async () => certsResponse(0));
    const getKey = createRemoteX509KeySet('https://keys.test', fetchImpl);
    await getKey({ alg: 'RS256', kid: 'c1' }, {} as never);
    await getKey({ alg: 'RS256', kid: 'c1' }, {} as never);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('rejects an unknown kid without calling Google again within a minute', async () => {
    const fetchImpl = vi.fn(async () => certsResponse(3600));
    const getKey = createRemoteX509KeySet('https://keys.test', fetchImpl);
    await expect(getKey({ alg: 'RS256', kid: 'forged' }, {} as never)).rejects.toThrow();
    await expect(getKey({ alg: 'RS256', kid: 'forged-2' }, {} as never)).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the keys cannot be fetched', async () => {
    const getKey = createRemoteX509KeySet('https://keys.test', async () => new Response('', { status: 503 }));
    await expect(getKey({ alg: 'RS256', kid: 'c1' }, {} as never)).rejects.toThrow();
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
