/**
 * Scheduled jobs (Cloud Scheduler → Cloud Functions v2).
 *
 * WHY THESE EXIST
 *  - Lazy rollovers in `quotaService` handle timezone resets for ACTIVE users; the scheduler
 *    repairs users who did not open the app (otherwise their daily/monthly counters look stale
 *    in the admin dashboard).
 *  - Subscriptions must lapse even if a store webhook is never delivered. `sweepSubscriptions`
 *    is the safety net; it is idempotent so double delivery is harmless.
 *  - Storage cost control: abandoned upload reservations and expired share links are purged.
 *  - Analytics: raw events self-expire via Firestore TTL; the nightly rollup materialises the
 *    aggregates the admin dashboard reads, and prunes the daily-user arrays it built.
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import { REGION, COLLECTIONS, LIMITS, PLANS } from "../config/constants";
import { db, bucket, FieldValue, Timestamp } from "../config/admin";
import { log } from "../lib/logger";
import { dayKey, monthKey, previousDayKey, startOfDay } from "../lib/dates";
import { expireLapsedSubscriptions } from "../services/subscriptionService";
import { rollupDay } from "../services/analyticsService";
import { ensureQuota } from "../services/quotaService";
import type { QuotaDoc, UploadReservationDoc } from "../models/types";

const JOB_OPTS = { region: REGION, timeZone: "Asia/Manila", memory: "512MiB" as const, timeoutSeconds: 540 };

/**
 * 00:05 Asia/Manila daily — reset daily counters and monthly allowances.
 * Processes users in pages so the job stays inside the 9-minute function limit; the cursor is
 * the last uid processed, stored in `metrics/rollupState`.
 */
export const dailyQuotaReset = onSchedule(
  { ...JOB_OPTS, schedule: "5 0 * * *" },
  async () => {
    const today = dayKey();
    const thisMonth = monthKey();
    const startCursor = await readState("quotaResetCursor");
    let processed = 0;
    let resetDaily = 0;
    let resetMonthly = 0;
    let cursor = startCursor;
    let done = false;

    while (!done && processed < 5000) {
      let query: FirebaseFirestore.Query = db.collection(COLLECTIONS.quotas).orderBy("__name__").limit(400);
      if (cursor) query = query.startAfter(cursor);

      const snap = await query.get();
      if (snap.empty) {
        done = true;
        break;
      }

      const batch = db.batch();
      for (const doc of snap.docs) {
        const quota = doc.data() as QuotaDoc;
        cursor = doc.id;
        processed += 1;

        if (quota.dayKey !== today || quota.monthKey !== thisMonth) {
          const plan = PLANS[quota.plan ?? "free"] ?? PLANS.free;
          const patch: Record<string, unknown> = {
            dayKey: today,
            dailyCount: 0,
            dailyLimit: plan.maxPhotosPerDay,
            updatedAt: FieldValue.serverTimestamp(),
          };
          if (quota.monthKey !== thisMonth) {
            patch.monthKey = thisMonth;
            patch.creditsGranted = plan.monthlyCredits;
            patch.creditsRemaining = plan.monthlyCredits;
            patch.creditsSpent = 0;
            patch.periodStart = Timestamp.fromDate(startOfDay());
            patch.periodEnd = Timestamp.fromDate(new Date(Date.now() + 31 * 24 * 60 * 60 * 1000));
            patch.lastResetAt = FieldValue.serverTimestamp();
            resetMonthly += 1;
          }
          batch.set(doc.ref, patch, { merge: true });
          resetDaily += 1;
        }
      }

      await batch.commit();
      if (snap.size < 400) done = true;
    }

    await writeState("quotaResetCursor", done ? null : cursor, { processed, resetDaily, resetMonthly, day: today });
    log.info({ event: "quota_reset_sweep", day: today, processed, resetDaily, resetMonthly, complete: done });
  }
);

/**
 * 02:00 Asia/Manila daily — expire subscriptions whose period ended (safety net for missed
 * store webhooks) and send the 3-day pre-expiry reminder.
 */
