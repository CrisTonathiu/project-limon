import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { AuthenticationError, type TokenVerifier, type VerifiedPrincipal } from './verifier.js';

/** Google's public keys for Identity Platform (Firebase Auth) ID tokens. */
const SECURETOKEN_JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

/**
 * Verifies Identity Platform ID tokens: RS256 signature against Google's cached JWKS,
 * issuer and audience for this GCP project, expiry, and a non-empty `sub`.
 * Same checks as firebase-admin's verifyIdToken, without needing credentials.
 */
export class IdentityPlatformTokenVerifier implements TokenVerifier {
  private readonly keys: JWTVerifyGetKey;

  constructor(private readonly opts: { projectId: string; keys?: JWTVerifyGetKey }) {
    this.keys = opts.keys ?? createRemoteJWKSet(new URL(SECURETOKEN_JWKS));
  }

  async verify(token: string): Promise<VerifiedPrincipal> {
    try {
      const { payload } = await jwtVerify(token, this.keys, {
        issuer: `https://securetoken.google.com/${this.opts.projectId}`,
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
