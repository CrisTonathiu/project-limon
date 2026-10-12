import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, createSecureAuthStorage, type KeyValueStore } from './secure-auth-storage';

function fakeStore() {
  const data = new Map<string, string>();
  const store: KeyValueStore = {
    getItemAsync: async (k) => data.get(k) ?? null,
    setItemAsync: async (k, v) => {
      if (!/^[A-Za-z0-9._-]+$/.test(k)) throw new Error(`invalid key ${k}`);
      if (v.length > 2048) throw new Error('value too large');
      data.set(k, v);
    },
    deleteItemAsync: async (k) => void data.delete(k),
  };
  return { data, store };
}

const KEY = 'firebase:authUser:AIzaTest:[DEFAULT]';

describe('createSecureAuthStorage', () => {
  it('round-trips a large value under a key SecureStore would refuse', async () => {
    const { store } = fakeStore();
    const s = createSecureAuthStorage(store);
    const value = JSON.stringify({ uid: 'u1', stsTokenManager: { accessToken: 'a'.repeat(3000), refreshToken: 'r'.repeat(400) } });
    await s.setItem(KEY, value);
    expect(await s.getItem(KEY)).toBe(value);
  });

  it('returns null for a missing key and after removal, leaving no chunks behind', async () => {
    const { data, store } = fakeStore();
    const s = createSecureAuthStorage(store);
    expect(await s.getItem(KEY)).toBeNull();
    await s.setItem(KEY, 'x'.repeat(CHUNK_SIZE * 3));
    await s.removeItem(KEY);
    expect(await s.getItem(KEY)).toBeNull();
    expect(data.size).toBe(0);
  });

  it('a shorter value replaces a longer one completely', async () => {
    const { data, store } = fakeStore();
    const s = createSecureAuthStorage(store);
    await s.setItem(KEY, 'x'.repeat(CHUNK_SIZE * 4));
    await s.setItem(KEY, 'short');
    expect(await s.getItem(KEY)).toBe('short');
    expect(data.size).toBe(2); // the count and one chunk
  });

  it('stores an empty string as an empty value, not as missing', async () => {
    const s = createSecureAuthStorage(fakeStore().store);
    await s.setItem(KEY, '');
    expect(await s.getItem(KEY)).toBe('');
  });

  it('treats a half-written value as signed out', async () => {
    const { data, store } = fakeStore();
    const s = createSecureAuthStorage(store);
    await s.setItem(KEY, 'x'.repeat(CHUNK_SIZE * 2));
    data.delete([...data.keys()].find((k) => k.endsWith('.1'))!);
    expect(await s.getItem(KEY)).toBeNull();
  });
});
