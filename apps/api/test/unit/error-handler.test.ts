import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../../src/middleware/error-handler.js';

describe('errorHandler', () => {
  it('never leaks internal error details', async () => {
    const app = Fastify({ logger: false });
    app.setErrorHandler(errorHandler);
    app.get('/boom', async () => {
      throw new Error('relation "patients" does not exist at 10.0.3.12:5432');
    });
    const res = await app.inject('/boom');
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('10.0.3.12');
    expect(res.json().error.code).toBe('INTERNAL_ERROR');
  });
});
