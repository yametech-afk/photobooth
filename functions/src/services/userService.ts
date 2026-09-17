/**
 * User lifecycle service.
 *
 * Owns the shape of `users/{uid}` and the custom claims that authorise premium features and
 * admin actions. Rules require BOTH a live `adminRoles/{uid}` document and a matching custom
 * claim, so claims here are a cache — never the source of truth.
 */
import { auth, db, FieldValue, Timestamp } from "../config/admin";
import { ADMIN_ROLES, COLLECTIONS, PLANS, type AdminRole, type PlanId } from "../config/constants";
import { errors } from "../lib/errors";
import { log } from "../lib/logger";
import { writeAudit, AUDIT_ACTIONS } from "../lib/audit";
import { dayKey } from "../lib/dates";
import {
  defaultCounters,
  defaultPreferences,
  type AdminRoleDoc,
  type UserDoc,
} from "../models/types";
import { getAppConfig } from "./configService";

const USERS = COLLECTIONS.users;
const ROLES = COLLECTIONS.adminRoles;

/** Generate a stable, human-friendly referral code from the uid. */
export function referralCodeFor(uid: string): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let hash = 2166136261;
  for (let i = 0; i < uid.length; i += 1) {
    hash ^= uid.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let out = "";
  let value = Math.abs(hash);
  for (let i = 0; i < 8; i += 1) {
    out += alphabet[value % alphabet.length];
    value = Math.floor(value / alphabet.length) || (value + 7919);
  }
  return `PB${out}`;
}

export function userRef(uid: string) {
  return db.collection(USERS).doc(uid);
}

export async function getUser(uid: string): Promise<UserDoc | null> {
  const snap = await userRef(uid).get();
  return snap.exists ? (snap.data() as UserDoc) : null;
}

export async function requireUser(uid: string): Promise<UserDoc> {
  const user = await getUser(uid);
  if (!user) throw errors.notFound("Hindi mahanap ang user profile.");
  if (user.status === "suspended") {
    throw errors.permissionDenied(user.suspendedReason || "Naka-suspend ang account na ito.");
  }
  return user;
}

export interface BootstrapUserInput {
  uid: string;
  email: string | null;
  emailVerified?: boolean;
  phoneNumber?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  provider?: string;
  referredBy?: string | null;
  timezone?: string;
}

/**
 * Called by the Auth `onCreate` trigger AND by the `bootstrapUser` callable so the backend
 * self-heals if the trigger was missed (common during emulator work and after an outage).
 * Idempotent: an existing document is returned untouched.
 */
