import * as SecureStore from 'expo-secure-store';

/** Tokens live in the Keychain / Android Keystore — never AsyncStorage. */
const KEY = 'limon.session';

export const tokenStore = {
  get: () => SecureStore.getItemAsync(KEY),
  set: (token: string) => SecureStore.setItemAsync(KEY, token),
  clear: () => SecureStore.deleteItemAsync(KEY),
};
