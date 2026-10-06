/**
 * Platform-team admin commands, until the nutritionist dashboard exists.
 * Runs as the owner role (DATABASE_MIGRATION_URL), which is not subject to RLS, so every
 * command names its tenant explicitly and writes an audit entry.
 *
 *   pnpm --filter @limon/database admin features <tenant-slug>
 *   pnpm --filter @limon/database admin features <tenant-slug> --enable invite_only --disable meal_plan
 *   pnpm --filter @limon/database admin invite <tenant-slug> --first-name Ana --last-name López [--email ana@correo.mx] [--days 30]
 *   pnpm --filter @limon/database admin invite <tenant-slug> --patient <patient-id> [--days 30]   (new code for the same patient)
 *   pnpm --filter @limon/database admin recipes <tenant-slug>   (copy default recipes added to the library since the tenant was created)
 *   pnpm --filter @limon/database admin recipes --all   (the same for every tenant)
 *   pnpm --filter @limon/database admin foods [csv]   (load the food catalog, default ../../private/foods.csv)
 *   pnpm --filter @limon/database admin default-recipes [dir]   (load the default recipe library from recipes.csv and recipe-ingredients.csv, default ../../private)
 *   pnpm --filter @limon/database admin goal-rules <tenant-slug>   (show the clinic's goal rules)
 *   pnpm --filter @limon/database admin goal-rules <tenant-slug> --file rules.json   (store the nutritionist's rules as the next version)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { effectiveFeatures, generateInviteCode } from '@limon/tenant';
import { FEATURE_DEPENDENCIES, FeatureKey } from '@limon/types';
import { GoalRulesSchema, PLATFORM_GUARDRAILS } from '@limon/validation';
import { PrismaClient } from '../generated/client/index.js';
import { copyDefaultRecipes } from '../src/recipes.js';
import { parseCsv } from './csv.js';
import { parseCatalogRows, SMAE_EDITION, type CatalogFood } from './food-catalog.js';
import { parseLibraryRows, type LibraryRecipe } from './recipe-library.js';

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
  const effective = new Set<string>(effectiveFeatures(on));
  console.log(`${tenant.name} — admission: ${on.has(FeatureKey.INVITE_ONLY) ? 'INVITE ONLY' : 'OPEN'}`);
  for (const key of KEYS) {
    const needs = FEATURE_DEPENDENCIES[key as FeatureKey] ?? [];
    const blocked = on.has(key) && !effective.has(key) ? `  ⚠ no effect until ${needs.join(', ')} is enabled` : '';
    console.log(`  ${on.has(key) ? '●' : '○'} ${key}${blocked}`);
  }
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

/** Copies new default recipes into one tenant, or every tenant with --all. Never touches existing copies. */
async function recipes(args: string[]) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { all: { type: 'boolean' } } });
  if (values.all && positionals.length) fail('Give a tenant slug or --all, not both.');
  const tenants = values.all
    ? await prisma.tenant.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { createdAt: 'asc' } })
    : [await tenantBySlug(positionals[0])];

  let total = 0;
  for (const tenant of tenants) {
    // One transaction per tenant: a failure leaves the tenants before it fully copied.
    const copied = await prisma.$transaction((tx) => copyDefaultRecipes(tx, tenant.id));
    if (copied) await audit(tenant.id, 'DefaultRecipesCopied', 'Tenant', tenant.id, { recipesCopied: copied });
    console.log(copied ? `Copied ${copied} default recipe(s) into ${tenant.name}.` : `${tenant.name} already has every default recipe.`);
    total += copied;
  }
  if (values.all) console.log(`${total} recipe(s) copied into ${tenants.length} tenant(s).`);
}

/**
 * Loads the food catalog CSV into `foods` (platform reference data, not tenant data).
 * Matches on `key`: new keys are created, changed rows updated. Nothing is written if any
 * row is invalid. Foods missing from the CSV are listed, never deleted (recipes use them).
 */
