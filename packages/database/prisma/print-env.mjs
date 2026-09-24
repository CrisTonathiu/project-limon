// Prints `export DATABASE_URL=...` / `export DATABASE_MIGRATION_URL=...` lines to eval in the
// migrate container's shell, since `prisma migrate deploy` (unlike our own scripts) reads
// DATABASE_URL directly from the environment and has no way to call assembleDatabaseUrl() itself.
import { assembleDatabaseUrl, assembleMigrationDatabaseUrl } from '@limon/config';

console.log(`export DATABASE_URL=${JSON.stringify(assembleDatabaseUrl())}`);
console.log(`export DATABASE_MIGRATION_URL=${JSON.stringify(assembleMigrationDatabaseUrl())}`);
