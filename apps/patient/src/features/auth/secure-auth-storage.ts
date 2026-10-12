/**
 * Where the Firebase SDK keeps the signed-in user (its refresh token included): the Keychain /
 * Android Keystore through expo-secure-store, never AsyncStorage (see services/token-store.ts).
 *
 * SecureStore only accepts keys of letters, digits, ".", "-" and "_", and may refuse values
 * over 2048 bytes, while Firebase uses keys like "firebase:authUser:<key>:[DEFAULT]" and its
 * user record can be larger. So keys are sanitized and values split into chunks.
 */

/** The storage shape Firebase's getReactNativePersistence expects. */
export type AuthStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

/** The subset of expo-secure-store used here, injectable for tests. */
export type KeyValueStore = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

/** Well under 2048 bytes even if every character took several bytes in UTF-8. */
export const CHUNK_SIZE = 500;

const safeKey = (key: string) => `limon.auth.${key.replace(/[^A-Za-z0-9._-]/g, '_')}`;

export function createSecureAuthStorage(store: KeyValueStore): AuthStorage {
  // The base key holds the chunk count; chunks live at "<base>.0", "<base>.1", …
  const count = async (base: string) => Number((await store.getItemAsync(base)) ?? '0');

  async function remove(base: string) {
    const n = await count(base);
    for (let i = 0; i < n; i++) await store.deleteItemAsync(`${base}.${i}`);
    await store.deleteItemAsync(base);
  }

  return {
    async getItem(key) {
      const base = safeKey(key);
      const n = await count(base);
      if (!n) return null;
      const parts: string[] = [];
      for (let i = 0; i < n; i++) {
        const part = await store.getItemAsync(`${base}.${i}`);
        if (part === null) return null; // a write was interrupted: treat as signed out
        parts.push(part);
      }
      return parts.join('');
    },
    async setItem(key, value) {
      const base = safeKey(key);
      await remove(base);
      const chunks = value.match(new RegExp(`[\\s\\S]{1,${CHUNK_SIZE}}`, 'g')) ?? [''];
      for (const [i, chunk] of chunks.entries()) await store.setItemAsync(`${base}.${i}`, chunk);
      // Written last, so a reader never sees a count whose chunks aren't all there.
      await store.setItemAsync(base, String(chunks.length));
    },
    removeItem: (key) => remove(safeKey(key)),
  };
}
