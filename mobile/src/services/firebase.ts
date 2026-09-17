import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeAuth, getAuth, type Auth } from 'firebase/auth';
// @ts-expect-error — getReactNativePersistence is only exposed through the
// React-Native platform condition in firebase v10; it exists at runtime.
import { getReactNativePersistence } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getFunctions, type Functions } from 'firebase/functions';
import { env, isFirebaseConfigured } from '../config/env';

/**
 * Single source of truth for the Cloud Functions region.
 *
 * MUST match `REGION` in functions/src/config/constants.ts. The backend deploys
 * every callable to asia-southeast1; Firebase's `getFunctions(app)` defaults to
 * us-central1, so omitting this makes every call fail with `functions/not-found`
 * on a real project (QA finding F-2).
 */
export const FUNCTIONS_REGION = 'asia-southeast1';

let app: FirebaseApp;
let authInstance: Auth;
let dbInstance: Firestore;
let storageInstance: FirebaseStorage;
let functionsInstance: Functions;

if (!isFirebaseConfigured) {
  // Fail fast with an actionable message instead of a cryptic Firebase error later.
  console.warn(
    '[photobooth] Firebase env vars are missing. Copy .env.example to .env and fill in the values from the Firebase Console. Auth/Firestore calls will reject until this is fixed.'
  );
}

app = getApps().length ? getApp() : initializeApp(env.firebase);

try {
  authInstance = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  // initializeAuth throws if auth was already initialized (e.g. Fast Refresh).
  authInstance = getAuth(app);
}

dbInstance = getFirestore(app);
storageInstance = getStorage(app);

// Pinned region — every module must use THIS instance (never call getFunctions()
// without a region; that is the F-2 defect this file now prevents by construction).
functionsInstance = getFunctions(app, FUNCTIONS_REGION);

export {
  app as firebaseApp,
  authInstance as auth,
  dbInstance as db,
  storageInstance as storage,
  functionsInstance as functions,
};
export default app;