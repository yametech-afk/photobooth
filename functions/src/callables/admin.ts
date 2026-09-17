/**
 * Admin panel callables.
 *
 * Every handler resolves the caller's LIVE role from `adminRoles` (never trusting the claim),
 * checks an explicit permission string, and writes an audit row. This is the only surface the
 * admin dashboard uses for privileged reads and writes.
 */
import { onCall } from "firebase-functions/v2/https";
import { ADMIN_ROLES, COLLECTIONS, LIMITS, PLANS, REGION, type AdminRole, type PlanId } from "../config/constants";
import { guard, errors } from "../lib/errors";
import { resolveContext, requireAdmin, requirePermission } from "../lib/context";
import { enforceRateLimit } from "../lib/rateLimit";
import {
  asHttpsValidationError,
  optionalInt,
  optionalPhone,
  optionalString,
  requiredEnum,
  requiredInt,
  requiredString,
} from "../lib/validation";
import { log } from "../lib/logger";
import { db, FieldValue, Timestamp } from "../config/admin";
import { deleteUserAccount, grantAdminRole, listAdminRoles, revokeAdminRole, setUserStatus, syncClaims } from "../services/userService";
import { getLedger, grantCredits, refund, setPlan } from "../services/quotaService";
import { getFunnel, getOverviewMetrics, getTopEvents, getUserEvents } from "../services/analyticsService";
import { seedConfigDocuments, invalidateConfigCache } from "../services/configService";
import { seedFilters } from "../services/filterService";
import { writeAudit, AUDIT_ACTIONS } from "../lib/audit";
import { startOfDay } from "../lib/dates";
import type { AdminRoleDoc, UserDoc } from "../models/types";

const OPTS = { region: REGION, cors: true, timeoutSeconds: 60, memory: "512MiB" as const };

// ------------------------------------------------------------------ dashboard

/** One call powering the whole admin home screen. */
export const adminGetDashboard = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const admin = requireAdmin(ctx, ["superadmin", "admin", "support", "moderator"]);

    const [overview, funnel, topEvents] = await Promise.all([
      getOverviewMetrics(),
      getFunnel(30),
      getTopEvents(7, 12),
    ]);

    return {
      success: true as const,
      data: { overview, funnel, topEvents, role: admin.role, permissions: admin.permissions },
      serverTime: new Date().toISOString(),
    };
  })
);

export const adminGetAnalytics = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    requirePermission(ctx, "analytics:read");
    const data = (request.data ?? {}) as { days?: number };
    const days = optionalInt(data.days, "days", { min: 1, max: 365 }) ?? 30;
    const { getDailySeries } = await import("../services/analyticsService");
    const [series, funnel, topEvents] = await Promise.all([getDailySeries(days), getFunnel(days), getTopEvents(days, 20)]);
    return { success: true as const, data: { series, funnel, topEvents }, serverTime: new Date().toISOString() };
  })
);

/** Support tool: recent raw events for one user. */
export const adminGetUserEvents = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    requirePermission(ctx, "users:read");
    const data = (request.data ?? {}) as { uid?: string; limit?: number };
    const events = await getUserEvents(
      requiredString(data.uid, "uid", { max: 128 }),
      optionalInt(data.limit, "limit", { min: 1, max: 100 }) ?? 50
    );
    return { success: true as const, data: { events }, serverTime: new Date().toISOString() };
  })
);

// ------------------------------------------------------------------ users

export interface AdminUserRow {
  uid: string;
  email: string | null;
  displayName: string;
  plan: PlanId;
  status: string;
  role: AdminRole | null;
  createdAt: string | null;
  lastActiveAt: string | null;
  totalPhotosTaken: number;
  creditsRemaining: number | null;
  subscriptionStatus: string | null;
}

