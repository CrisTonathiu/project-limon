/**
 * Authentication = "who is this?" only. It proves an Identity Platform login (uid).
 * It deliberately does NOT return the application tenant or role: those come from the
 * database (users table), never from token claims the client could influence.
 */
export type VerifiedPrincipal = {
  subject: string; // Identity Platform uid (token `sub`)
  email: string | null;
  /** Unverified logins may only register; every other route rejects them. */
  emailVerified: boolean;
  /**
   * The Identity Platform tenant that issued the token (`firebase.tenant`): the practice's
   * tenant for patients, null for nutritionists (project-level logins) and with dev auth.
   * Only compared against the database, never used to choose a tenant.
   */
  identityTenantId: string | null;
};

export interface TokenVerifier {
  verify(bearerToken: string): Promise<VerifiedPrincipal>;
}

export class AuthenticationError extends Error {
  constructor(message = 'Invalid or expired token') {
    super(message);
    this.name = 'AuthenticationError';
  }
}
