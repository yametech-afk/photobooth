/**
 * Analytics service — event persistence + rollups.
 *
 * DESIGN:
 *  - Clients never write `analytics_events` directly (rules forbid it). They POST batches to the
 *    `logAnalyticsEvents` callable, which enforces an ALLOWLIST of event names, clamps every
 *    parameter, and strips dangerous keys. This keeps the collection queryable and the bill small.
 *  - Writes are batched (max 25 per call) and each row carries `expiresAt` for a Firestore TTL
 *    policy, so raw events self-delete after ANALYTICS_RETENTION_DAYS and storage stays bounded.
 *  - `analytics_daily` holds cheap aggregates the admin dashboard reads in one get().
 *  - `metrics/overview` is a denormalised snapshot refreshed by the nightly rollup.
 */
import { db, FieldValue, Timestamp } from "../config/admin";
import {
  ANALYTICS_EVENT_ALLOWLIST,
  ANALYTICS_RETENTION_DAYS,
  COLLECTIONS,
  LIMITS,
  type AnalyticsEventName,
} from "../config/constants";
import { errors } from "../lib/errors";
import { log } from "../lib/logger";
import { dayKey, dayKeyRange } from "../lib/dates";
import { sanitizeAnalyticsParams, requiredString, optionalString, requiredArray, asHttpsValidationError } from "../lib/validation";
import type { AnalyticsDailyDoc, AnalyticsEventDoc } from "../models/types";

const EVENTS = COLLECTIONS.analyticsEvents;
const DAILY = COLLECTIONS.analyticsDaily;
const METRICS = COLLECTIONS.metrics;

export interface AnalyticsEventInput {
  name: string;
  params?: Record<string, unknown>;
  sessionId?: string;
  timestamp?: number | string | null;
  platform?: string;
  appVersion?: string;
  deviceModel?: string | null;
  osVersion?: string | null;
}

export interface LogEventsInput {
  uid: string;
  events: AnalyticsEventInput[];
  sessionId?: string;
  platform?: string;
  appVersion?: string;
}

/** Push a set of validated events. Returns how many were accepted. */
export async function logEvents(input: LogEventsInput): Promise<{ accepted: number; rejected: string[] }> {
  const events = requiredArray(input.events, "events", LIMITS.maxAnalyticsBatch) as AnalyticsEventInput[];
  const rejected: string[] = [];

  try {
    const sessionId = requiredString(input.sessionId ?? "unknown", "sessionId", { max: 64 });
    const platform = optionalString(input.platform ?? null, "platform", { max: 24 }) ?? "unknown";
    const appVersion = optionalString(input.appVersion ?? null, "appVersion", { max: 24 }) ?? "0.0.0";
    const todayKey = dayKey();
    const expiresAt = Timestamp.fromDate(new Date(Date.now() + ANALYTICS_RETENTION_DAYS * 24 * 60 * 60 * 1000));

    const batch = db.batch();
    const counters: Record<string, number> = {};
    let accepted = 0;

    for (const raw of events) {
      const name = String(raw?.name ?? "");
      if (!(ANALYTICS_EVENT_ALLOWLIST as readonly string[]).includes(name)) {
        rejected.push(name || "(missing)");
        continue;
      }
      const ref = db.collection(EVENTS).doc();
      const ts = raw.timestamp ? new Date(raw.timestamp) : new Date();
      const eventDoc: AnalyticsEventDoc = {
        eventId: ref.id,
        uid: input.uid,
        name: name as AnalyticsEventName,
        params: sanitizeAnalyticsParams(raw.params ?? {}),
        sessionId,
        platform,
        appVersion,
        deviceModel: raw.deviceModel ? String(raw.deviceModel).slice(0, 60) : null,
        osVersion: raw.osVersion ? String(raw.osVersion).slice(0, 40) : null,
        dayKey: Number.isNaN(ts.getTime()) ? todayKey : dayKey(ts),
        timestamp: Timestamp.fromDate(Number.isNaN(ts.getTime()) ? new Date() : ts),
        expiresAt,
      };
      batch.set(ref, eventDoc);
      counters[name] = (counters[name] ?? 0) + 1;
      accepted += 1;
    }

    if (accepted === 0) {
      return { accepted: 0, rejected };
    }

    const dailyUpdates: Record<string, unknown> = {
      dayKey: todayKey,
      updatedAt: FieldValue.serverTimestamp(),
    };
    for (const [name, count] of Object.entries(counters)) {
      dailyUpdates[`counts.${name}`] = FieldValue.increment(count);
    }
    batch.set(db.collection(DAILY).doc(todayKey), dailyUpdates, { merge: true });

    await batch.commit();

    log.info({ event: "analytics_logged", uid: input.uid, accepted, rejected: rejected.length, names: Object.keys(counters) });
    return { accepted, rejected };
  } catch (error) {
    asHttpsValidationError(error);
  }
}

