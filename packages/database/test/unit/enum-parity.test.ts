import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AppPlatform, DatabaseMode, TenantAppStatus, TenantStatus, UserRole } from '@limon/types';

const schema = readFileSync(fileURLToPath(new URL('../../prisma/schema.prisma', import.meta.url)), 'utf8');

function prismaEnum(name: string): string[] {
  const m = schema.match(new RegExp(`enum ${name} \\{([^}]*)\\}`));
  if (!m) throw new Error(`enum ${name} not found`);
  return m[1]!.split('\n').map((l) => l.trim()).filter(Boolean).sort();
}

describe('@limon/types ↔ Prisma enum parity', () => {
  it.each([
    ['UserRole', UserRole],
    ['TenantStatus', TenantStatus],
    ['TenantAppStatus', TenantAppStatus],
    ['AppPlatform', AppPlatform],
    ['DatabaseMode', DatabaseMode],
  ])('%s matches', (name, values) => {
    expect(prismaEnum(name)).toEqual(Object.values(values).sort());
  });
});

describe('every tenant-owned table has RLS', () => {
  // Scan every migration: a tenant-owned table added later must bring its own policy.
  const migrationsDir = fileURLToPath(new URL('../../prisma/migrations', import.meta.url));
  const rls = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => readFileSync(`${migrationsDir}/${d.name}/migration.sql`, 'utf8'))
    .join('\n');
  const tablesWithTenantId = [...schema.matchAll(/model \w+ \{([\s\S]*?)@@map\("(\w+)"\)/g)]
    .filter((m) => /tenantId\s+String/.test(m[1]!))
    .map((m) => m[2]!);

  it.each(tablesWithTenantId)('%s is covered by a policy', (table) => {
    expect(rls.includes(`'${table}'`) || rls.includes(`ON ${table}`)).toBe(true);
  });
});