export async function bootstrapUser(input: BootstrapUserInput): Promise<{ created: boolean; user: UserDoc }> {
  const ref = userRef(input.uid);
  const existing = await ref.get();
  if (existing.exists) {
    return { created: false, user: existing.data() as UserDoc };
  }

  const appConfig = await getAppConfig();
  const now = Timestamp.now();
  const plan: PlanId = "free";

  const displayName =
    (input.displayName && input.displayName.trim().slice(0, 60)) ||
    (input.email ? input.email.split("@")[0].slice(0, 60) : "Photobooth User");

  const doc: UserDoc = {
    uid: input.uid,
    email: input.email,
    emailVerified: Boolean(input.emailVerified),
    phoneNumber: input.phoneNumber ?? null,
    displayName,
    photoURL: input.photoURL ?? null,
    plan,
    planSource: "signup",
    premiumSince: null,
    premiumUntil: null,
    subscriptionId: null,
    status: "active",
    suspendedReason: null,
    role: null,
    deviceTokens: [],
    preferences: defaultPreferences(),
    onboarding: { completed: false, completedAt: null, lastStep: 0, version: 1 },
    counters: defaultCounters(),
    referredBy: input.referredBy ?? null,
    referralCode: referralCodeFor(input.uid),
    locale: "en-PH",
    timezone: input.timezone ?? "Asia/Manila",
    lastActiveAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await ref.set(doc);

  // Signup bonus + initial quota period. Imported lazily to avoid a circular import at
  // module load time (quotaService imports userService for plan lookups).
  const { initQuota } = await import("./quotaService");
  await initQuota(input.uid, plan, {
    credits: Math.max(appConfig.signupBonusCredits, 0),
    reason: "signup_bonus",
  });

  // Referral credit is intentionally NOT paid here: the referrer is credited only after the
  // new user completes onboarding (`completeOnboarding`) to reduce throwaway-account farming.
  if (input.referredBy) {
    log.info({ event: "referral_attributed", uid: input.uid, referrer: input.referredBy });
  }

  await auth.setCustomUserClaims(input.uid, {
    admin: false,
    role: null,
    plan,
    onboardingComplete: false,
  });

  log.info({ event: "user_bootstrapped", uid: input.uid, provider: input.provider ?? "password" });
  return { created: true, user: doc };
}

/** Cosmetic self-service profile updates (whitelisted fields only). */
export interface ProfileUpdateInput {
  displayName?: string | null;
  photoURL?: string | null;
  preferences?: Record<string, unknown>;
  locale?: string | null;
  deviceToken?: string | null;
  removeDeviceToken?: string | null;
}

export async function updateProfile(uid: string, input: ProfileUpdateInput): Promise<UserDoc> {
  const ref = userRef(uid);
  const user = await requireUser(uid);
  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

  if (input.displayName !== undefined && input.displayName !== null) {
    updates.displayName = input.displayName.trim().slice(0, 60);
  }
  if (input.photoURL !== undefined) updates.photoURL = input.photoURL;
  if (input.locale) updates.locale = input.locale;

  if (input.preferences && typeof input.preferences === "object") {
    const allowed = ["notifications", "emailUpdates", "defaultFilterId", "saveOriginalsToLibrary", "theme"];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in input.preferences) patch[`preferences.${key}`] = input.preferences[key];
    }
    Object.assign(updates, patch);
  }

  if (input.deviceToken) {
    updates.deviceTokens = FieldValue.arrayUnion(input.deviceToken);
  }
  if (input.removeDeviceToken) {
    updates.deviceTokens = FieldValue.arrayRemove(input.removeDeviceToken);
  }

  await ref.set(updates, { merge: true });
  log.info({ event: "profile_updated", uid, fields: Object.keys(updates) });
  return { ...user, ...(updates as Partial<UserDoc>) };
}

export async function setLastActive(uid: string): Promise<void> {
  await userRef(uid).set({ lastActiveAt: FieldValue.serverTimestamp() }, { merge: true });
}

