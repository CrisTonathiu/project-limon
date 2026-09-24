/**
 * Cloud DB bootstrap: creates the `limon_app` runtime role the same way
 * packages/database/docker/init.sql does for local dev (NOSUPERUSER NOBYPASSRLS, so RLS
 * always applies), since nothing does this for Aurora automatically. Idempotent — safe to
 * run on every deploy. Runs as the owner role (DATABASE_MIGRATION_URL), before migrations,
 * so ALTER DEFAULT PRIVILEGES covers every table `prisma migrate deploy` then creates.
 */
import { assembleMigrationDatabaseUrl } from '@limon/config';
import { PrismaClient } from '../generated/client/index.js';

const url = process.env.DATABASE_MIGRATION_URL ?? assembleMigrationDatabaseUrl();
if (!url) throw new Error('Missing DATABASE_MIGRATION_URL (or DB_HOST + DB_OWNER_PASSWORD)');
const appPassword = process.env.DB_APP_PASSWORD;
if (!appPassword) throw new Error('Missing DB_APP_PASSWORD');

const prisma = new PrismaClient({ datasources: { db: { url } } });
const literal = (s: string) => `'${s.replace(/'/g, "''")}'`;

async function main() {
  const [{ exists }] = await prisma.$queryRawUnsafe<[{ exists: boolean }]>(
    `SELECT EXISTS (SELECT FROM pg_roles WHERE rolname = 'limon_app') AS exists`,
  );
  if (!exists) {
    await prisma.$executeRawUnsafe(`CREATE ROLE limon_app LOGIN PASSWORD ${literal(appPassword)} NOSUPERUSER NOBYPASSRLS`);
    await prisma.$executeRawUnsafe(`GRANT CONNECT ON DATABASE limon TO limon_app`);
    await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO limon_app`);
    await prisma.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES FOR ROLE limon_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO limon_app`);
    await prisma.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES FOR ROLE limon_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO limon_app`);
    console.log('Created limon_app role.');
  } else {
    // Secrets Manager may have rotated the password since the role was created.
    await prisma.$executeRawUnsafe(`ALTER ROLE limon_app WITH PASSWORD ${literal(appPassword)}`);
    console.log('limon_app role already exists; password synced.');
  }
}

main().finally(() => prisma.$disconnect());
