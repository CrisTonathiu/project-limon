/**
 * Platform-team admin commands, until the nutritionist dashboard exists.
 * Runs as the owner role (DATABASE_MIGRATION_URL), which is not subject to RLS, so every
 * command names its tenant explicitly and writes an audit entry.
 *
 *   pnpm --filter @limon/database admin features <tenant-slug>
 *   pnpm --filter @limon/database admin features <tenant-slug> --enable invite_only --disable meal_plan
 *   pnpm --filter @limon/database admin invite <tenant-slug> --first-name Ana --last-name López [--email ana@correo.mx] [--days 30]
 *   pnpm --filter @limon/database admin invite <tenant-slug> --patient <patient-id> [--days 30]   (new code for the same patient)
 */
import { parseArgs } from 'node:util';
import { generateInviteCode } from '@limon/tenant';
import { FeatureKey } from '@limon/types';
import { PrismaClient } from '../generated/client/index.js';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_MIGRATION_URL! } } });
const KEYS = Object.values(FeatureKey) as string[];

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

async function tenantBySlug(slug: string | undefined) {
  if (!slug) fail('Missing tenant slug.');
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, name: true, deletedAt: true } });
  if (!tenant || tenant.deletedAt) fail(`No tenant "${slug}".`);
  return tenant;
}

function audit(tenantId: string, action: string, resourceType: string, resourceId: string | null, metadata: Record<string, unknown>) {
  return prisma.auditLog.create({
    data: { tenantId, userId: null, requestId: `admin-cli-${Date.now()}`, action, resourceType, resourceId, metadata: { ...metadata, via: 'admin-cli' } },
  });
}

async function features(args: string[]) {
  const { values, positionals } = parseArgs({
    args, allowPositionals: true,
    options: { enable: { type: 'string', multiple: true }, disable: { type: 'string', multiple: true } },
  });
  const tenant = await tenantBySlug(positionals[0]);
  const split = (v?: string[]) => (v ?? []).flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean);
  const enable = split(values.enable);
  const disable = split(values.disable);
  const unknown = [...enable, ...disable].filter((k) => !KEYS.includes(k));
  if (unknown.length) fail(`Unknown feature(s): ${unknown.join(', ')}. Known: ${KEYS.join(', ')}`);

  if (enable.length || disable.length) {
    await prisma.$transaction(async (tx) => {
      for (const [keys, enabled] of [[enable, true], [disable, false]] as const) {
        for (const featureKey of keys) {
          await tx.tenantFeature.upsert({
            where: { tenantId_featureKey: { tenantId: tenant.id, featureKey } },
            update: { enabled },
            create: { tenantId: tenant.id, featureKey, enabled },
          });
        }
      }
    });
    await audit(tenant.id, 'FeatureFlagsChanged', 'Tenant', tenant.id, { enabled: enable, disabled: disable });
  }

  const rows = await prisma.tenantFeature.findMany({ where: { tenantId: tenant.id } });
  const on = new Set(rows.filter((r) => r.enabled).map((r) => r.featureKey));
  console.log(`${tenant.name} — admission: ${on.has(FeatureKey.INVITE_ONLY) ? 'INVITE ONLY' : 'OPEN'}`);
  for (const key of KEYS) console.log(`  ${on.has(key) ? '●' : '○'} ${key}`);
}

async function invite(args: string[]) {
  const { values, positionals } = parseArgs({
    args, allowPositionals: true,
    options: {
      'first-name': { type: 'string' }, 'last-name': { type: 'string' }, email: { type: 'string' },
      patient: { type: 'string' }, days: { type: 'string', default: '30' },
    },
  });
  const tenant = await tenantBySlug(positionals[0]);
  const days = Number(values.days);
  if (!Number.isInteger(days) || days < 1 || days > 365) fail('--days must be a whole number from 1 to 365.');

  let patient;
  if (values.patient) {
    patient = await prisma.patient.findFirst({ where: { tenantId: tenant.id, id: values.patient, deletedAt: null } });
    if (!patient) fail(`No patient ${values.patient} in ${tenant.name}.`);
    if (patient.userId) fail(`${patient.firstName} ${patient.lastName} already has an account; no invite needed.`);
  } else {
    const firstName = values['first-name']?.trim();
    const lastName = values['last-name']?.trim();
    if (!firstName || !lastName) fail('--first-name and --last-name are required (or --patient <id> to reissue).');
    patient = await prisma.patient.create({
      data: { tenantId: tenant.id, firstName, lastName, email: values.email?.trim().toLowerCase() || null },
    });
  }

  // Reissuing replaces any code the patient still had.
  await prisma.tenantInviteCode.updateMany({ where: { tenantId: tenant.id, patientId: patient.id, redeemedAt: null }, data: { active: false } });
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  let code = '';
  for (let attempt = 0; !code; attempt++) {
    try {
      const candidate = generateInviteCode();
      await prisma.tenantInviteCode.create({ data: { tenantId: tenant.id, patientId: patient.id, code: candidate, expiresAt } });
      code = candidate;
    } catch (err) {
      // Unique collision on a random code is astronomically rare; retry a couple of times.
      if ((err as { code?: string }).code !== 'P2002' || attempt >= 2) throw err;
    }
  }
  await audit(tenant.id, 'PatientInvited', 'Patient', patient.id, { expiresInDays: days });

  console.log(`Invite for ${patient.firstName} ${patient.lastName} (${tenant.name})`);
  console.log(`  code:     ${code}`);
  console.log(`  patient:  ${patient.id}`);
  console.log(`  expires:  ${expiresAt.toISOString().slice(0, 10)} (single use)`);
}

const [command, ...rest] = process.argv.slice(2);
const commands: Record<string, (args: string[]) => Promise<void>> = { features, invite };
const run = command ? commands[command] : undefined;
if (!run) fail(`Usage: admin <${Object.keys(commands).join('|')}> <tenant-slug> [options]`);
run(rest)
  .catch((err) => fail(err instanceof Error ? err.message : String(err)))
  .finally(() => prisma.$disconnect());