export const sweepSubscriptions = onSchedule({ ...JOB_OPTS, schedule: "0 2 * * *" }, async () => {
  const result = await expireLapsedSubscriptions();

  // Pre-expiry reminders for subscriptions ending within 3 days.
  const soon = Timestamp.fromDate(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));
  const ending = await db
    .collection(COLLECTIONS.subscriptions)
    .where("status", "==", "active")
    .where("expiresAt", "<=", soon)
    .limit(200)
    .get();

  let reminded = 0;
  for (const doc of ending.docs) {
    const sub = doc.data() as { uid: string };
    const userSnap = await db.collection(COLLECTIONS.users).doc(sub.uid).get();
    const tokens = ((userSnap.data() as { deviceTokens?: string[] } | undefined)?.deviceTokens ?? []).slice(0, 3);
    if (tokens.length === 0) continue;
    try {
      const { getMessaging } = await import("firebase-admin/messaging");
      await getMessaging().sendEachForMulticast({
        tokens,
        notification: {
          title: "Malapit nang mag-expire ang premium mo",
          body: "I-renew ngayon para hindi maputol ang unlimited na litrato at AI filters.",
        },
        data: { type: "subscription_expiring" },
      });
      reminded += 1;
    } catch (error) {
      log.debug({ event: "expiry_reminder_failed", uid: sub.uid, error: String(error) });
    }
  }

  log.info({ event: "subscription_sweep", ...result, reminded });
});

/**
 * 01:30 Asia/Manila daily — roll up yesterday's analytics and refresh the dashboard snapshot.
 * Raw rows remain queryable until their TTL expires (ANALYTICS_RETENTION_DAYS).
 */
export const analyticsRollup = onSchedule({ ...JOB_OPTS, schedule: "30 1 * * *" }, async () => {
  const target = previousDayKey();
  const result = await rollupDay(target);

  // Refresh the denormalised dashboard snapshot so the first admin page load is instant.
  const { getOverviewMetrics } = await import("../services/analyticsService");
  const overview = await getOverviewMetrics();

  log.info({ event: "analytics_rollup_job", day: target, scanned: result.scanned, activeUsers: result.activeUsers, users: overview.users.total });
});

/**
 * Every 6 hours — housekeeping:
 *  • expire stale upload reservations (a client that died mid-upload)
 *  • remove the Storage object a stale reservation pointed at
 *  • purge share links that lapsed more than a day ago
 */
export const housekeepingSweep = onSchedule({ ...JOB_OPTS, schedule: "0 */6 * * *" }, async () => {
  const now = Timestamp.now();

  // --- stale reservations -------------------------------------------------
  const stale = await db
    .collection(COLLECTIONS.uploadReservations)
    .where("status", "==", "pending")
    .where("expiresAt", "<=", now)
    .limit(300)
    .get();

  let reservationsExpired = 0;
  for (const doc of stale.docs) {
    const reservation = doc.data() as UploadReservationDoc;
    try {
      const file = bucket().file(reservation.storagePath);
      const [exists] = await file.exists();
      if (exists) {
        const [meta] = await file.getMetadata();
        const updated = meta.updated ? new Date(meta.updated).getTime() : 0;
        // Only delete bytes that were never finalised (older than the reservation window).
        if (Date.now() - updated > LIMITS.uploadReservationTtlMinutes * 60 * 1000) {
          await file.delete();
        }
      }
      await doc.ref.set({ status: "expired", expiredAt: FieldValue.serverTimestamp() }, { merge: true });
      await db.collection(COLLECTIONS.photos).doc(reservation.photoId).set({ status: "failed" }, { merge: true }).catch(() => undefined);
      reservationsExpired += 1;
    } catch (error) {
      log.warn({ event: "reservation_cleanup_failed", reservationId: doc.id, error: String(error) });
    }
  }

  // --- expired shares -----------------------------------------------------
  const lapsedShares = await db
    .collection(COLLECTIONS.photoShares)
    .where("revoked", "==", false)
    .where("expiresAt", "<=", now)
    .limit(500)
    .get();

  let sharesRevoked = 0;
  for (const doc of lapsedShares.docs) {
    await doc.ref
      .set({ revoked: true, revokedAt: FieldValue.serverTimestamp(), revokedReason: "auto_expired" }, { merge: true })
      .catch(() => undefined);
    sharesRevoked += 1;
  }

  // --- orphaned public mirrors -------------------------------------------
  // Photos whose visibility dropped back to private should not keep a public copy.
  const [publicFiles] = await bucket().getFiles({ prefix: "public/photos/", maxResults: 1000 });
  let mirrorsRemoved = 0;
  for (const file of publicFiles) {
    const photoId = file.name.replace("public/photos/", "").replace(/\.jpg$/, "");
    const snap = await db.collection(COLLECTIONS.photos).doc(photoId).get();
    if (!snap.exists) {
      await file.delete().catch(() => undefined);
      mirrorsRemoved += 1;
      continue;
    }
    const photo = snap.data() as { visibility?: string };
    // A live share link keeps the mirror; otherwise a private photo should not be world-readable.
    const activeShare = await db
      .collection(COLLECTIONS.photoShares)
      .where("photoId", "==", photoId)
      .where("revoked", "==", false)
      .limit(1)
      .get();
    if (photo.visibility === "private" && activeShare.empty) {
      await file.delete().catch(() => undefined);
      mirrorsRemoved += 1;
    }
  }

  log.info({ event: "housekeeping_sweep", reservationsExpired, sharesRevoked, mirrorsRemoved });
});

