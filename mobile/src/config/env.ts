/**
 * Central environment configuration.
 * Reads Expo public env vars (inlined at build time from `.env`).
 * Never import this from files that must stay secret-safe on the client;
 * server-only keys belong in Cloud Functions config, not here.
 */

type FirebaseEnv = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

const read = (key: string): string => {
  const envSource: Record<string, string | undefined> = process.env as Record<
    string,
    string | undefined
  >;
  return envSource[key] ?? '';
};

export const env = {
  firebase: {
    apiKey: read('EXPO_PUBLIC_FIREBASE_API_KEY'),
    authDomain: read('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
    projectId: read('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
    storageBucket: read('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: read('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
    appId: read('EXPO_PUBLIC_FIREBASE_APP_ID'),
  } satisfies FirebaseEnv,
  replicateApiKey: read('EXPO_PUBLIC_REPLICATE_API_KEY'),
  appVersion: '1.0.0',
};

const isPlaceholder = (value: string): boolean =>
  value.length === 0 || value.startsWith('your_') || value.startsWith('REPLACE');

/** True only when every Firebase key looks like a real value. */
export const isFirebaseConfigured: boolean = !Object.values(env.firebase).some(isPlaceholder);

/** True when a Replicate key is present (cloud AI filters enabled). */
export const isCloudAIConfigured: boolean = !isPlaceholder(env.replicateApiKey);
