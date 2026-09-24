import * as Crypto from 'expo-crypto';

/**
 * amazon-cognito-identity-js needs crypto.getRandomValues for SRP's ephemeral key math.
 * The usual fix (react-native-get-random-values) is a native module requiring a custom EAS
 * dev build; expo-crypto ships with the Expo SDK and works in plain Expo Go, so use that.
 * Must be imported before amazon-cognito-identity-js (see index.ts).
 */
const globalAny = global as { crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array } };
if (!globalAny.crypto) globalAny.crypto = {};
if (!globalAny.crypto.getRandomValues) {
  globalAny.crypto.getRandomValues = (array: Uint8Array) => {
    array.set(Crypto.getRandomBytes(array.length));
    return array;
  };
}
