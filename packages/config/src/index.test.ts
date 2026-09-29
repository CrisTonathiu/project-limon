import { describe, expect, it } from 'vitest';
import { loadServerEnv } from './index.js';

describe('loadServerEnv', () => {
  const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

  it('refuses dev auth outside development', () => {
    expect(() =>
      loadServerEnv({ ...base, APP_ENV: 'production', AUTH_PROVIDER: 'dev', DEV_AUTH_SECRET: 'x' }),
    ).toThrow(/dev auth is forbidden/);
  });

  it('treats empty FatSecret variables as unset, but refuses half a credential pair', () => {
    const env = loadServerEnv({ ...base, AUTH_PROVIDER: 'dev', DEV_AUTH_SECRET: 'x', FATSECRET_CLIENT_ID: '', FATSECRET_CLIENT_SECRET: '' });
    expect(env.FATSECRET_CLIENT_ID).toBeUndefined();
    expect(env.FATSECRET_SCOPES).toBe('basic');
    expect(() =>
      loadServerEnv({ ...base, AUTH_PROVIDER: 'dev', DEV_AUTH_SECRET: 'x', FATSECRET_CLIENT_SECRET: 'secret' }),
    ).toThrow(/FATSECRET_CLIENT_ID/);
  });

  it('accepts dev auth locally', () => {
    expect(loadServerEnv({ ...base, AUTH_PROVIDER: 'dev', DEV_AUTH_SECRET: 'x' }).APP_ENV).toBe('development');
  });
});
