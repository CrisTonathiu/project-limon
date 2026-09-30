/**
 * Food catalog CSV tools (the CSV itself lives in /private, which git ignores).
 *
 *   pnpm --filter @limon/api catalog suggest [csv]   # fill empty FatSecret ids with the best match
 *   pnpm --filter @limon/api catalog review  [csv]   # show what each row's ids point to, for checking
 *   pnpm --filter @limon/api catalog set <key> <food_id> [csv]   # point a row at another FatSecret food
 *
 * FatSecret's terms: only ids may be stored. The CSV therefore holds `fatsecret_food_id`
 * and `fatsecret_serving_id` only; names, serving sizes and nutrients are printed to
 * the terminal for review and never written to the file.
 *
 * Rows that already have a food id are left alone, so manual corrections survive.
 * `match_status`: auto (picked by suggest) | checked (a person confirmed it) | none (no match).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FoodDetail, FoodServing } from '@limon/types';
import '../src/lib/bootstrap-database-url.js';
import { env } from '../src/config/index.js';
import { createContainer } from '../src/infrastructure/container.js';
import { FatSecretError } from '../src/infrastructure/fatsecret.js';

type Row = Record<string, string>;

// ── Minimal RFC 4180 CSV ─────────────────────────────────────────────────────
function parseCsv(text: string): { header: string[]; rows: Row[] } {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') record.push(field), (field = '');
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      record.push(field), (field = '');
      if (record.some((f) => f !== '')) records.push(record);
      record = [];
    } else field += ch;
  }
  if (field !== '' || record.length) record.push(field), records.push(record);
  const [header = [], ...data] = records;
  return { header, rows: data.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? '']))) };
}

function toCsv(header: string[], rows: Row[]): string {
  const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [header, ...rows.map((r) => header.map((h) => r[h] ?? ''))].map((r) => r.map(cell).join(',')).join('\n') + '\n';
}

// ── Matching ────────────────────────────────────────────────────────────────
/** Prefer the "100 g" serving (clean per-gram base), then any serving measured in grams. */
function pickServing(food: FoodDetail): FoodServing | undefined {
  const grams = food.servings.filter((s) => s.metricUnit === 'g' && s.metricAmount);
  return (
    grams.find((s) => s.metricAmount === 100 && /^100 ?g$/i.test(s.description.trim())) ??
    grams.find((s) => s.metricAmount === 100) ??
    grams[0] ??
    food.servings[0]
  );
}

const describe = (food: FoodDetail, serving: FoodServing | undefined) => {
  if (!serving) return `${food.name} — no servings`;
  const n = serving.nutrients;
  return `${food.name}${food.brand ? ` (${food.brand})` : ''} · ${serving.description} = ${serving.metricAmount ?? '?'} ${serving.metricUnit ?? ''} · ${n.calories} kcal, P ${n.protein}, C ${n.carbohydrate}, F ${n.fat}`;
};

// FatSecret Basic throttles bursts (error 12): pace requests, and wait it out when it happens.
const PAUSE_MS = 1_500;
const THROTTLED_WAIT_MS = 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function patiently<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof FatSecretError && err.fatsecretCode === 12) || attempt >= 3) throw err;
      console.log(`  … FatSecret says slow down; waiting ${THROTTLED_WAIT_MS / 1000} s`);
      await sleep(THROTTLED_WAIT_MS);
    }
  }
}

// ── Commands ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const command = args[0];
const setArgs = command === 'set' ? args.splice(1, 2) : [];
const path = args[1] ?? '../../private/foods.csv';
const file = resolve(process.cwd(), path);
const c = createContainer(env);

async function main() {
  const client = c.fatsecret;
  if (!client) throw new Error('Set FATSECRET_CLIENT_ID and FATSECRET_CLIENT_SECRET in .env');
  const { header, rows } = parseCsv(readFileSync(file, 'utf8'));

  if (command === 'suggest') {
    let filled = 0;
    for (const row of rows) {
      if (row.fatsecret_food_id || !row.search_term) continue;
      await sleep(PAUSE_MS);
      const results = await patiently(() => client.searchFoods(row.search_term!, 0, 10));
      // Generic foods (no brand) are the right base for home recipes.
      const hit = results.items.find((f) => f.type === 'Generic' && !f.brand) ?? results.items[0];
      if (!hit) {
        row.match_status = 'none';
        console.log(`  ✖ ${row.key.padEnd(22)} no FatSecret result for "${row.search_term}"`);
        writeFileSync(file, toCsv(header, rows));
        continue;
      }
      const food = await patiently(() => client.getFood(hit.fatsecretFoodId));
      const serving = pickServing(food);
      row.fatsecret_food_id = food.fatsecretFoodId;
      row.fatsecret_serving_id = serving?.fatsecretServingId ?? '';
      row.match_status = 'auto';
      filled++;
      console.log(`  ✓ ${row.key.padEnd(22)} ${food.fatsecretFoodId.padStart(9)}  ${describe(food, serving)}`);
      // Save after every row so a failure midway keeps the work done so far.
      writeFileSync(file, toCsv(header, rows));
    }
    console.log(`\n${filled} rows filled → ${file}. Check them with: catalog review`);
    return;
  }

  if (command === 'review') {
    for (const row of rows) {
      if (!row.fatsecret_food_id) {
        console.log(`  · ${row.key.padEnd(22)} (no FatSecret id)`);
        continue;
      }
      const food = await patiently(() => client.getFood(row.fatsecret_food_id!));
      const serving = food.servings.find((s) => s.fatsecretServingId === row.fatsecret_serving_id);
      const smae = row.smae_group ? `SMAE: ${row.smae_group}, ${row.smae_portion_amount} ${row.smae_portion_unit} = ${row.smae_net_grams} g` : 'SMAE: —';
      console.log(`  ${row.match_status === 'checked' ? '✓' : '?'} ${row.name_es.padEnd(26)} ${describe(food, serving)}  |  ${smae}`);
    }
    return;
  }

  if (command === 'set') {
    const [key, foodId] = setArgs;
    const row = rows.find((r) => r.key === key);
    if (!row || !foodId) throw new Error(`Usage: catalog set <key> <food_id> [csv]${key && !row ? ` (no row "${key}")` : ''}`);
    const food = await patiently(() => client.getFood(foodId));
    const serving = pickServing(food);
    row.fatsecret_food_id = food.fatsecretFoodId;
    row.fatsecret_serving_id = serving?.fatsecretServingId ?? '';
    row.match_status = 'auto';
    writeFileSync(file, toCsv(header, rows));
    console.log(`  ✓ ${row.key.padEnd(22)} ${food.fatsecretFoodId.padStart(9)}  ${describe(food, serving)}`);
    return;
  }

  throw new Error('Usage: catalog suggest [csv] | catalog review [csv] | catalog set <key> <food_id> [csv]');
}

try {
  await main();
} catch (err) {
  console.error(`✖ ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await c.db.disconnect();
}
