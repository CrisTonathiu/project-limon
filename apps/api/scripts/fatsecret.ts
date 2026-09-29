/**
 * Try the FatSecret API with the credentials in .env (from a whitelisted IP).
 *
 *   pnpm --filter @limon/api fatsecret search "corn tortilla"
 *   pnpm --filter @limon/api fatsecret food 4412
 */
import { FatSecretClient, FatSecretError } from '../src/infrastructure/fatsecret.js';

const {
  FATSECRET_CLIENT_ID: id,
  FATSECRET_CLIENT_SECRET: secret,
  FATSECRET_SCOPES,
  FATSECRET_REGION,
  FATSECRET_LANGUAGE,
} = process.env;
const [command, arg] = process.argv.slice(2);

if (!id || !secret) {
  console.error('✖ Set FATSECRET_CLIENT_ID and FATSECRET_CLIENT_SECRET in .env');
  process.exit(1);
}
if (!arg || (command !== 'search' && command !== 'food')) {
  console.error('Usage: fatsecret search "<text>" | fatsecret food <food_id>');
  process.exit(1);
}

const client = new FatSecretClient({
  clientId: id,
  clientSecret: secret,
  scopes: FATSECRET_SCOPES || 'basic',
  region: FATSECRET_REGION || undefined,
  language: FATSECRET_LANGUAGE || undefined,
});

try {
  if (command === 'search') {
    const res = await client.searchFoods(arg);
    console.log(`${res.total} results for "${arg}" (first ${res.items.length}):`);
    for (const f of res.items)
      console.log(
        `  ${f.fatsecretFoodId.padStart(9)}  ${f.name}${f.brand ? ` (${f.brand})` : ''} — ${f.description}`,
      );
  } else {
    const food = await client.getFood(arg);
    console.log(
      `${food.name}${food.brand ? ` (${food.brand})` : ''} [${food.type}] — ${food.servings.length} servings`,
    );
    for (const s of food.servings) {
      const n = s.nutrients;
      console.log(
        `  ${s.isDefault ? '*' : ' '} ${s.fatsecretServingId.padStart(8)}  ${s.description} (${s.metricAmount ?? '?'} ${s.metricUnit ?? ''})` +
          ` — ${n.calories} kcal, Protein: ${n.protein} g, Carbohydrate: ${n.carbohydrate} g, Fat: ${n.fat} g`,
      );
    }
  }
} catch (err) {
  if (err instanceof FatSecretError && err.reason === 'ip_not_allowed') {
    console.error(
      '✖ FatSecret refused this IP. Whitelist it in the FatSecret developer portal (API key → IP restrictions).',
    );
  }
  console.error(`✖ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