async function foods(args: string[]) {
  const file = resolve(process.cwd(), args[0] ?? '../../private/foods.csv');
  const { rows } = parseCsv(readFileSync(file, 'utf8'));
  const parsed = parseCatalogRows(rows);
  if (parsed.errors.length) fail(`Nothing imported, fix these rows in ${file}:\n  ${parsed.errors.join('\n  ')}`);

  const fields = (f: CatalogFood) => JSON.stringify([f.name, f.fatsecretFoodId, f.fatsecretServingId, f.smaeGroup, f.gramsPerEquivalent, f.shoppingCategory, [...f.allergens].sort()]);
  const existing = new Map((await prisma.food.findMany()).map((f) => [f.key, f]));
  const created = parsed.foods.filter((f) => !existing.has(f.key));
  const updated = parsed.foods.filter((f) => existing.has(f.key) && fields(existing.get(f.key)! as CatalogFood) !== fields(f));
  await prisma.$transaction([
    ...created.map((data) => prisma.food.create({ data })),
    ...updated.map(({ key, ...data }) => prisma.food.update({ where: { key }, data })),
  ]);

  console.log(`Food catalog ← ${file}`);
  console.log(`  ${created.length} created, ${updated.length} updated, ${parsed.foods.length - created.length - updated.length} unchanged`);
  const keys = new Set(parsed.foods.map((f) => f.key));
  const missing = [...existing.keys()].filter((k) => !keys.has(k));
  if (missing.length) console.log(`  ⚠ in the database but not in the CSV (kept): ${missing.join(', ')}`);
  if (parsed.unchecked.length) console.log(`  ⚠ ${parsed.unchecked.length} FatSecret match(es) not confirmed yet (match_status ≠ checked). Check with: pnpm --filter @limon/api catalog review`);
  if (parsed.otherSmaeEdition.length) console.log(`  ⚠ ${parsed.otherSmaeEdition.length} SMAE row(s) not from the ${SMAE_EDITION}th edition; check their grams per equivalent against it`);
}

/**
 * Loads the default recipe library (platform reference data) from recipes.csv and
 * recipe-ingredients.csv. Matches recipes on `key`: new keys are created, changed recipes
 * updated with their ingredients replaced. Nothing is written if any row is invalid.
 * Recipes missing from the CSV are listed, never deleted. Tenants' copies are never
 * updated: new recipes reach them with `admin recipes --all`.
 */