/** Increment arbitrary daily counters from other services (bookings, subscriptions, revenue). */
export async function recordDailyCounters(patch: {
  photos?: number;
  uploads?: number;
  bookings?: number;
  subscriptionsStarted?: number;
  subscriptionsCancelled?: number;
  revenueMinorUnits?: number;
  newUsers?: number;
}): Promise<void> {
  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === "number" && value !== 0) updates[key] = FieldValue.increment(value);
  }
  if (Object.keys(updates).length === 1) return;
  await db.collection(DAILY).doc(dayKey()).set({ dayKey: dayKey(), ...updates }, { merge: true });
}

export interface DailyRollupResult {
  dayKey: string;
  counts: Record<string, number>;
  activeUsers: number;
  scanned: number;
}

/**
 * Compute the aggregate document for one day from the raw event stream.
 * Runs nightly for yesterday; also callable on demand for a backfill.
 */
export async function rollupDay(targetDay: string, maxEvents: number = LIMITS.analyticsRollupMaxEvents): Promise<DailyRollupResult> {
  const start = Timestamp.fromDate(new Date(`${targetDay}T00:00:00+08:00`));
  const end = Timestamp.fromDate(new Date(new Date(`${targetDay}T00:00:00+08:00`).getTime() + 24 * 60 * 60 * 1000));

  const snap = await db
    .collection(EVENTS)
    .where("timestamp", ">=", start)
    .where("timestamp", "<", end)
    .limit(maxEvents)
    .get();

  const counts: Record<string, number> = {};
  const uniqueUsers = new Set<string>();
  let revenue = 0;

  for (const doc of snap.docs) {
    const data = doc.data() as AnalyticsEventDoc;
    counts[data.name] = (counts[data.name] ?? 0) + 1;
    uniqueUsers.add(data.uid);
    if (data.name === "purchase_completed" || data.name === "event_booking_completed") {
      const value = data.params.value;
      if (typeof value === "number") revenue += value;
    }
  }

  await db.collection(DAILY).doc(targetDay).set(
    {
      dayKey: targetDay,
      counts,
      activeUsers: uniqueUsers.size,
      revenueMinorUnits: revenue,
      rolledUpAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  log.info({ event: "analytics_rollup", dayKey: targetDay, scanned: snap.size, uniqueUsers: uniqueUsers.size });
  return { dayKey: targetDay, counts, activeUsers: uniqueUsers.size, scanned: snap.size };
}

export async function getDailySeries(days = 30): Promise<AnalyticsDailyDoc[]> {
  const end = new Date();
  const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const keys = dayKeyRange(start, end);
  const refs = keys.map((key) => db.collection(DAILY).doc(key));
  if (refs.length === 0) return [];

  const snaps = await db.getAll(...refs);
  return snaps
    .filter((snap) => snap.exists)
    .map((snap) => snap.data() as AnalyticsDailyDoc);
}

export interface OverviewMetrics {
  users: { total: number; premium: number; studio: number; newToday: number; activeToday: number; suspended: number };
  photos: { total: number; today: number; publicCount: number; flagged: number };
  revenue: { mrrMinorUnits: number; todayMinorUnits: number; lifetimeMinorUnits: number };
  bookings: { total: number; upcoming: number };
  subscriptions: { active: number; cancelled: number; pending: number; churnRatePercent: number };
  generatedAt: string;
}

/**
 * One-call dashboard payload for the admin panel.
 * Uses `count()` aggregations where possible so it stays cheap at scale.
 */
export async function getOverviewMetrics(): Promise<OverviewMetrics> {
  const { getSubscriptionMetrics } = await import("./subscriptionService");
  const currentDay = dayKey();
  const dayStart = Timestamp.fromDate(new Date(`${currentDay}T00:00:00+08:00`));

  const [
    totalUsers,
    premiumUsers,
    studioUsers,
    suspendedUsers,
    newToday,
    totalPhotos,
    photosToday,
    publicPhotos,
    flaggedPhotos,
    totalBookings,
    subscriptions,
    dailySnap,
    paidSubs,
  ] = await Promise.all([
    db.collection(COLLECTIONS.users).count().get(),
    db.collection(COLLECTIONS.users).where("plan", "==", "premium").count().get(),
    db.collection(COLLECTIONS.users).where("plan", "==", "studio").count().get(),
    db.collection(COLLECTIONS.users).where("status", "==", "suspended").count().get(),
    db.collection(COLLECTIONS.users).where("createdAt", ">=", dayStart).count().get(),
    db.collection(COLLECTIONS.photos).where("status", "==", "ready").count().get(),
    db.collection(COLLECTIONS.photos).where("status", "==", "ready").where("createdAt", ">=", dayStart).count().get(),
    db.collection(COLLECTIONS.photos).where("visibility", "==", "public").count().get(),
    db.collection(COLLECTIONS.photos).where("isFlagged", "==", true).count().get(),
    db.collection(COLLECTIONS.bookings).count().get(),
    getSubscriptionMetrics(30),
    db.collection(DAILY).doc(currentDay).get(),
    db.collection(COLLECTIONS.subscriptions).where("status", "==", "active").get(),
  ]);

  const daily = dailySnap.exists ? (dailySnap.data() as AnalyticsDailyDoc & { activeUserIds?: Record<string, boolean> }) : null;
  const activeToday = daily?.activeUsers ?? Object.keys(daily?.activeUserIds ?? {}).length;
  const lifetimeRevenue = paidSubs.docs.reduce(
    (sum, d) => sum + Number((d.data() as { amountMinorUnits?: number }).amountMinorUnits ?? 0),
    0
  );

  const metrics: OverviewMetrics = {
    users: {
      total: totalUsers.data().count,
      premium: premiumUsers.data().count,
      studio: studioUsers.data().count,
      newToday: newToday.data().count,
      activeToday,
      suspended: suspendedUsers.data().count,
    },
    photos: {
      total: totalPhotos.data().count,
      today: photosToday.data().count,
      publicCount: publicPhotos.data().count,
      flagged: flaggedPhotos.data().count,
    },
    revenue: {
      mrrMinorUnits: subscriptions.mrrMinorUnits,
      todayMinorUnits: daily?.revenueMinorUnits ?? 0,
      lifetimeMinorUnits: lifetimeRevenue,
    },
    bookings: {
      total: totalBookings.data().count,
      upcoming: 0,
    },
    subscriptions: {
      active: subscriptions.active,
      cancelled: subscriptions.cancelled,
      pending: subscriptions.pending,
      churnRatePercent: subscriptions.churnRatePercent,
    },
    generatedAt: new Date().toISOString(),
  };

  await db.collection(METRICS).doc("overview").set(
    { ...metrics, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  return metrics;
}

/**
 * Growth funnel for a period: onboarding → first capture → share → purchase.
 * Reads the aggregate counters, so it is exact only for rolled-up days (today is partial).
 */
export async function getFunnel(days = 30): Promise<{ stage: string; count: number }[]> {
  const series = await getDailySeries(days);
  const totals: Record<string, number> = {};
  for (const day of series) {
    for (const [name, count] of Object.entries(day.counts ?? {})) {
      totals[name] = (totals[name] ?? 0) + Number(count ?? 0);
    }
  }
  return [
    { stage: "sign_up", count: totals.sign_up ?? 0 },
    { stage: "onboarding_complete", count: totals.onboarding_complete ?? 0 },
    { stage: "photo_captured", count: totals.photo_captured ?? 0 },
    { stage: "photo_upload_completed", count: totals.photo_upload_completed ?? 0 },
    { stage: "photo_shared", count: totals.photo_shared ?? 0 },
    { stage: "paywall_viewed", count: totals.paywall_viewed ?? 0 },
    { stage: "purchase_completed", count: totals.purchase_completed ?? 0 },
  ];
}

/** Admin-only: a page of raw events for a user (support debugging). */
export async function getUserEvents(uid: string, limit: number = 50): Promise<AnalyticsEventDoc[]> {
  const snap = await db
    .collection(EVENTS)
    .where("uid", "==", uid)
    .orderBy("timestamp", "desc")
    .limit(Math.min(limit, LIMITS.maxPageSize))
    .get();
  return snap.docs.map((d) => d.data() as AnalyticsEventDoc);
}

/** Admin-only: top event names in a period. */
export async function getTopEvents(days = 7, limit = 15): Promise<{ name: string; count: number }[]> {
  const series = await getDailySeries(days);
  const totals: Record<string, number> = {};
  for (const day of series) {
    for (const [name, count] of Object.entries(day.counts ?? {})) {
      totals[name] = (totals[name] ?? 0) + Number(count ?? 0);
    }
  }
  return Object.entries(totals)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function isAllowedEventName(name: string): boolean {
  return (ANALYTICS_EVENT_ALLOWLIST as readonly string[]).includes(name);
}

export function allowedEventNames(): readonly string[] {
  return ANALYTICS_EVENT_ALLOWLIST;
}

export { errors };