/** Paginated user list with plan/status/search filters. */
export const adminListUsers = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    requirePermission(ctx, "users:read");
    await enforceRateLimit(ctx.uid, "admin_bulk");

    const data = (request.data ?? {}) as Record<string, unknown>;
    const limit = requiredInt(data.limit, "limit", { min: 1, max: LIMITS.maxPageSize, fallback: 25 });
    const plan = optionalString(data.plan ?? null, "plan", { max: 16 });
    const status = optionalString(data.status ?? null, "status", { max: 16 });
    const search = optionalString(data.search ?? null, "search", { max: 120 });
    const cursor = optionalString(data.cursor ?? null, "cursor", { max: 128 });

    let query: FirebaseFirestore.Query = db.collection(COLLECTIONS.users);
    if (plan) query = query.where("plan", "==", plan);
    if (status) query = query.where("status", "==", status);

    if (cursor) {
      const cursorSnap = await db.collection(COLLECTIONS.users).doc(cursor).get();
      if (cursorSnap.exists) query = query.startAfter(cursorSnap);
    }

    // Email prefix search requires a range query; combine with the filters above.
    if (search) {
      query = query.where("email", ">=", search.toLowerCase()).where("email", "<=", `${search.toLowerCase()}\uf8ff`);
    }

    const snap = await query.orderBy("createdAt", "desc").limit(limit + 1).get();
    const hasMore = snap.size > limit;
    const docs = hasMore ? snap.docs.slice(0, limit) : snap.docs;

    // Join quota + subscription so the table renders in one round trip.
    const quotas = await db.getAll(...docs.map((d) => db.collection(COLLECTIONS.quotas).doc(d.id))).catch(() => []);

    const items: AdminUserRow[] = docs.map((doc, index) => {
      const user = doc.data() as UserDoc;
      const quotaSnap = quotas[index];
      const quota = quotaSnap?.exists ? (quotaSnap.data() as { creditsRemaining?: number }) : null;
      return {
        uid: doc.id,
        email: user.email,
        displayName: user.displayName,
        plan: user.plan,
        status: user.status,
        role: user.role ?? null,
        createdAt: user.createdAt?.toDate?.()?.toISOString() ?? null,
        lastActiveAt: user.lastActiveAt?.toDate?.()?.toISOString() ?? null,
        totalPhotosTaken: user.counters?.totalPhotosTaken ?? 0,
        creditsRemaining: quota?.creditsRemaining ?? null,
        subscriptionStatus: user.subscriptionId ? "linked" : null,
      };
    });

    return {
      success: true as const,
      data: { items, nextCursor: hasMore ? docs[docs.length - 1].id : null, total: items.length },
      serverTime: new Date().toISOString(),
    };
  })
);

/** Full user detail for the admin drawer, including recent credit movements. */
export const adminGetUserDetail = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    requirePermission(ctx, "users:read");
    const data = (request.data ?? {}) as { uid?: string };
    const uid = requiredString(data.uid, "uid", { max: 128 });

    const [userSnap, quotaSnap, ledger, subsSnap, photosCount] = await Promise.all([
      db.collection(COLLECTIONS.users).doc(uid).get(),
      db.collection(COLLECTIONS.quotas).doc(uid).get(),
      getLedger(uid, 25),
      db.collection(COLLECTIONS.subscriptions).where("uid", "==", uid).orderBy("createdAt", "desc").limit(10).get(),
      db.collection(COLLECTIONS.photos).where("uid", "==", uid).count().get(),
    ]);

    if (!userSnap.exists) throw errors.notFound("Hindi mahanap ang user.");
    return {
      success: true as const,
      data: {
        user: userSnap.data() as UserDoc,
        quota: quotaSnap.exists ? quotaSnap.data() : null,
        ledger,
        subscriptions: subsSnap.docs.map((d) => d.data()),
        photoCount: photosCount.data().count,
      },
      serverTime: new Date().toISOString(),
    };
  })
);

export const adminSuspendUser = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const admin = requirePermission(ctx, "users:write");
    const data = (request.data ?? {}) as { uid?: string; suspend?: boolean; reason?: string };
    const uid = requiredString(data.uid, "uid", { max: 128 });
    if (uid === admin.uid) throw errors.failedPrecondition("Hindi mo maaaring i-suspend ang sarili mo.");

    await setUserStatus({
      actorUid: admin.uid,
      targetUid: uid,
      status: data.suspend === false ? "active" : "suspended",
      reason: optionalString(data.reason ?? null, "reason", { max: 300 }),
    });
    return { success: true as const, data: { uid, suspended: data.suspend !== false }, serverTime: new Date().toISOString() };
  })
);

export const adminDeleteUser = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const admin = requirePermission(ctx, "users:write");
    const data = (request.data ?? {}) as { uid?: string; confirm?: string; reason?: string };
    const uid = requiredString(data.uid, "uid", { max: 128 });
    // Two-step confirmation: the client must echo the uid.
    if (data.confirm !== uid) throw errors.invalidArgument("Kailangan i-confirm sa pamamagitan ng pag-ulit ng uid.");

    const result = await deleteUserAccount({ actorUid: admin.uid, targetUid: uid, reason: optionalString(data.reason ?? null, "reason", { max: 300 }) });
    return { success: true as const, data: result, serverTime: new Date().toISOString() };
  })
);

