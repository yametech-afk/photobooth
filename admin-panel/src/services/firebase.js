/**
 * Firebase service layer — the ONLY file that touches the Firebase SDK.
 * Every page imports from here, never from 'firebase/*' directly.
 *
 * Config comes from Vite env vars (VITE_FIREBASE_*). If they are missing
 * (no real project yet), the module exposes `isConfigured = false` and the
 * data adapters automatically fall back to seeded mock data so every
 * screen still renders during development/demo.
 *
 * NOTE: Firebase client SDK works in browsers; env vars are embedded at
 * build time — they are PUBLIC identifiers (API key restricts domain), so
 * it is safe to ship them. Real authorization is enforced by Security
 * Rules (see firestore.rules / storage.rules at project root).
 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/* ---------------- auth ---------------- */

export async function adminSignIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;
  // Admin check: custom claim first, then admins collection as fallback.
  const token = await cred.user.getIdTokenResult();
  const claimRole = token.claims?.role || token.claims?.admin;
  if (claimRole === 'admin' || claimRole === 'superadmin' || claimRole === true) {
    return { uid, email: cred.user.email, role: claimRole === true ? 'admin' : claimRole };
  }
  const adminDoc = await getDoc(doc(db, 'admins', uid));
  if (adminDoc.exists()) {
    const role = adminDoc.data().role || 'admin';
    if (role === 'admin' || role === 'superadmin') {
      return { uid, email: cred.user.email, role, name: adminDoc.data().name };
    }
  }
  await signOut(auth);
  throw new Error('You do not have admin privileges.');
}

export function watchAuth(cb) {
  return onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, email: u.email } : null));
}

export async function adminSignOut() {
  await signOut(auth);
}

/* ---------------- generic firestore helpers ---------------- */

export async function listCollection(name, orderField = 'createdAt', desc = true, max = 500) {
  const snap = await getDocs(
    max
      ? query(collection(db, name), orderBy(orderField, desc ? 'desc' : 'asc'), limit(max))
      : collection(db, name)
  );
  return snap.docs.map((d) => {
    const data = d.data();
    const ts = data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt || null;
    return { id: d.id, ...data, createdAt: ts };
  });
}

export const createDoc = (name, data) =>
  addDoc(collection(db, name), { ...data, createdAt: serverTimestamp() });
export const updateDocById = (name, id, data) =>
  updateDoc(doc(db, name, id), data);
export const deleteDocById = (name, id) =>
  deleteDoc(doc(db, name, id));
