import { CognitoTokenVerifier, DevTokenVerifier, type TokenVerifier } from '@limon/auth';
import type { ServerEnv } from '@limon/config';
import { createFoodCacheStore, DatabaseRouter, SharedTenantRegistry } from '@limon/database';
import type { TenantRegistry } from '@limon/tenant';
import { FatSecretClient } from './fatsecret.js';
import { createJobPublisher, type JobPublisher } from './queue.js';
import { createStorage, type TenantStorage } from './storage.js';

/**
 * Composition root. Dependencies are created once and passed explicitly —
 * no module-level singletons, so tests can swap any piece.
 */
export type Container = {
  env: ServerEnv;
  db: DatabaseRouter;
  registry: TenantRegistry;
  verifier: TokenVerifier;
  devVerifier: DevTokenVerifier | null;
  jobs: JobPublisher;
  storage: TenantStorage;
  /** Null when FatSecret credentials aren't configured. */
  fatsecret: FatSecretClient | null;
};

export function createContainer(env: ServerEnv, overrides: Partial<Container> = {}): Container {
  const db = overrides.db ?? new DatabaseRouter({ url: env.DATABASE_URL });
  const devVerifier = env.AUTH_PROVIDER === 'dev' ? new DevTokenVerifier(env.DEV_AUTH_SECRET!) : null;
  const verifier =
    devVerifier ??
    new CognitoTokenVerifier({
      userPoolId: env.COGNITO_USER_POOL_ID!,
      clientIds: [env.COGNITO_NUTRITIONIST_CLIENT_ID, env.COGNITO_PATIENT_CLIENT_ID].filter((x): x is string => !!x),
    });
  return {
    env,
    db,
    registry: new SharedTenantRegistry(),
    verifier,
    devVerifier,
    jobs: createJobPublisher(env),
    storage: createStorage(env),
    fatsecret:
      env.FATSECRET_CLIENT_ID && env.FATSECRET_CLIENT_SECRET
        ? new FatSecretClient({
            clientId: env.FATSECRET_CLIENT_ID,
            clientSecret: env.FATSECRET_CLIENT_SECRET,
            scopes: env.FATSECRET_SCOPES,
            region: env.FATSECRET_REGION,
            language: env.FATSECRET_LANGUAGE,
            store: createFoodCacheStore(db),
          })
        : null,
    ...overrides,
  };
}