/** Mark onboarding finished and pay the referral bonus once. */
export async function completeOnboarding(uid: string, lastStep = 3): Promise<UserDoc> {
  const ref = userRef(uid);
  const user = await requireUser(uid);

  if (user.onboarding.completed) return user;

  await ref.set(
    {
      onboarding: { completed: true, completedAt: FieldValue.serverTimestamp(), lastStep, version: 1 },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await auth.setCustomUserClaims(uid, {
    admin: Boolean(user.role),
    role: user.role ?? null,
    plan: user.plan,
    onboardingComplete: true,
  });

  if (user.referredBy) {
    const appConfig = await getAppConfig();
    const { grantCredits } = await import("./quotaService");
    await grantCredits(user.referredBy, appConfig.referralBonusCredits, {
      action: "referral_bonus",
      reason: `Referred user ${uid} completed onboarding`,
      refType: "admin",
      refId: uid,
    }).catch((error) => log.warn({ event: "referral_bonus_failed", uid, error: String(error) }));
  }

  log.info({ event: "onboarding_completed", uid });
  return { ...user, onboarding: { ...user.onboarding, completed: true } };
}

// ------------------------------------------------------------------ admin roles

export async function getAdminRole(uid: string): Promise<AdminRoleDoc | null> {
  const snap = await db.collection(ROLES).doc(uid).get();
  return snap.exists ? (snap.data() as AdminRoleDoc) : null;
}

/** Every admin role document, newest first — powers the admin panel's team screen. */
export async function listAdminRoles(limit = 100): Promise<AdminRoleDoc[]> {
  const snap = await db
    .collection(ROLES)
    .orderBy("createdAt", "desc")
    .limit(Math.min(limit, 200))
    .get();
  return snap.docs.map((d) => d.data() as AdminRoleDoc);
}

export interface RoleCheckResult {
  isAdmin: boolean;
  role: AdminRole | null;
  status: "active" | "revoked" | null;
}

/** Live check against `adminRoles` — used by callables (the claim alone is not trusted). */
export async function checkAdminRole(uid: string): Promise<RoleCheckResult> {
  const doc = await getAdminRole(uid);
  if (!doc || doc.status !== "active") return { isAdmin: false, role: null, status: doc?.status ?? null };
  return { isAdmin: true, role: doc.role, status: "active" };
}

/** Fetch the user document AND admin role, then push fresh claims. */
export async function getUserWithClaims(uid: string): Promise<{
  user: UserDoc | null;
  role: AdminRole | null;
  claims: Record<string, unknown>;
}> {
  const [user, roleDoc] = await Promise.all([getUser(uid), getAdminRole(uid)]);
  const role = roleDoc?.status === "active" ? roleDoc.role : null;
  const claims = {
    admin: Boolean(role),
    role,
    plan: user?.plan ?? "free",
    onboardingComplete: user?.onboarding.completed ?? false,
    status: user?.status ?? "active",
  };
  return { user, role, claims };
}

/** Synchronise custom claims from Firestore. Safe to call on every app launch. */
export async function syncClaims(uid: string): Promise<Record<string, unknown>> {
  const { user, claims } = await getUserWithClaims(uid);
  await auth.setCustomUserClaims(uid, claims);
  log.info({ event: "claims_synced", uid, admin: claims.admin, plan: claims.plan, userFound: Boolean(user) });
  return claims;
}

export async function grantAdminRole(params: {
  actorUid: string;
  actorEmail?: string | null;
  targetUid: string;
  role: AdminRole;
  notes?: string | null;
}): Promise<AdminRoleDoc> {
  if (!ADMIN_ROLES.includes(params.role)) {
    throw errors.invalidArgument(`role must be one of: ${ADMIN_ROLES.join(", ")}`);
  }
  const target = await getUser(params.targetUid);
  if (!target) throw errors.notFound("Hindi mahanap ang target user.");

  const now = Timestamp.now();
  const doc: AdminRoleDoc = {
    uid: params.targetUid,
    email: target.email ?? "",
    role: params.role,
    status: "active",
    notes: params.notes ?? null,
    grantedBy: params.actorUid,
    grantedAt: now,
    revokedBy: null,
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection(ROLES).doc(params.targetUid).set(doc, { merge: true });
  await userRef(params.targetUid).set({ role: params.role, updatedAt: now }, { merge: true });
  await auth.setCustomUserClaims(params.targetUid, {
    admin: true,
    role: params.role,
    plan: target.plan,
    onboardingComplete: target.onboarding.completed,
    status: target.status,
  });
  await auth.revokeRefreshTokens(params.targetUid);

  await writeAudit({
    actorUid: params.actorUid,
    actorEmail: params.actorEmail ?? null,
    actorRole: "superadmin",
    action: AUDIT_ACTIONS.roleGranted,
    targetType: "adminRole",
    targetId: params.targetUid,
    after: { role: params.role, status: "active" },
    reason: params.notes ?? null,
  });

  log.info({ event: "admin_role_granted", targetUid: params.targetUid, role: params.role, actor: params.actorUid });
  return doc;
}

export async function revokeAdminRole(params: {
  actorUid: string;
  actorEmail?: string | null;
  targetUid: string;
  reason?: string | null;
}): Promise<void> {
  if (params.actorUid === params.targetUid) {
    throw errors.failedPrecondition("Hindi mo maaaring alisin ang sarili mong admin role.");
  }
  const existing = await getAdminRole(params.targetUid);
  if (!existing) throw errors.notFound("Walang admin role ang user na ito.");

  const now = Timestamp.now();
  await db.collection(ROLES).doc(params.targetUid).set(
    { status: "revoked", revokedBy: params.actorUid, revokedAt: now, updatedAt: now },
    { merge: true }
  );
  await userRef(params.targetUid).set({ role: null, updatedAt: now }, { merge: true });
  await auth.setCustomUserClaims(params.targetUid, { admin: false, role: null });
  await auth.revokeRefreshTokens(params.targetUid);

  await writeAudit({
    actorUid: params.actorUid,
    actorEmail: params.actorEmail ?? null,
    actorRole: "superadmin",
    action: AUDIT_ACTIONS.roleRevoked,
    targetType: "adminRole",
    targetId: params.targetUid,
    before: { role: existing.role, status: existing.status },
    after: { role: null, status: "revoked" },
    reason: params.reason ?? null,
  });

  log.info({ event: "admin_role_revoked", targetUid: params.targetUid, actor: params.actorUid });
}

/** Suspend / reactivate an account (support tooling). */
export async function setUserStatus(params: {
  actorUid: string;
  targetUid: string;
  status: "active" | "suspended";
  reason?: string | null;
}): Promise<void> {
  const before = await requireUser(params.targetUid);
  await userRef(params.targetUid).set(
    {
      status: params.status,
      suspendedReason: params.status === "suspended" ? params.reason ?? "Nilabag ang terms of service." : null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  await auth.updateUser(params.targetUid, { disabled: params.status === "suspended" });
  await auth.revokeRefreshTokens(params.targetUid);

  await writeAudit({
    actorUid: params.actorUid,
    action: params.status === "suspended" ? AUDIT_ACTIONS.userSuspended : AUDIT_ACTIONS.userUnsuspended,
    targetType: "user",
    targetId: params.targetUid,
    before: { status: before.status },
    after: { status: params.status },
    reason: params.reason ?? null,
  });
}

/**
 * Hard-delete a user and everything they own.
 * Storage objects are removed by the `onUserDeleted` Auth trigger (a separate, retryable step)
 * so this function stays within transactional limits.
 */
export async function deleteUserAccount(params: {
  actorUid: string;
  targetUid: string;
  reason?: string | null;
}): Promise<{ deletedPhotos: number }> {
  const user = await requireUser(params.targetUid);

  const photosSnap = await db.collection(COLLECTIONS.photos).where("uid", "==", params.targetUid).limit(500).get();
  const batch = db.batch();
  for (const doc of photosSnap.docs) batch.delete(doc.ref);
  batch.delete(userRef(params.targetUid));
  batch.delete(db.collection(COLLECTIONS.quotas).doc(params.targetUid));
  batch.delete(db.collection(ROLES).doc(params.targetUid));
  await batch.commit();

  await auth.deleteUser(params.targetUid).catch((error) =>
    log.warn({ event: "auth_delete_user_failed", uid: params.targetUid, error: String(error) })
  );

  await writeAudit({
    actorUid: params.actorUid,
    action: AUDIT_ACTIONS.userDeleted,
    targetType: "user",
    targetId: params.targetUid,
    before: { email: user.email, plan: user.plan, photos: photosSnap.size },
    reason: params.reason ?? null,
    meta: { deletedPhotos: photosSnap.size },
  });

  log.warn({ event: "user_deleted", uid: params.targetUid, photos: photosSnap.size, actor: params.actorUid });
  return { deletedPhotos: photosSnap.size };
}

/** Mark the user active today — used by the daily active-user rollup. */
export async function touchDailyActivity(uid: string): Promise<void> {
  const key = dayKey();
  await db
    .collection(COLLECTIONS.analyticsDaily)
    .doc(key)
    .set(
      {
        dayKey: key,
        [`activeUserIds.${uid}`]: true,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}