/**
 * Weekly (Monday 03:00) — recompute user-facing quality metrics and stamp the
 * `metrics/overview` doc with a 7-day comparison the dashboard renders.
 */
export const weeklyMetrics = onSchedule({ ...JOB_OPTS, schedule: "0 3 * * 1" }, async () => {
  const { getSubscriptionMetrics } = await import("../services/subscriptionService");
  const { getBookingMetrics } = await import("../services/bookingService");
  const { getTopEvents } = await import("../services/analyticsService");

  const [subs, bookings, topEvents] = await Promise.all([getSubscriptionMetrics(7), getBookingMetrics(7), getTopEvents(7, 10)]);

  await db.collection(COLLECTIONS.metrics).doc("weekly").set(
    {
      weekEnding: dayKey(),
      subscriptions: subs,
      bookings,
      topEvents,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  log.info({ event: "weekly_metrics", active: subs.active, mrr: subs.mrrMinorUnits, bookings: bookings.total });
});

/**
 * Every hour — repair quota documents that are missing entirely (a user created before the
 * trigger existed, or a failed bootstrap). Bounded work, safe to run often.
 */
export const quotaRepair = onSchedule(
  { ...JOB_OPTS, schedule: "15 * * * *", timeoutSeconds: 300 },
  async () => {
    const usersSnap = await db.collection(COLLECTIONS.users).orderBy("createdAt", "desc").limit(200).get();
    let repaired = 0;

    for (const doc of usersSnap.docs) {
      const quotaSnap = await db.collection(COLLECTIONS.quotas).doc(doc.id).get();
      if (quotaSnap.exists) {
        await ensureQuota(doc.id, (doc.data() as { plan?: "free" | "premium" | "studio" }).plan ?? "free").catch(() => undefined);
        continue;
      }
      const user = doc.data() as { plan?: "free" | "premium" | "studio" };
      await ensureQuota(doc.id, user.plan ?? "free");
      repaired += 1;
    }

    if (repaired > 0) log.warn({ event: "quota_repaired", count: repaired });
  }
);

// ------------------------------------------------------------------ state helpers

async function readState(key: string): Promise<string | null> {
  const snap = await db.collection(COLLECTIONS.metrics).doc("rollupState").get();
  return (snap.data()?.[key] as string | null) ?? null;
}

async function writeState(key: string, value: string | null, meta: Record<string, unknown> = {}): Promise<void> {
  await db.collection(COLLECTIONS.metrics).doc("rollupState").set(
    { [key]: value, [`${key}Meta`]: { ...meta, at: new Date().toISOString() }, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}
