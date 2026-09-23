/**
 * Authentication = "who is this?" only. It proves a Cognito identity (sub).
 * It deliberately does NOT return tenant or role: those come from the database
 * (users table), never from token claims the client could influence.
 */
export type VerifiedPrincipal = {
  subject: string; // Cognito sub
  email: string | null;
  clientId: string | null; // which app client issued the token (nutritionist vs patient)
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
