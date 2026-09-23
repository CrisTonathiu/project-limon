import { describe, expect, it } from 'vitest';
import { CreatePatientSchema, RegisterNutritionistSchema } from './index.js';

describe('validation schemas', () => {
  it('rejects client-supplied tenantId (never trusted from clients)', () => {
    const r = CreatePatientSchema.safeParse({ firstName: 'A', lastName: 'B', tenantId: 'x' });
    expect(r.success).toBe(false);
  });

  it('rejects invalid slugs', () => {
    const r = RegisterNutritionistSchema.safeParse({
      email: 'm@x.com', firstName: 'M', lastName: 'N', businessName: 'Maria', slug: 'Maria Nutrition',
    });
    expect(r.success).toBe(false);
  });
});
