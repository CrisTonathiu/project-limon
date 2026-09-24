import { z } from 'zod';

/**
 * Server-side environment loader. Fails fast on boot if configuration is invalid.
 * Secrets are injected into the process env by ECS from Secrets Manager — the
 * application never reads Secrets Manager directly for boot config.
 */
const ServerEnvSchema = z
  .object({
    APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
    NODE_ENV: z.string().default('development'),
    API_PORT: z.coerce.number().int().default(4000),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    DATABASE_URL: z.string().url(),
    AUTH_PROVIDER: z.enum(['cognito', 'dev']).default('dev'),
    DEV_AUTH_SECRET: z.string().optional(),
    COGNITO_REGION: z.string().optional(),
    COGNITO_USER_POOL_ID: z.string().optional(),
    COGNITO_NUTRITIONIST_CLIENT_ID: z.string().optional(),
    COGNITO_PATIENT_CLIENT_ID: z.string().optional(),
    AWS_REGION: z.string().default('us-east-1'),
    S3_TENANT_BUCKET: z.string().default('limon-dev-tenant-assets'),
    SQS_JOBS_QUEUE_URL: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV !== 'development' && env.AUTH_PROVIDER === 'dev') {
      ctx.addIssue({ code: 'custom', path: ['AUTH_PROVIDER'], message: 'dev auth is forbidden outside development' });
    }
    if (env.AUTH_PROVIDER === 'dev' && !env.DEV_AUTH_SECRET) {
      ctx.addIssue({ code: 'custom', path: ['DEV_AUTH_SECRET'], message: 'required for dev auth' });
    }
    if (env.AUTH_PROVIDER === 'cognito' && !env.COGNITO_USER_POOL_ID) {
      ctx.addIssue({ code: 'custom', path: ['COGNITO_USER_POOL_ID'], message: 'required for cognito auth' });
    }
  });

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

export function loadServerEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const parsed = ServerEnvSchema.safeParse(source);
  if (!parsed.success) {
    // Print variable names only, never values.
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Invalid server environment:\n  ${issues}`);
  }
  return parsed.data;
}

export const isProduction = (env: Pick<ServerEnv, 'APP_ENV'>) => env.APP_ENV === 'production';

/**
 * ECS injects DB_HOST + a role password as separate Secrets Manager secrets (see
 * compute-stack.ts); nothing assembles the single DATABASE_URL the app/prisma expect.
 * Called before `loadServerEnv()` so it can fill `process.env.DATABASE_URL` in place.
 */
function assembleUrl(source: Record<string, string | undefined>, role: 'limon_app' | 'limon_owner', passwordVar: string): string | undefined {
  const host = source.DB_HOST;
  const password = source[passwordVar];
  if (!host || !password) return undefined;
  return `postgresql://${role}:${encodeURIComponent(password)}@${host}:5432/limon`;
}

export const assembleDatabaseUrl = (source: Record<string, string | undefined> = process.env) => assembleUrl(source, 'limon_app', 'DB_APP_PASSWORD');

export const assembleMigrationDatabaseUrl = (source: Record<string, string | undefined> = process.env) =>
  assembleUrl(source, 'limon_owner', 'DB_OWNER_PASSWORD');
