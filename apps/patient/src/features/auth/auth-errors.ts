import { ApiError } from '@limon/api-client';
import { t } from '../../i18n/es-MX';

/** What to tell the patient when signing in, signing up or confirming fails. */
export function authErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'TENANT_MISMATCH':
        return t.auth.errors.otherPractice;
      case 'TENANT_SUSPENDED':
        return t.auth.errors.unavailable;
      case 'CONFLICT':
        return t.auth.errors.accountExists;
      case 'INVITE_CODE_INVALID':
        return t.auth.errors.inviteExpired;
      case 'VALIDATION_ERROR':
        return t.auth.errors.invalidData;
      case 'EMAIL_NOT_VERIFIED':
        return t.auth.errors.notConfirmed;
      default:
        return t.common.genericError;
    }
  }
  // Identity Platform (Firebase Auth) errors carry an "auth/…" code.
  switch ((err as { code?: string } | null)?.code) {
    // With email enumeration protection, a wrong password and an unknown email look the same.
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return t.auth.errors.wrongCredentials;
    case 'auth/invalid-email':
      return t.auth.errors.invalidData;
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
      return t.auth.errors.weakPassword;
    case 'auth/email-already-in-use':
      return t.auth.errors.accountExists;
    case 'auth/too-many-requests':
      return t.auth.errors.tooManyAttempts;
    default:
      return t.common.genericError;
  }
}