async function defaultRecipes(args: string[]) {
  const dir = resolve(process.cwd(), args[0] ?? '../../private');
  const read = (name: string) => parseCsv(readFileSync(resolve(dir, name), 'utf8')).rows;
  const foodIds = new Map((await prisma.food.findMany({ select: { id: true, key: true } })).map((f) => [f.key, f.id]));
  const parsed = parseLibraryRows(read('recipes.csv'), read('recipe-ingredients.csv'), new Set(foodIds.keys()));
  if (parsed.errors.length) fail(`Nothing imported, fix these rows in ${dir}:\n  ${parsed.errors.join('\n  ')}`);

  type Data = Omit<LibraryRecipe, 'key' | 'ingredients'>;
  type Ingredient = Omit<LibraryRecipe['ingredients'][number], 'foodKey'> & { foodId: string };
  const data = (r: Data): Data => ({
    title: r.title, description: r.description, mealTypes: r.mealTypes, servings: r.servings,
    totalMinutes: r.totalMinutes, tags: r.tags, steps: r.steps, imageKey: r.imageKey,
  });
  const ingredients = (r: LibraryRecipe): Ingredient[] =>
    r.ingredients.map((i) => ({ position: i.position, quantity: i.quantity, unit: i.unit, grams: i.grams, note: i.note, foodId: foodIds.get(i.foodKey)! }));
  const fields = (d: Data, i: Ingredient[]) => JSON.stringify([data(d), i]);

  const stored = await prisma.defaultRecipe.findMany({ include: { ingredients: { orderBy: { position: 'asc' } } } });
  const existing = new Map(stored.map((d) => [d.key, fields(d as Data, d.ingredients.map((i) => (
    { position: i.position, quantity: i.quantity, unit: i.unit, grams: i.grams, note: i.note, foodId: i.foodId }
  )))]));
  const created = parsed.recipes.filter((r) => !existing.has(r.key));
  const updated = parsed.recipes.filter((r) => existing.has(r.key) && existing.get(r.key) !== fields(r, ingredients(r)));
  await prisma.$transaction([
    ...created.map((r) => prisma.defaultRecipe.create({ data: { key: r.key, ...data(r), ingredients: { create: ingredients(r) } } })),
    ...updated.map((r) => prisma.defaultRecipe.update({
      where: { key: r.key },
      data: { ...data(r), ingredients: { deleteMany: {}, create: ingredients(r) } },
    })),
  ]);

  console.log(`Default recipe library ← ${dir}`);
  console.log(`  ${created.length} created, ${updated.length} updated, ${parsed.recipes.length - created.length - updated.length} unchanged`);
  const keys = new Set(parsed.recipes.map((r) => r.key));
  const missing = [...existing.keys()].filter((k) => !keys.has(k));
  if (missing.length) console.log(`  ⚠ in the database but not in the CSV (kept): ${missing.join(', ')}`);
  if (created.length) console.log('  → copy the new recipes into every tenant with: pnpm --filter @limon/database admin recipes --all');
  if (updated.length) console.log('  ⚠ tenants that already have a copy of an updated recipe keep their copy as it was');
}

/**
 * A clinic's goal rules, written by its nutritionist at onboarding. Each change is stored as a
 * new version (the latest applies) and must be stricter than the platform's guardrails; the
 * schema refuses anything looser. Patients keep their current goal until they set a new one.
 */
async function goalRules(args: string[]) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { file: { type: 'string' } } });
  const tenant = await tenantBySlug(positionals[0]);
  const latest = await prisma.tenantGoalRules.findFirst({ where: { tenantId: tenant.id }, orderBy: { version: 'desc' } });

  if (!values.file) {
    console.log(`${tenant.name}: ${latest ? `clinic rules, version ${latest.version}` : `no clinic rules, platform-${PLATFORM_GUARDRAILS.version} applies`}`);
    console.log(JSON.stringify(latest?.rules ?? PLATFORM_GUARDRAILS, null, 2));
    return;
  }

  const parsed = GoalRulesSchema.safeParse(JSON.parse(readFileSync(resolve(values.file), 'utf8')));
  if (!parsed.success) {
    fail(`Rules refused:\n${parsed.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n')}`);
  }
  const version = (latest?.version ?? 0) + 1;
  await prisma.$transaction(async (tx) => {
    const row = await tx.tenantGoalRules.create({ data: { tenantId: tenant.id, version, rules: parsed.data } });
    await tx.auditLog.create({
      data: {
        tenantId: tenant.id, userId: null, requestId: `admin-cli-${Date.now()}`, action: 'GoalRulesChanged',
        resourceType: 'TenantGoalRules', resourceId: row.id, metadata: { version, via: 'admin-cli' },
      },
    });
  });
  console.log(`✔ ${tenant.name}: goal rules version ${version} stored`);
  console.log(JSON.stringify(parsed.data, null, 2));
}

const [command, ...rest] = process.argv.slice(2);
const commands: Record<string, (args: string[]) => Promise<void>> = {
  features, invite, recipes, foods, 'default-recipes': defaultRecipes, 'goal-rules': goalRules,
};
const run = command ? commands[command] : undefined;
if (!run) fail(`Usage: admin <${Object.keys(commands).join('|')}> <tenant-slug | csv> [options]`);
run(rest)
  .catch((err) => fail(err instanceof Error ? err.message : String(err)))
  .finally(() => prisma.$disconnect());
