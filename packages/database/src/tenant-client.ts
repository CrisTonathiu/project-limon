import type { Prisma, PrismaClient } from '@prisma/client';
import type { TenantPlacement } from '@limon/tenant';
import type { DatabaseRouter } from './client.js';

export type TenantTx = Prisma.TransactionClient;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs `fn` inside a transaction bound to one tenant.
 * Sets `app.tenant_id` transaction-locally so Postgres RLS filters every statement.
 * This is the ONLY sanctioned way for repositories to touch tenant-owned tables.
 *
 * Repositories should still include `tenantId` in their WHERE clauses — RLS is
 * the second line of defence, not a replacement for correct queries.
 */
export async function withTenant<T>(
  router: DatabaseRouter,
  placement: TenantPlacement,
  fn: (tx: TenantTx) => Promise<T>,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  if (!UUID.test(placement.tenantId)) throw new Error('withTenant: tenantId must be a UUID');
  const client: PrismaClient = router.clientFor(placement);
  return client.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.tenant_id', ${placement.tenantId}, true)`;
      return fn(tx);
    },
    { timeout: options.timeoutMs ?? 10_000 },
  );
}
