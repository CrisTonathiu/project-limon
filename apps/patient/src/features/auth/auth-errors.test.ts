import { ApiError } from '@limon/api-client';
import { describe, expect, it } from 'vitest';
import { t } from '../../i18n/es-MX';
import { authErrorMessage } from './auth-errors';

const firebase = (code: string) => Object.assign(new Error(code), { code });

describe('authErrorMessage', () => {
  it('maps API errors, including a login whose email is not verified yet', () => {
    expect(authErrorMessage(new ApiError(403, 'EMAIL_NOT_VERIFIED', 'x'))).toBe(t.auth.errors.notConfirmed);
    expect(authErrorMessage(new ApiError(403, 'TENANT_MISMATCH', 'x'))).toBe(t.auth.errors.otherPractice);
  });

  it('maps Identity Platform errors to Spanish messages', () => {
    expect(authErrorMessage(firebase('auth/invalid-credential'))).toBe(t.auth.errors.wrongCredentials);
    expect(authErrorMessage(firebase('auth/password-does-not-meet-requirements'))).toBe(t.auth.errors.weakPassword);
    expect(authErrorMessage(firebase('auth/email-already-in-use'))).toBe(t.auth.errors.accountExists);
    expect(authErrorMessage(firebase('auth/too-many-requests'))).toBe(t.auth.errors.tooManyAttempts);
  });

  it('falls back to the generic message', () => {
    expect(authErrorMessage(firebase('auth/network-request-failed'))).toBe(t.common.genericError);
    expect(authErrorMessage(new Error('boom'))).toBe(t.common.genericError);
    expect(authErrorMessage(null)).toBe(t.common.genericError);
  });
});
