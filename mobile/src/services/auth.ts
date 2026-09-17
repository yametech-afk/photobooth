/**
 * Auth service.
 *
 * IMPORTANT — server-authoritative bootstrapping (QA finding F-1):
 * `firestore.rules` sets `allow create: if false` on /users, so the profile and
 * credit documents can NEVER be created by the client. The previous version of
 * this file did `setDoc(doc(db, 'users', uid), profile)` after sign-up, which in
 * production rules is PERMISSION_DENIED — sign-up worked in Auth but crashed on
 * profile creation.
 *
 * The supported path is the `bootstrapSession` callable, which creates
 * users/{uid} + quotas/{uid}, syncs custom claims, and returns the session
 * payload in one round trip. It is also safe to call on every sign-in (it
 * self-heals a missing profile document).
 */
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { auth } from './firebase';
import { bootstrapSession, type BootstrapSessionResult } from './functions';

export type UserProfile = {
  uid: string;
  email: string | null;
  displayName: string;
  plan: 'free' | 'premium';
  creditsRemaining: number;
  totalPhotosTaken: number;
  createdAt: unknown;
};

/** Best-effort device timezone; the backend stores it for quota period keys. */
function resolveTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz || 'Asia/Manila';
  } catch {
    return 'Asia/Manila';
  }
}

/**
 * Create the account, then hand profile creation to the backend.
 * Returns both the Firebase user and the backend session payload.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string
): Promise<{ user: User; session: BootstrapSessionResult | null }> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const { user } = credential;

  if (displayName) {
    await updateProfile(user, { displayName });
  }

  // Server creates users/{uid} + quotas/{uid} and syncs custom claims.
  // A transient failure must not lose the account: the user can still sign in,
  // and sign-in re-runs bootstrap.
  let session: BootstrapSessionResult | null = null;
  try {
    session = await bootstrapSession({ displayName, timezone: resolveTimezone() });
  } catch (error) {
    console.warn('[photobooth] bootstrapSession failed after sign-up:', error);
  }

  // Refresh the ID token so the new custom claims (plan/onboarding) are present
  // before any rule-guarded read happens.
  try {
    await user.getIdToken(true);
  } catch (error) {
    console.warn('[photobooth] token refresh failed after sign-up:', error);
  }

  return { user, session };
}

/**
 * Sign in, then re-run the bootstrap callable so a missing/partial profile is
 * repaired and the claims are current before the app renders.
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<{ user: User; session: BootstrapSessionResult | null }> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const { user } = credential;

  let session: BootstrapSessionResult | null = null;
  try {
    session = await bootstrapSession({ timezone: resolveTimezone() });
  } catch (error) {
    console.warn('[photobooth] bootstrapSession failed after sign-in:', error);
  }

  try {
    await user.getIdToken(true);
  } catch (error) {
    console.warn('[photobooth] token refresh failed after sign-in:', error);
  }

  return { user, session };
}

export async function signOut(): Promise<void> {
  await fbSignOut(auth);
}