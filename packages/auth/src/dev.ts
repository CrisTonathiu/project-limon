import { SignJWT, jwtVerify } from 'jose';
import { AuthenticationError, type TokenVerifier, type VerifiedPrincipal } from './verifier.js';

/**
 * LOCAL DEVELOPMENT ONLY. HMAC-signed tokens so the full flow runs without AWS.
 * @limon/config refuses AUTH_PROVIDER=dev outside APP_ENV=development.
 */
export class DevTokenVerifier implements TokenVerifier {
  private readonly key: Uint8Array;
  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  async verify(token: string): Promise<VerifiedPrincipal> {
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: 'limon-dev' });
      if (!payload.sub) throw new Error('no sub');
      return { subject: payload.sub, email: (payload['email'] as string) ?? null, clientId: 'dev' };
    } catch {
      throw new AuthenticationError();
    }
  }

  async issue(subject: string, email?: string): Promise<string> {
    return new SignJWT({ email })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(subject)
      .setIssuer('limon-dev')
      .setIssuedAt()
      .setExpirationTime('12h')
      .sign(this.key);
  }
}
