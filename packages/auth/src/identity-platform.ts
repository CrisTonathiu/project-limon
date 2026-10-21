import { createRemoteJWKSet, decodeJwt, importX509, jwtVerify, type JWTVerifyGetKey, type KeyLike } from 'jose';
import { AuthenticationError, type TokenVerifier, type VerifiedPrincipal } from './verifier.js';

/** Google's public keys for Identity Platform (Firebase Auth) ID tokens. */
const SECURETOKEN_JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
/** Google's public keys for Firebase session cookies: X.509 certificates by key id, not a JWKS. */
const SESSION_COOKIE_CERTS = 'https://www.googleapis.com/identitytoolkit/v3/relyingparty/publicKeys';

/**
 * Verifies Identity Platform credentials: RS256 signature against Google's cached public keys,
 * issuer and audience for this GCP project, expiry, `auth_time` and a non-empty `sub`.
 * Same checks as firebase-admin's verifyIdToken / verifySessionCookie, without needing credentials.
 *
 * Two kinds are accepted, told apart by their issuer:
 * - ID tokens (`securetoken.google.com`), sent by the patient app.
 * - Session cookies (`session.firebase.google.com`), which the dashboard mints for nutritionists
 *   and forwards from its httpOnly cookie (docs/architecture/authentication.md). They carry the
 *   same claims, so the principal is read the same way.
 */
export class IdentityPlatformTokenVerifier implements TokenVerifier {
  private readonly idTokenKeys: JWTVerifyGetKey;
  private readonly sessionKeys: JWTVerifyGetKey;

  constructor(private readonly opts: { projectId: string; keys?: JWTVerifyGetKey; sessionKeys?: JWTVerifyGetKey }) {
    this.idTokenKeys = opts.keys ?? createRemoteJWKSet(new URL(SECURETOKEN_JWKS));
    this.sessionKeys = opts.sessionKeys ?? createRemoteX509KeySet(SESSION_COOKIE_CERTS);
  }

  async verify(token: string): Promise<VerifiedPrincipal> {
    try {
      const sessionIssuer = `https://session.firebase.google.com/${this.opts.projectId}`;
      const isSession = decodeJwt(token).iss === sessionIssuer;
      const { payload } = await jwtVerify(token, isSession ? this.sessionKeys : this.idTokenKeys, {
        issuer: isSession ? sessionIssuer : `https://securetoken.google.com/${this.opts.projectId}`,
        audience: this.opts.projectId,
        algorithms: ['RS256'],
      });
      if (!payload.sub) throw new Error('no sub');
      if (typeof payload['auth_time'] !== 'number' || payload['auth_time'] * 1000 > Date.now()) throw new Error('bad auth_time');
      const firebase = payload['firebase'] as { tenant?: unknown } | undefined;
      return {
        subject: payload.sub,
        email: typeof payload['email'] === 'string' ? payload['email'] : null,
        emailVerified: payload['email_verified'] === true,
        identityTenantId: typeof firebase?.tenant === 'string' ? firebase.tenant : null,
      };
    } catch {
      throw new AuthenticationError();
    }
  }
}

/**
 * Key lookup for an endpoint serving `{ kid: PEM certificate }`, cached for as long as its
 * Cache-Control max-age allows (Google rotates these keys). An unknown kid refetches, at most
 * once a minute, so forged key ids can't make every request call Google.
 */
export function createRemoteX509KeySet(url: string, fetchImpl: typeof fetch = fetch): JWTVerifyGetKey {
  let keys = new Map<string, KeyLike>();
  let expiresAt = 0;
  let fetchedAt = -Infinity;
  let pending: Promise<void> | null = null;

  async function refresh() {
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`public keys: HTTP ${res.status}`);
    const certs = (await res.json()) as Record<string, string>;
    const next = new Map<string, KeyLike>();
    for (const [kid, pem] of Object.entries(certs)) next.set(kid, await importX509(pem, 'RS256'));
    const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 0);
    keys = next;
    fetchedAt = Date.now();
    expiresAt = Date.now() + maxAge * 1000;
  }

  const load = () => (pending ??= refresh().finally(() => (pending = null)));

  return async (header) => {
    if (!header.kid) throw new Error('no kid');
    const now = Date.now();
    if (now >= expiresAt || (!keys.has(header.kid) && now - fetchedAt > 60_000)) await load();
    const key = keys.get(header.kid);
    if (!key) throw new Error('unknown kid');
    return key;
  };
}