export const adminSetUserPlan = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const admin = requirePermission(ctx, "users:plan");
    const data = (request.data ?? {}) as Record<string, unknown>;
    const uid = requiredString(data.uid, "uid", { max: 128 });
    const plan = requiredEnum(data.plan, "plan", ["free", "premium", "studio"], "premium") as PlanId;
    const reason = requiredString(data.reason ?? "Admin plan change", "reason", { max: 300 });

    const quota = await setPlan({ uid, plan, actorUid: admin.uid, reason, premiumUntil: null, resetCredits: true });
    log.warn({ event: "admin_plan_change", actor: admin.uid, uid, plan, credits: quota.creditsRemaining });
    return {
      success: true as const,
      data: { uid, plan, creditsRemaining: quota.creditsRemaining, dailyLimit: quota.dailyLimit, planLabel: PLANS[plan].label },
      serverTime: new Date().toISOString(),
    };
  })
);

/** Grant or remove credits (support goodwill / promo). */
export const adminAdjustCredits = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const admin = requirePermission(ctx, "users:credits");
    const data = (request.data ?? {}) as Record<string, unknown>;
    const uid = requiredString(data.uid, "uid", { max: 128 });
    const amount = requiredInt(data.amount, "amount", { min: -100000, max: 100000 });
    const reason = requiredString(data.reason, "reason", { max: 300 });

    if (amount === 0) throw errors.invalidArgument("Hindi maaaring 0 ang amount.");
    const result =
      amount > 0
        ? await grantCredits(uid, amount, { action: "admin_grant", reason, refType: "admin", refId: admin.uid })
        : await refund({ uid, amount: Math.abs(amount), action: "admin_deduct", reason, refType: "admin", refId: admin.uid });

    return { success: true as const, data: result, serverTime: new Date().toISOString() };
  })
);

// ------------------------------------------------------------------ admin roles

export const adminListRoles = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    requirePermission(ctx, "admins:read");
    const roles: AdminRoleDoc[] = await listAdminRoles();
    return { success: true as const, data: { roles, available: ADMIN_ROLES }, serverTime: new Date().toISOString() };
  })
);

export const adminGrantRole = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const admin = requireAdmin(ctx, ["superadmin"]);
    const data = (request.data ?? {}) as Record<string, unknown>;
    const role = requiredEnum(data.role, "role", ADMIN_ROLES, "support") as AdminRole;
    const doc = await grantAdminRole({
      actorUid: admin.uid,
      actorEmail: admin.email,
      targetUid: requiredString(data.uid, "uid", { max: 128 }),
      role,
      notes: optionalString(data.notes ?? null, "notes", { max: 300 }),
    });
    return { success: true as const, data: { role: doc }, serverTime: new Date().toISOString() };
  })
);

export const adminRevokeRole = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const admin = requireAdmin(ctx, ["superadmin"]);
    const data = (request.data ?? {}) as { uid?: string; reason?: string };
    await revokeAdminRole({
      actorUid: admin.uid,
      actorEmail: admin.email,
      targetUid: requiredString(data.uid, "uid", { max: 128 }),
      reason: optionalString(data.reason ?? null, "reason", { max: 300 }),
    });
    return { success: true as const, data: { revoked: true }, serverTime: new Date().toISOString() };
  })
);

// ------------------------------------------------------------------ audit

export const adminListAuditLogs = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    requirePermission(ctx, "audit:read");
    const data = (request.data ?? {}) as { limit?: number; targetType?: string; actorUid?: string };

    let query: FirebaseFirestore.Query = db.collection(COLLECTIONS.auditLogs);
    const targetType = optionalString(data.targetType ?? null, "targetType", { max: 40 });
    const actorUid = optionalString(data.actorUid ?? null, "actorUid", { max: 128 });
    if (targetType) query = query.where("targetType", "==", targetType);
    if (actorUid) query = query.where("actorUid", "==", actorUid);

    const snap = await query
      .orderBy("createdAt", "desc")
      .limit(requiredInt(data.limit, "limit", { min: 1, max: 200, fallback: 50 }))
      .get();

    return {
      success: true as const,
      data: { logs: snap.docs.map((d) => ({ id: d.id, ...d.data() })) },
      serverTime: new Date().toISOString(),
    };
  })
);

