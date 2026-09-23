import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { AuthenticationError, type TokenVerifier, type VerifiedPrincipal } from './verifier.js';

/**
 * Verifies Cognito ACCESS tokens (signature via cached JWKS, issuer, expiry, token_use, client_id).
 * One user pool, separate app clients for the dashboard and for patient apps (ADR-006).
 */
export class CognitoTokenVerifier implements TokenVerifier {
  private readonly verifier;

  constructor(opts: { userPoolId: string; clientIds: string[] }) {
    this.verifier = CognitoJwtVerifier.create({
      userPoolId: opts.userPoolId,
      tokenUse: 'access',
      clientId: opts.clientIds,
    });
  }

  async verify(token: string): Promise<VerifiedPrincipal> {
    try {
      const payload = await this.verifier.verify(token);
      return {
        subject: payload.sub,
        email: typeof payload['email'] === 'string' ? (payload['email'] as string) : null,
        clientId: payload.client_id ?? null,
      };
    } catch {
      throw new AuthenticationError();
    }
  }
}
