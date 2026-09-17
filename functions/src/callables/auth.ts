/**
 * Auth + profile callables.
 *
 * These exist so the client never needs direct Firestore write access to `users`, and so the
 * backend can self-heal a missing user document (a real problem when the Auth trigger fails or
 * during emulator work).
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { guard, errors } from "../lib/errors";
import { log } from "../lib/logger";
import { resolveContext } from "../lib/context";
import { asHttpsValidationError, optionalPhone, optionalString, requiredString } from "../lib/validation";
import { enforceRateLimit } from "../lib/rateLimit";
import { logEvents } from "../services/analyticsService";
import {
  bootstrapUser,
  completeOnboarding,
  getUserWithClaims,
  setLastActive,
  syncClaims,
  updateProfile,
} from "../services/userService";
import { getQuotaSummary } from "../services/quotaService";
import { getAppConfig } from "../services/configService";

const CALL_OPTS = {
  region: REGION,
  cors: true,
  timeoutSeconds: 30,
  memory: "256MiB" as const,
};

/**
 * Called by the client immediately after sign-in / sign-up.
 * Creates the profile + quota when missing, syncs claims, and returns the full session payload
 * so the app can render in one round trip.
 */
export const bootstrapSession = onCall(CALL_OPTS, async (request) =>
  guard(async () => {
    if (!request.auth) throw errors.unauthenticated();
    const uid = request.auth.uid;
    const token = (request.auth.token ?? {}) as Record<string, unknown>;

    const data = (request.data ?? {}) as {
      displayName?: string;
      phoneNumber?: string;
      timezone?: string;
      referredBy?: string | null;
    };

    const { created } = await bootstrapUser({
      uid,
      email: (token.email as string | undefined) ?? null,
      emailVerified: Boolean(token.email_verified),
      phoneNumber: optionalPhone(data.phoneNumber ?? null, "phoneNumber"),
      displayName: optionalString(data.displayName ?? null, "displayName", { max: 60 }),
      photoURL: (token.picture as string | undefined) ?? null,
      provider: (token.firebase as { sign_in_provider?: string } | undefined)?.sign_in_provider,
      referredBy: optionalString(data.referredBy ?? null, "referredBy", { max: 32 }),
      timezone: optionalString(data.timezone ?? null, "timezone", { max: 60 }) ?? undefined,
    }).catch((error) => {
      // A duplicate race (trigger + callable) is fine — fall through to the claims sync.
      log.warn({ event: "bootstrap_user_race", uid, error: String(error) });
      return { created: false, user: null };
    });

    const [{ user, role, claims }, quota, appConfig] = await Promise.all([
      getUserWithClaims(uid),
      getQuotaSummary(uid),
      getAppConfig(),
    ]);
    await setLastActive(uid);

    return {
      success: true as const,
      data: {
        uid,
        created,
        user,
        role,
        claims,
        quota,
        flags: {
          uploadsEnabled: appConfig.uploadsEnabled,
          aiFiltersEnabled: appConfig.aiFiltersEnabled,
          sharingEnabled: appConfig.sharingEnabled,
          bookingsEnabled: appConfig.bookingsEnabled,
          printOrdersEnabled: appConfig.printOrdersEnabled,
          maintenanceMode: appConfig.maintenanceMode,
          minAppVersion: appConfig.minAppVersion,
          announcement: appConfig.announcement,
        },
      },
      serverTime: new Date().toISOString(),
    };
  })
);

/** Whitelisted profile update (display name, avatar, preferences, push token). */
export const updateUserProfile = onCall(CALL_OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    await enforceRateLimit(ctx.uid, { action: "profile_update", max: 30, window: "hour" });

    const data = (request.data ?? {}) as Record<string, unknown>;
    try {
      const user = await updateProfile(ctx.uid, {
        displayName: data.displayName === undefined ? undefined : optionalString(data.displayName, "displayName", { max: 60 }),
        photoURL: data.photoURL === undefined ? undefined : optionalString(data.photoURL, "photoURL", { max: 512 }),
        preferences: (data.preferences ?? undefined) as Record<string, unknown> | undefined,
        locale: data.locale === undefined ? undefined : optionalString(data.locale, "locale", { max: 16 }),
        deviceToken: data.deviceToken === undefined ? undefined : optionalString(data.deviceToken, "deviceToken", { max: 512 }),
        removeDeviceToken: data.removeDeviceToken === undefined ? undefined : optionalString(data.removeDeviceToken, "removeDeviceToken", { max: 512 }),
      });
      return { success: true as const, data: { user }, serverTime: new Date().toISOString() };
    } catch (error) {
      asHttpsValidationError(error);
    }
  })
);

/** Finish onboarding (used to release the referral bonus exactly once). */
export const finishOnboarding = onCall(CALL_OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const data = (request.data ?? {}) as { lastStep?: number; sessionId?: string };
    const user = await completeOnboarding(ctx.uid, Math.max(0, Math.min(Number(data.lastStep ?? 0) || 0, 20)));

    await logEvents({
      uid: ctx.uid,
      sessionId: requiredString(data.sessionId ?? "unknown", "sessionId", { max: 64 }),
      platform: ctx.platform,
      appVersion: ctx.appVersion,
      events: [{ name: "onboarding_complete", params: { steps: Number(data.lastStep ?? 0) } }],
    }).catch(() => undefined);

    return { success: true as const, data: { user }, serverTime: new Date().toISOString() };
  })
);

/** Force a claims refresh (after an admin grants premium or changes roles). */
export const refreshClaims = onCall(CALL_OPTS, async (request) =>
  guard(async () => {
    if (!request.auth) throw errors.unauthenticated();
    const uid = request.auth.uid;
    await enforceRateLimit(uid, { action: "refresh_claims", max: 60, window: "hour" });
    const claims = await syncClaims(uid);
    const { user } = await getUserWithClaims(uid);
    return {
      success: true as const,
      data: { claims, plan: user?.plan ?? "free", onboardingComplete: user?.onboarding.completed ?? false },
      serverTime: new Date().toISOString(),
    };
  })
);

/**
 * Public (unauthenticated) app-boot payload: version gate + feature flags + filter catalogue.
 * Lets the app decide whether to show a force-update screen before the user even signs in.
 */
export const getAppBootstrap = onCall(
  { ...CALL_OPTS, timeoutSeconds: 20 },
  async (request) =>
    guard(async () => {
      const data = (request.data ?? {}) as { platform?: string; appVersion?: string };
      const appConfig = await getAppConfig();

      const [filters] = await Promise.all([import("../services/filterService").then((m) => m.listFilters(false))]);

      const clientVersion = optionalString(data.appVersion ?? null, "appVersion", { max: 24 }) ?? "0.0.0";
      const needsUpdate = compareVersions(clientVersion, appConfig.minAppVersion) < 0;

      return {
        success: true as const,
        data: {
          flags: {
            uploadsEnabled: appConfig.uploadsEnabled,
            aiFiltersEnabled: appConfig.aiFiltersEnabled,
            sharingEnabled: appConfig.sharingEnabled,
            bookingsEnabled: appConfig.bookingsEnabled,
            printOrdersEnabled: appConfig.printOrdersEnabled,
            maintenanceMode: appConfig.maintenanceMode,
            announcement: appConfig.announcement,
          },
          minAppVersion: appConfig.minAppVersion,
          needsUpdate,
          filters,
          serverTime: new Date().toISOString(),
        },
        serverTime: new Date().toISOString(),
      };
    })
);

/** Semantic-version compare. Returns -1, 0 or 1. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

/** Nothing here should ever throw a raw HttpsError subclass mismatch. */
export { HttpsError };