// ------------------------------------------------------------------ config / maintenance

export const adminGetConfig = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    requirePermission(ctx, "settings:write");
    const { getAppConfig, getBookingPolicy, getCreditCosts, getSubscriptionProducts } = await import("../services/configService");
    const [app, bookingPolicy, credits, products] = await Promise.all([
      getAppConfig(),
      getBookingPolicy(),
      getCreditCosts(),
      getSubscriptionProducts(),
    ]);
    return { success: true as const, data: { app, bookingPolicy, credits, products: products.all, plans: PLANS }, serverTime: new Date().toISOString() };
  })
);

export const adminUpdateConfig = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const admin = requireAdmin(ctx, ["superadmin"]);
    const data = (request.data ?? {}) as { key?: string; patch?: Record<string, unknown> };
    const key = requiredEnum(data.key, "key", ["app", "creditCosts", "bookingPolicy", "subscriptionProducts"], "app");
    if (!data.patch || typeof data.patch !== "object") throw errors.invalidArgument("Kailangan ang patch object.");

    const path = key === "app" ? "config/app" : key === "creditCosts" ? "config/creditCosts" : key === "bookingPolicy" ? "config/bookingPolicy" : "config/subscriptionProducts";
    await db.doc(path).set({ ...data.patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    invalidateConfigCache();

    await writeAudit({
      actorUid: admin.uid,
      action: AUDIT_ACTIONS.notificationSent,
      targetType: "config",
      targetId: path,
      after: data.patch,
      reason: "config_update",
    });

    log.warn({ event: "admin_config_updated", actor: admin.uid, path, keys: Object.keys(data.patch) });
    return { success: true as const, data: { updated: true, path }, serverTime: new Date().toISOString() };
  })
);

/** One-time (idempotent) bootstrap of the config + filter documents on a fresh project. */
export const adminSeedCatalog = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const admin = requireAdmin(ctx, ["superadmin"]);
    const data = (request.data ?? {}) as { force?: boolean };
    const force = Boolean(data.force);

    const [configDocs, filtersWritten] = await Promise.all([seedConfigDocuments(force), seedFilters(force)]);
    log.warn({ event: "catalog_seeded", actor: admin.uid, configDocs, filtersWritten });
    return { success: true as const, data: { configDocs, filtersWritten }, serverTime: new Date().toISOString() };
  })
);

// ------------------------------------------------------------------ notifications

export const adminSendNotification = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const admin = requirePermission(ctx, "notifications:write");
    const data = (request.data ?? {}) as Record<string, unknown>;

    const audience = requiredEnum(data.audience, "audience", ["all", "free", "premium", "single"], "all");
    const title = requiredString(data.title, "title", { max: 80 });
    const body = requiredString(data.body, "body", { max: 240 });
    const targetUid = audience === "single" ? requiredString(data.targetUid, "targetUid", { max: 128 }) : null;

    const ref = db.collection(COLLECTIONS.notifications).doc();
    await ref.set({
      notificationId: ref.id,
      title,
      body,
      type: requiredEnum(data.type ?? "info", "type", ["info", "promo", "system", "booking"], "info"),
      targetUid,
      targetAudience: audience,
      deepLink: optionalString(data.deepLink ?? null, "deepLink", { max: 300 }),
      createdBy: admin.uid,
      sentAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    });

    // Fan out to device tokens (FCM). Kept best-effort so a bad token never fails the admin call.
    let delivered = 0;
    try {
      let tokens: string[] = [];
      if (audience === "single" && targetUid) {
        const snap = await db.collection(COLLECTIONS.users).doc(targetUid).get();
        tokens = ((snap.data() as UserDoc | undefined)?.deviceTokens ?? []).slice(0, 20);
      } else {
        let query: FirebaseFirestore.Query = db.collection(COLLECTIONS.users);
        if (audience === "free") query = query.where("plan", "==", "free");
        if (audience === "premium") query = query.where("plan", "in", ["premium", "studio"]);
        const snap = await query.limit(500).get();
        tokens = snap.docs.flatMap((d) => ((d.data() as UserDoc).deviceTokens ?? []).slice(0, 1));
      }

      if (tokens.length > 0) {
        const { getMessaging } = await import("firebase-admin/messaging");
        const response = await getMessaging().sendEachForMulticast({
          tokens: tokens.slice(0, 500),
          notification: { title, body },
          data: { type: "broadcast", deepLink: String(data.deepLink ?? "") },
        });
        delivered = response.successCount;
      }
    } catch (error) {
      log.warn({ event: "notification_fanout_failed", error: String(error) });
    }

    await writeAudit({
      actorUid: admin.uid,
      action: AUDIT_ACTIONS.notificationSent,
      targetType: "notification",
      targetId: ref.id,
      after: { audience, title, delivered },
    });

    return { success: true as const, data: { notificationId: ref.id, delivered }, serverTime: new Date().toISOString() };
  })
);

