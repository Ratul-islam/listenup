import * as SecureStore from 'expo-secure-store';

// Encrypted on-device storage (Android Keystore / iOS Keychain) for secrets
export const secureStorage = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  remove: (key: string) => SecureStore.deleteItemAsync(key),
};
