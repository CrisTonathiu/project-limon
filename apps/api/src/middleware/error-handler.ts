import type { ApiErrorBody } from '@limon/types';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

/**
 * Single error boundary. Clients only ever see { error: { code, message, requestId } }.
 * SQL errors, stack traces and infrastructure details are logged server-side only.
 */
export function errorHandler(err: FastifyError | Error, req: FastifyRequest, reply: FastifyReply) {
  const send = (status: number, body: ApiErrorBody['error']) =>
    reply.status(status).send({ error: { ...body, requestId: req.id } } satisfies ApiErrorBody);

  if (err instanceof AppError) {
    if (err.status >= 500) req.log.error({ err }, 'app error');
    return send(err.status, { code: err.code, message: err.message });
  }
  if (err instanceof ZodError) {
    return send(400, { code: 'VALIDATION_ERROR', message: err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ') });
  }
  const prismaCode = (err as { code?: string }).code;
  if (prismaCode === 'P2002') return send(409, { code: 'CONFLICT', message: 'A record with these details already exists.' });
  if (prismaCode === 'P2025') return send(404, { code: 'NOT_FOUND', message: 'Resource not found.' });

  const statusCode = (err as FastifyError).statusCode;
  if (statusCode === 429) return send(429, { code: 'RATE_LIMITED', message: 'Too many requests.' });
  if (statusCode && statusCode >= 400 && statusCode < 500) {
    return send(statusCode, { code: 'VALIDATION_ERROR', message: 'Malformed request.' });
  }

  req.log.error({ err }, 'unhandled error');
  return send(500, { code: 'INTERNAL_ERROR', message: 'Something went wrong.' });
}
