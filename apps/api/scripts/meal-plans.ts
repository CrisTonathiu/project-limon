/**
 * Generate meal plans on demand, until the weekly job exists (and to try changes without
 * waiting for Sunday).
 *
 *   pnpm --filter @limon/api meal-plans generate <tenant-slug> [--patient <email | patient-id>] [--week YYYY-MM-DD]
 *
 * Without --patient, every patient of the tenant who finished onboarding gets a plan.
 * --week is the plan's Monday; it defaults to the current week, so the plan shows in the
 * app right away. An existing plan for that week is replaced.
 *
 * The tenant and patients are looked up with the owner role (DATABASE_MIGRATION_URL), like
 * `@limon/database admin`; the plans themselves are generated and saved through the app
 * role, so RLS applies exactly as it will for the weekly job.
 */
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import '../src/lib/bootstrap-database-url.js';
import { DatabaseRouter } from '@limon/database';
import { env } from '../src/config/index.js';
import { createContainer } from '../src/infrastructure/container.js';
import { createMealPlansService, type PlannedDay } from '../src/modules/meal-plans/meal-plans.service.js';
import { isMonday, weekStartOf } from '../src/modules/meal-plans/week.js';

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

const USAGE = 'Usage: meal-plans generate <tenant-slug> [--patient <email | patient-id>] [--week YYYY-MM-DD]';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const { positionals, values } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: { patient: { type: 'string' }, week: { type: 'string' } },
});
const [command, slug] = positionals;
if (command !== 'generate' || !slug) fail(USAGE);
const weekStart = values.week ?? weekStartOf(new Date());
if (!isMonday(weekStart)) fail(`--week must be a Monday (YYYY-MM-DD), got "${weekStart}".`);
if (!process.env.DATABASE_MIGRATION_URL) fail('DATABASE_MIGRATION_URL is not set (needed to look up the tenant).');

const owner = new DatabaseRouter({ url: process.env.DATABASE_MIGRATION_URL }).controlPlane();
const c = createContainer(env);
const service = createMealPlansService(c);
const log = { warn: (obj: object, msg: string) => console.warn(`  ! ${msg} ${JSON.stringify(obj)}`) };

const kcal = (n: number) => `${n.toLocaleString('es-MX')} kcal`;
const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-MX', { weekday: 'short', timeZone: 'UTC' });

function printWeek(days: PlannedDay[], targetKcal: number) {
  for (const day of days) {
    const off = Math.round(((day.kcal - targetKcal) / targetKcal) * 100);
    console.log(`  ${weekday(day.date)} ${day.date}  ${kcal(day.kcal)} (${off > 0 ? '+' : ''}${off}%)`);
    for (const m of day.meals) {
      console.log(
        m.recipeId
          ? `      ${m.mealType.padEnd(9)} ${m.title} × ${m.servings} (${kcal(m.kcal!)})`
          : `      ${m.mealType.padEnd(9)} — no recipe passes this patient's filters`,
      );
    }
  }
}

try {
  const tenant = await owner.tenant.findUnique({ where: { slug }, select: { id: true, name: true, deletedAt: true } });
  if (!tenant || tenant.deletedAt) fail(`No tenant "${slug}".`);

  const patient = values.patient;
  const patients = await owner.patient.findMany({
    where: {
      tenantId: tenant.id,
      deletedAt: null,
      profile: { isNot: null },
      ...(patient ? (UUID.test(patient) ? { id: patient } : { email: patient.toLowerCase() }) : {}),
    },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!patients.length) fail(patient ? `No onboarded patient "${patient}" in ${tenant.name}.` : `${tenant.name} has no onboarded patients.`);

  console.log(`${tenant.name} · week of ${weekStart}\n`);
  let failed = 0;
  for (const p of patients) {
    console.log(`${p.firstName} ${p.lastName} <${p.email ?? p.id}>`);
    try {
      const result = await service.generateWeek(
        { tenantId: tenant.id, patientId: p.id, weekStart, actorUserId: null, requestId: `meal-plans-cli-${randomUUID()}` },
        log,
      );
      if (result.status === 'CREATED') {
        console.log(`  target ${kcal(result.targetKcal)}/day · plan ${result.mealPlanId}`);
        printWeek(result.days, result.targetKcal);
      } else if (result.status === 'CONSULT_NUTRITIONIST') {
        console.log(`  skipped: no automatic target (${result.reason}); the nutritionist decides`);
      } else {
        console.log('  skipped: no profile');
      }
    } catch (err) {
      failed++;
      console.log(`  ✖ ${(err as Error).message}`);
    }
    console.log();
  }
  if (failed) process.exitCode = 1;
} finally {
  await owner.$disconnect();
  await c.db.disconnect();
}
