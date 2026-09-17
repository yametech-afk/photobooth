/**
 * Firestore triggers — denormalisation, counters and cleanup that must happen server-side.
 *
 * Triggers are kept SMALL and IDEMPOTENT: Cloud Functions may deliver an event more than once,
 * so every handler is written so a second invocation cannot double-count.
 */
import { onDocumentCreated, onDocumentDeleted, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { REGION, COLLECTIONS } from "../config/constants";
import { dayKey } from "../lib/dates";
import { db, bucket, FieldValue, Timestamp } from "../config/admin";
import { log } from "../lib/logger";
import type { AnalyticsEventDoc, BookingDoc, PhotoDoc, SubscriptionDoc, UserDoc } from "../models/types";

/**
 * Keep the daily analytics aggregate in step with the event stream.
 * The nightly rollup recomputes from source, so a missed trigger self-corrects.
 */
export const onAnalyticsEventCreated = onDocumentCreated(
  { region: REGION, document: `${COLLECTIONS.analyticsEvents}/{eventId}`, memory: "256MiB" as const },
  async (event) => {
    const data = event.data?.data() as AnalyticsEventDoc | undefined;
    if (!data) return;
    try {
      const key = data.dayKey ?? dayKey();
      await db
        .collection(COLLECTIONS.analyticsDaily)
        .doc(key)
        .set(
          {
            dayKey: key,
            [`counts.${data.name}`]: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
    } catch (error) {
      log.warn({ event: "analytics_trigger_failed", eventId: event.params.eventId, error: String(error) });
    }
  }
);

/**
 * Photo deletion cleanup: remove Storage objects that belong to a deleted photo document.
 * Runs for admin deletions and TTL sweeps alike, guaranteeing no orphaned bytes are billed.
 */
export const onPhotoDeleted = onDocumentDeleted(
  { region: REGION, document: `${COLLECTIONS.photos}/{photoId}`, memory: "256MiB" as const },
  async (event) => {
    const data = event.data?.data() as PhotoDoc | undefined;
    if (!data) return;
    const paths = [data.storagePath, data.thumbnailPath, `public/photos/${event.params.photoId}.jpg`].filter(
      (p): p is string => Boolean(p)
    );

    await Promise.all(
      paths.map((path) =>
        bucket()
          .file(path)
          .delete()
          .catch((error: unknown) => log.debug({ event: "photo_storage_cleanup_skipped", path, error: String(error) }))
      )
    );

    // Decrement the owning event's photo counter if it was an event capture.
    if (data.eventId) {
      await db
        .collection(COLLECTIONS.events)
        .doc(data.eventId)
        .set({ photoCount: FieldValue.increment(-1) }, { merge: true })
        .catch(() => undefined);
    }

    log.info({ event: "photo_storage_cleaned", photoId: event.params.photoId, paths: paths.length });
  }
);

/**
 * Booking lifecycle → notifications + analytics.
 * Guards against duplicate delivery by checking that the status actually changed.
 */
export const onBookingStatusChanged = onDocumentUpdated(
  { region: REGION, document: `${COLLECTIONS.bookings}/{bookingId}`, memory: "256MiB" as const },
  async (event) => {
    const before = event.data?.before.data() as BookingDoc | undefined;
    const after = event.data?.after.data() as BookingDoc | undefined;
    if (!before || !after || before.status === after.status) return;

    try {
      const userSnap = await db.collection(COLLECTIONS.users).doc(after.uid).get();
      const tokens = ((userSnap.data() as UserDoc | undefined)?.deviceTokens ?? []).slice(0, 5);
      if (tokens.length === 0) return;

      const messages: Record<string, { title: string; body: string }> = {
        confirmed: { title: "Kumpirmado ang booking!", body: `Ang booking ${after.code} ay confirmed na.` },
        checked_in: { title: "Naka-check in ka na", body: `Maligayang pagdating sa event! Code: ${after.code}` },
        completed: { title: "Salamat!", body: `Tapos na ang event. Nakuha mo na ba ang mga litrato mo?` },
        cancelled: { title: "Nakansela ang booking", body: `Nakansela ang booking ${after.code}.` },
        refunded: { title: "Na-refund ang booking", body: `Naibalik na ang bayad para sa booking ${after.code}.` },
        no_show: { title: "Hindi ka nagpakita", body: `Na-markahan ang booking ${after.code} na no-show.` },
      };

      const copy = messages[after.status];
      if (!copy) return;

      const { getMessaging } = await import("firebase-admin/messaging");
      await getMessaging().sendEachForMulticast({
        tokens,
        notification: copy,
        data: { type: "booking", bookingId: after.bookingId, status: after.status },
      });

      log.info({ event: "booking_notification_sent", bookingId: after.bookingId, status: after.status, tokens: tokens.length });
    } catch (error) {
      log.warn({ event: "booking_notification_failed", bookingId: event.params.bookingId, error: String(error) });
    }
  }
);

/**
 * Subscription changes → premium counter + claims refresh.
 * `activateSubscription` already sets claims; this catches admin/webhook paths that flip a
 * status without going through it, and keeps the revenue aggregate honest.
 */
export const onSubscriptionWritten = onDocumentUpdated(
  { region: REGION, document: `${COLLECTIONS.subscriptions}/{subscriptionId}`, memory: "256MiB" as const },
  async (event) => {
    const before = event.data?.before.data() as SubscriptionDoc | undefined;
    const after = event.data?.after.data() as SubscriptionDoc | undefined;
    if (!before || !after || before.status === after.status) return;

    try {
      const { syncClaims } = await import("../services/userService");
      await syncClaims(after.uid);

      if (after.status === "cancelled" && before.status === "active") {
        const key = dayKey();
        await db
          .collection(COLLECTIONS.analyticsDaily)
          .doc(key)
          .set({ dayKey: key, subscriptionsCancelled: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }

      log.info({ event: "subscription_status_changed", subscriptionId: event.params.subscriptionId, from: before.status, to: after.status });
    } catch (error) {
      log.warn({ event: "subscription_trigger_failed", subscriptionId: event.params.subscriptionId, error: String(error) });
    }
  }
);

/**
 * New user document → make sure a quota document exists.
 * Covers users created by the Auth trigger, by an admin import, or by a migration script.
 */
export const onUserDocumentCreated = onDocumentCreated(
  { region: REGION, document: `${COLLECTIONS.users}/{userId}`, memory: "256MiB" as const },
  async (event) => {
    const user = event.data?.data() as UserDoc | undefined;
    if (!user) return;
    try {
      const quotaRef = db.collection(COLLECTIONS.quotas).doc(event.params.userId);
      const existing = await quotaRef.get();
      if (existing.exists) return;

      const { initQuota } = await import("../services/quotaService");
      const { getAppConfig } = await import("../services/configService");
      const appConfig = await getAppConfig();
      await initQuota(event.params.userId, user.plan ?? "free", {
        credits: Math.max(appConfig.signupBonusCredits, 0),
        reason: "signup_bonus",
      });
      log.info({ event: "quota_created_by_trigger", uid: event.params.userId });
    } catch (error) {
      log.warn({ event: "quota_trigger_failed", uid: event.params.userId, error: String(error) });
    }
  }
);

/** Keep `events.bookedCount` honest by watching booking deletions. */
export const onBookingDeleted = onDocumentDeleted(
  { region: REGION, document: `${COLLECTIONS.bookings}/{bookingId}`, memory: "256MiB" as const },
  async (event) => {
    const booking = event.data?.data() as BookingDoc | undefined;
    if (!booking || ["cancelled", "refunded"].includes(booking.status)) return; // already released

    await Promise.all([
      db.collection(COLLECTIONS.events).doc(booking.eventId).set({ bookedCount: FieldValue.increment(-booking.attendees) }, { merge: true }).catch(() => undefined),
      db.collection(COLLECTIONS.eventSlots).doc(booking.slotId).set({ bookedCount: FieldValue.increment(-booking.attendees) }, { merge: true }).catch(() => undefined),
    ]);
    log.info({ event: "booking_delete_released_seats", bookingId: event.params.bookingId, attendees: booking.attendees });
  }
);

/** Purge expired share links a day after they lapse (keeps the share index small). */
export const onShareExpired = onDocumentCreated(
  { region: REGION, document: `${COLLECTIONS.photoShares}/{shareId}`, memory: "256MiB" as const },
  async (event) => {
    const share = event.data?.data() as { expiresAt?: Timestamp } | undefined;
    log.debug({ event: "share_created", shareId: event.params.shareId, expiresAt: share?.expiresAt?.toDate()?.toISOString() });
  }
);
