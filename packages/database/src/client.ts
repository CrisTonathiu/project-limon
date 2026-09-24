// Imported from the generated client (schema.prisma's custom `output`), not the `@prisma/client`
// package: the default node_modules/.prisma location doesn't survive `pnpm deploy --prod` in the
// API/worker Docker images. Default-imported (not named) since it's CJS and Node's ESM loader
// can't statically detect named runtime exports here (tsx/vitest mask this locally).
import PrismaPkg from '../generated/client/index.js';
import type { PrismaClient } from '../generated/client/index.js';
import { SHARED_DATABASE_IDENTIFIER, type TenantPlacement } from '@limon/tenant';

const { PrismaClient: PrismaClientImpl } = PrismaPkg;

/**
 * Database router. The ONLY place that maps a tenant placement to a connection.
 * Today: SHARED → the main Aurora cluster. DEDICATED is modelled but not implemented;
 * when it is, this becomes a pool of clients keyed by databaseIdentifier with
 * credentials from Secrets Manager.
 */
export class DatabaseRouter {
  private readonly main: PrismaClient;

  constructor(options: { url?: string; log?: boolean } = {}) {
    this.main = new PrismaClientImpl({
      ...(options.url ? { datasources: { db: { url: options.url } } } : {}),
      log: options.log ? ['warn', 'error'] : ['error'],
    });
  }

  clientFor(placement: TenantPlacement): PrismaClient {
    if (placement.databaseMode === 'SHARED' && placement.databaseIdentifier === SHARED_DATABASE_IDENTIFIER) {
      return this.main;
    }
    throw new Error(`Database placement not supported yet: ${placement.databaseMode}/${placement.databaseIdentifier}`);
  }

  /** Pre-tenant access (identity / app resolution) always hits the control-plane DB. */
  controlPlane(): PrismaClient {
    return this.main;
  }

  async disconnect(): Promise<void> {
    await this.main.$disconnect();
  }
}
