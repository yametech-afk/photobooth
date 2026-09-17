/**
 * Single Admin SDK initialisation shared by every Cloud Function in this codebase.
 * Importing this module anywhere guarantees exactly one `initializeApp()` call.
 */
import { App, getApps, initializeApp } from "firebase-admin/app";
import { Auth, getAuth } from "firebase-admin/auth";
import { FieldValue, Firestore, Timestamp, getFirestore } from "firebase-admin/firestore";
import { Storage, getStorage } from "firebase-admin/storage";
import type { Bucket } from "@google-cloud/storage";

if (getApps().length === 0) {
  initializeApp();
}

export const adminApp: App = getApps()[0];
export const auth: Auth = getAuth(adminApp);
export const db: Firestore = getFirestore(adminApp);
export const storage: Storage = getStorage(adminApp);

// Internal objects frequently carry `undefined` (optional metadata); ignore them
// instead of throwing at write time.
db.settings({ ignoreUndefinedProperties: true });

/** Resolve the default Storage bucket, honouring the emulator / multi-bucket env vars. */
export function bucket(): Bucket {
  const name =
    process.env.STORAGE_BUCKET ||
    process.env.FIREBASE_STORAGE_BUCKET ||
    (process.env.GCLOUD_PROJECT ? `${process.env.GCLOUD_PROJECT}.appspot.com` : undefined);
  return name ? storage.bucket(name) : storage.bucket();
}

export { FieldValue, Timestamp };
