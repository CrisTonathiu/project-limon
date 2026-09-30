/**
 * Try the FatSecret API with the credentials in .env (from a whitelisted IP).
 * Food lookups go through the shared Postgres cache, like the API does.
 *
 *   pnpm --filter @limon/api fatsecret search "corn tortilla"
 *   pnpm --filter @limon/api fatsecret food 3741
 *   pnpm --filter @limon/api fatsecret refresh     # run the cache maintenance once (purge + refresh)
 *   pnpm --filter @limon/api fatsecret cache       # what's in the shared cache and how old it is
 */
import '../src/lib/bootstrap-database-url.js';
import { env } from '../src/config/index.js';
import { createContainer } from '../src/infrastructure/container.js';
import { FatSecretError } from '../src/infrastructure/fatsecret.js';
import { maintainFoodCache } from '../src/jobs/food-cache-maintenance.js';

const [command, arg] = process.argv.slice(2);
const usage = 'Usage: fatsecret search "<text>" | food <food_id> | refresh | cache';
const c = createContainer(env);

async function run() {
  if (command === 'refresh') {
    console.log(await maintainFoodCache(c));
    return;
  }
  if (command === 'cache') {
    const rows = await c.db.controlPlane().fatSecretFoodCache.findMany({ orderBy: { fetchedAt: 'desc' } });
    const hoursAgo = (d: Date) => (Date.now() - d.getTime()) / 3_600_000;
    console.log(`${rows.length} foods cached`);
    for (const r of rows) {
      const name = (r.food as { name?: string }).name ?? '?';
      console.log(`  ${r.fatsecretFoodId.padStart(9)}  ${name}  — fetched ${hoursAgo(r.fetchedAt).toFixed(1)} h ago, expires in ${(-hoursAgo(r.expiresAt)).toFixed(1)} h`);
    }
    return;
  }
  const client = c.fatsecret;
  if (!client) throw new Error('Set FATSECRET_CLIENT_ID and FATSECRET_CLIENT_SECRET in .env');
  if (command === 'search' && arg) {
    const res = await client.searchFoods(arg);
    console.log(`${res.total} results for "${arg}" (first ${res.items.length}):`);
    for (const f of res.items) console.log(`  ${f.fatsecretFoodId.padStart(9)}  ${f.name}${f.brand ? ` (${f.brand})` : ''} — ${f.description}`);
    return;
  }
  if (command === 'food' && arg) {
    const food = await client.getFood(arg);
    console.log(`${food.name}${food.brand ? ` (${food.brand})` : ''} [${food.type}] — ${food.servings.length} servings`);
    for (const s of food.servings) {
      const n = s.nutrients;
      console.log(
        `  ${s.isDefault ? '*' : ' '} ${s.fatsecretServingId.padStart(8)}  ${s.description} (${s.metricAmount ?? '?'} ${s.metricUnit ?? ''})` +
          ` — ${n.calories} kcal, P ${n.protein} g, C ${n.carbohydrate} g, F ${n.fat} g`,
      );
    }
    return;
  }
  throw new Error(usage);
}

try {
  await run();
} catch (err) {
  if (err instanceof FatSecretError && err.reason === 'ip_not_allowed') {
    console.error('✖ FatSecret refused this IP. Whitelist it in the FatSecret developer portal (API key → IP restrictions).');
  }
  console.error(`✖ ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await c.db.disconnect();
}
