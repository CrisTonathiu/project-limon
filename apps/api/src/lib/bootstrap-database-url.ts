import { assembleDatabaseUrl } from '@limon/config';

/**
 * Must be imported before `../config/index.js` (which reads DATABASE_URL eagerly at
 * module load). Locally DATABASE_URL is already set via .env, so this is a no-op there.
 */
process.env.DATABASE_URL ??= assembleDatabaseUrl();