export const adminListNotifications = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    requirePermission(ctx, "notifications:write");
    const snap = await db.collection(COLLECTIONS.notifications).orderBy("createdAt", "desc").limit(50).get();
    return { success: true as const, data: { notifications: snap.docs.map((d) => d.data()) }, serverTime: new Date().toISOString() };
  })
);

// ------------------------------------------------------------------ revenue

export const adminGetRevenue = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    requirePermission(ctx, "subscriptions:read");
    const data = (request.data ?? {}) as { days?: number };
    const days = optionalInt(data.days, "days", { min: 1, max: 365 }) ?? 30;
    const since = Timestamp.fromDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));

    const [subsSnap, recentSubs, dailySince, metrics] = await Promise.all([
      db.collection(COLLECTIONS.subscriptions).where("status", "==", "active").get(),
      db.collection(COLLECTIONS.subscriptions).where("createdAt", ">=", since).orderBy("createdAt", "desc").limit(50).get(),
      db.collection(COLLECTIONS.analyticsDaily).where("dayKey", ">=", startOfDay(new Date(Date.now() - days * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10)).limit(400).get(),
      import("../services/subscriptionService").then((m) => m.getSubscriptionMetrics(days)),
    ]);

    const { getBookingMetrics } = await import("../services/bookingService");
    const bookingMetrics = await getBookingMetrics(days);

    const lifetime = subsSnap.docs.reduce((sum, d) => sum + Number((d.data() as { amountMinorUnits?: number }).amountMinorUnits ?? 0), 0);
    const byPlatform: Record<string, { count: number; amountMinorUnits: number }> = {};
    for (const doc of subsSnap.docs) {
      const sub = doc.data() as { platform?: string; amountMinorUnits?: number };
      const key = sub.platform ?? "unknown";
      byPlatform[key] = byPlatform[key] ?? { count: 0, amountMinorUnits: 0 };
      byPlatform[key].count += 1;
      byPlatform[key].amountMinorUnits += Number(sub.amountMinorUnits ?? 0);
    }

    return {
      success: true as const,
      data: {
        revenue: {
          mrrMinorUnits: metrics.mrrMinorUnits,
          lifetimeMinorUnits: lifetime,
          arpuMinorUnits: subsSnap.size > 0 ? Math.round(lifetime / subsSnap.size) : 0,
          byPlatform,
          bookingsRevenueMinorUnits: bookingMetrics.revenueMinorUnits,
        },
        subscriptions: metrics,
        bookings: bookingMetrics,
        recent: recentSubs.docs.map((d) => d.data()),
        daily: dailySince.docs.map((d) => d.data()),
        currency: PLANS.premium.currency,
      },
      serverTime: new Date().toISOString(),
    };
  })
);

/** Manual refund (flags the record; the actual money movement happens in the store console). */
export const adminRefundSubscription = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const admin = requirePermission(ctx, "subscriptions:write");
    const data = (request.data ?? {}) as { subscriptionId?: string; reason?: string };
    const { expireSubscription } = await import("../services/subscriptionService");
    const subscriptionId = requiredString(data.subscriptionId, "subscriptionId", { max: 160 });

    const result = await expireSubscription({
      subscriptionId,
      reason: optionalString(data.reason ?? null, "reason", { max: 300 }) ?? `Refunded by ${admin.uid}`,
      status: "refunded",
      actorUid: admin.uid,
    });
    return { success: true as const, data: result, serverTime: new Date().toISOString() };
  })
);

/** Force a claims refresh for any user (fixes a client stuck on stale premium). */
export const adminSyncUserClaims = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    requirePermission(ctx, "users:write");
    const data = (request.data ?? {}) as { uid?: string };
    const uid = requiredString(data.uid, "uid", { max: 128 });
    const claims = await syncClaims(uid);
    return { success: true as const, data: { claims }, serverTime: new Date().toISOString() };
  })
);

export { optionalPhone };
