import * as SecureStore from 'expo-secure-store';
import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth/react-native';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

const sanitizeKey = (key: string) => key.replace(/[^a-zA-Z0-9.\-_]/g, '-');

const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    return await SecureStore.getItemAsync(sanitizeKey(key));
  },

  async setItem(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(sanitizeKey(key), value);
  },

  async removeItem(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(sanitizeKey(key));
  },
};

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(secureStorage),
});

export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;