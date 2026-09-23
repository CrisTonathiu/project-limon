import type { ErrorCode } from '@limon/types';

/** Only AppError messages are ever shown to clients. Everything else becomes INTERNAL_ERROR. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  unauthenticated: () => new AppError('UNAUTHENTICATED', 401, 'Authentication required.'),
  forbidden: () => new AppError('FORBIDDEN', 403, 'You do not have permission to perform this action.'),
  notFound: (what = 'Resource') => new AppError('NOT_FOUND', 404, `${what} not found.`),
  conflict: (msg: string) => new AppError('CONFLICT', 409, msg),
  tenantNotFound: () => new AppError('TENANT_NOT_FOUND', 403, 'This account is not available.'),
  tenantSuspended: () => new AppError('TENANT_SUSPENDED', 403, 'This account is currently unavailable.'),
  tenantMismatch: () => new AppError('TENANT_MISMATCH', 403, 'This account cannot be used with this app.'),
  subscriptionRequired: () => new AppError('SUBSCRIPTION_REQUIRED', 402, 'An active subscription is required.'),
  appNotRecognized: () => new AppError('APP_NOT_RECOGNIZED', 400, 'This app is not recognized.'),
};
