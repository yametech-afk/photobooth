/**
 * Authentication triggers.
 *
 * `onUserCreated` is the primary path that creates `users/{uid}` + `quotas/{uid}`.
 * The `bootstrapSession` callable is the fallback/repair path, so a missed trigger
 * (rare, but possible during an outage) self-heals on the user's next launch.
 *
 * Note on API versions:
 *  • Identity BLOCKING triggers (beforeCreate / beforeSignIn) are v2 (`firebase-functions/identity`).
 *  • Auth lifecycle triggers (user create / delete) are only available in v1
 *    (`firebase-functions/v1/auth`). Both are supported in one codebase.
 */
import { beforeUserCreated, beforeUserSignedIn, HttpsError } from "firebase-functions/v2/identity";
import { auth as authV1 } from "firebase-functions/v1";
import { REGION } from "../config/constants";
import { log } from "../lib/logger";
import { bootstrapUser, touchDailyActivity } from "../services/userService";
import { recordDailyCounters } from "../services/analyticsService";

// ------------------------------------------------------------------ blocking triggers

/** Runs in the Auth blocking-trigger pipeline before the account is created. */
export const beforeCreate = beforeUserCreated({ region: REGION }, async (event) => {
  const user = event.data;
  if (!user) return;
  log.info({
    event: "auth_before_create",
    uid: user.uid,
    provider: user.providerData?.[0]?.providerId ?? "password",
  });
  // Returning nothing lets creation proceed. Add domain allowlists / abuse checks here.
  return;
});

/**
 * Blocking sign-in: reject suspended accounts with a clean message.
 * The Firestore `status` field is authoritative (set by admins via setUserStatus).
 */
export const beforeSignIn = beforeUserSignedIn({ region: REGION }, async (event) => {
  const user = event.data;
  if (!user) return;

  try {
    const { getUser } = await import("../services/userService");
    const profile = await getUser(user.uid);
    if (profile?.status === "suspended") {
      log.warn({ event: "auth_blocked_suspended", uid: user.uid });
      throw new HttpsError("permission-denied", profile.suspendedReason || "Naka-suspend ang account na ito.");
    }
    // Track DAU without blocking the sign-in if Firestore is slow.
    void touchDailyActivity(user.uid).catch(() => undefined);
    return;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    // Never block sign-in because of a transient Firestore read.
    log.warn({ event: "auth_before_signin_check_failed", uid: user.uid, error: String(error) });
    return;
  }
});

// ------------------------------------------------------------------ lifecycle triggers (v1)

/**
 * Post-creation bootstrap. Creates the profile, quota period and custom claims.
 * Idempotent — safe if the `bootstrapSession` callable already ran.
 */
export const onUserCreated = authV1.user().onCreate(async (user) => {
  try {
    const { created } = await bootstrapUser({
      uid: user.uid,
      email: user.email ?? null,
      emailVerified: user.emailVerified,
      phoneNumber: user.phoneNumber ?? null,
      displayName: user.displayName ?? null,
      photoURL: user.photoURL ?? null,
      provider: user.providerData?.[0]?.providerId ?? "password",
    });

    if (created) await recordDailyCounters({ newUsers: 1 });
    log.info({ event: "auth_user_created", uid: user.uid, created });
  } catch (error) {
    // Rethrowing lets Cloud Functions retry, which is what we want for a bootstrap failure.
    log.error({ event: "auth_user_create_failed", uid: user.uid, error: String(error) });
    throw error;
  }
});

/**
 * Clean up identity-linked state on account deletion.
 * Firestore documents are removed by `deleteUserAccount`; this trigger clears Storage so a
 * deleted user's photos never linger in the bucket.
 */
export const onUserDeleted = authV1.user().onDelete(async (user) => {
  try {
    const { bucket } = await import("../config/admin");
    await bucket().deleteFiles({ prefix: `users/${user.uid}/`, force: true });
    log.warn({ event: "auth_user_deleted", uid: user.uid, storagePurged: true });
  } catch (error) {
    log.error({ event: "auth_user_delete_cleanup_failed", uid: user.uid, error: String(error) });
  }
});
