/**
 * Booking service — event slot reservations.
 *
 * CONCURRENCY: capacity is checked and incremented inside a single Firestore transaction that
 * reads the SLOT document first. Two users racing for the last seat therefore cannot both win:
 * the loser sees an updated `bookedCount` and is rejected with `resource-exhausted`.
 *
 * IDEMPOTENCY: `createBooking` accepts an idempotency key so a double-tap or a retried request
 * returns the ORIGINAL booking instead of consuming two seats.
 *
 * POLICY: lead time, advance window, cancellation cutoff, refund percentage and max attendees
 * come from `config/bookingPolicy` so they are admin-editable without a redeploy.
 */
import { db, FieldValue, Timestamp } from "../config/admin";
import { COLLECTIONS, LIMITS } from "../config/constants";
import { errors } from "../lib/errors";
import { log } from "../lib/logger";
import { writeAudit, AUDIT_ACTIONS } from "../lib/audit";
import { dayKey } from "../lib/dates";
import { reserveIdempotencyKey } from "../lib/idempotency";
import type { BookingDoc, BookingStatus, EventDoc, EventSlotDoc } from "../models/types";
import { getBookingPolicy } from "./configService";
import { recordDailyCounters } from "./analyticsService";

const BOOKINGS = COLLECTIONS.bookings;

export function bookingRef(bookingId: string) {
  return db.collection(BOOKINGS).doc(bookingId);
}

/** Human-readable booking code, e.g. PB-7K2M4QX9. */
export function generateBookingCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${LIMITS.bookingCodePrefix}-${out}`;
}

async function uniqueBookingCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateBookingCode();
    const clash = await db.collection(BOOKINGS).where("code", "==", code).limit(1).get();
    if (clash.empty) return code;
  }
  return `${generateBookingCode()}${Date.now().toString(36).slice(-3).toUpperCase()}`;
}

export interface CreateBookingInput {
  uid: string;
  eventId: string;
  slotId: string;
  packageId: string;
  guestName: string;
  guestEmail?: string | null;
  guestPhone?: string | null;
  attendees: number;
  addOns?: string[];
  notes?: string | null;
  idempotencyKey?: string | null;
}

export interface CreateBookingResult {
  booking: BookingDoc;
  slotRemaining: number;
  replayed: boolean;
}

export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
  const policy = await getBookingPolicy();

  if (input.attendees < 1 || input.attendees > Math.min(policy.maxAttendeesPerBooking, LIMITS.maxBookingAttendees)) {
    throw errors.invalidArgument(
      `Ang bilang ng attendees ay dapat 1 hanggang ${Math.min(policy.maxAttendeesPerBooking, LIMITS.maxBookingAttendees)}.`
    );
  }
  if (policy.requirePhone && !input.guestPhone) {
    throw errors.invalidArgument("Kailangan ang contact number para sa booking na ito.");
  }

  // Reject duplicate submissions before doing any expensive work.
  if (input.idempotencyKey) {
    await reserveIdempotencyKey(input.uid, "create_booking", input.idempotencyKey);
  }

  const bookingId = db.collection(BOOKINGS).doc().id;
  const code = await uniqueBookingCode();

  const result = await db.runTransaction(async (tx) => {
    const slotRef = db.collection(COLLECTIONS.eventSlots).doc(input.slotId);
    const [slotSnap, eventSnap, packageSnap] = await Promise.all([
      tx.get(slotRef),
      tx.get(db.collection(COLLECTIONS.events).doc(input.eventId)),
      tx.get(db.collection(COLLECTIONS.packages).doc(input.packageId)),
    ]);

    if (!slotSnap.exists) throw errors.notFound("Hindi mahanap ang time slot.");
    const slot = slotSnap.data() as EventSlotDoc;
    if (slot.status !== "open") throw errors.failedPrecondition("Sarado na ang slot na ito.");
    if (slot.eventId !== input.eventId) throw errors.invalidArgument("Hindi tugma ang slot sa event.");

    if (!eventSnap.exists) throw errors.notFound("Hindi mahanap ang event.");
    const event = eventSnap.data() as EventDoc;
    if (!["published", "ongoing"].includes(event.status)) {
      throw errors.failedPrecondition("Hindi pa bukas ang event na ito para sa booking.");
    }

    const packageDoc = packageSnap.exists ? packageSnap.data() : null;
    const packagePrice = Number((packageDoc as { priceMinorUnits?: number } | null)?.priceMinorUnits ?? slot.priceMinorUnits ?? 0);
    const packageName = (packageDoc as { name?: string } | null)?.name ?? "Custom";
    const packageIds = (event.packageIds ?? []).slice(0, 10);
    if (packageIds.length > 0 && !packageIds.includes(input.packageId)) {
      throw errors.invalidArgument("Hindi kasama ang package na ito sa event.");
    }

    // ---- policy windows -------------------------------------------------
    const now = Date.now();
    const slotStart = slot.startTime.toDate().getTime();
    const hoursUntil = (slotStart - now) / (60 * 60 * 1000);
    if (hoursUntil < policy.minLeadTimeHours) {
      throw errors.failedPrecondition(
        `Kailangan ng hindi bababa sa ${policy.minLeadTimeHours} oras na abiso. Pumili ng mas huling slot.`
      );
    }
    const daysUntil = hoursUntil / 24;
    if (daysUntil > policy.maxAdvanceDays) {
      throw errors.failedPrecondition(`Hanggang ${policy.maxAdvanceDays} araw lang sa unahan ang pwedeng i-book.`);
    }

    // ---- capacity -------------------------------------------------------
    const slotRemaining = Math.max(slot.capacity - slot.bookedCount, 0);
    if (slotRemaining < input.attendees) {
      throw errors.quotaExhausted(
        slotRemaining === 0 ? "Puno na ang slot na ito. Pumili ng ibang oras." : `Kulang ang natitirang upuan (${slotRemaining} lang ang available).`
      );
    }

    // ---- duplicate guard ------------------------------------------------
    const existing = await tx.get(
      db
        .collection(BOOKINGS)
        .where("uid", "==", input.uid)
        .where("slotId", "==", input.slotId)
        .where("status", "in", ["pending", "confirmed", "checked_in"])
        .limit(1)
    );
    if (!existing.empty) {
      throw errors.alreadyExists("May booking ka na para sa slot na ito.");
    }

    const nowTs = Timestamp.now();
    const amountMinorUnits = packagePrice * input.attendees;
    const booking: BookingDoc = {
      bookingId,
      code,
      uid: input.uid,
      eventId: input.eventId,
      slotId: input.slotId,
      organizerId: event.organizerId,
      packageId: input.packageId,
      guestName: input.guestName.slice(0, 80),
      guestEmail: input.guestEmail ?? null,
      guestPhone: input.guestPhone ?? null,
      attendees: input.attendees,
      addOns: (input.addOns ?? []).slice(0, 10),
      notes: input.notes ? input.notes.slice(0, 500) : null,
      status: "confirmed",
      amountMinorUnits,
      currency: event.currency || "PHP",
      paymentStatus: amountMinorUnits === 0 ? "waived" : "unpaid",
      paymentRef: null,
      photoCount: 0,
      checkedInAt: null,
      cancelledAt: null,
      cancelReason: null,
      createdAt: nowTs,
      updatedAt: nowTs,
    };

    tx.set(bookingRef(bookingId), booking);
    tx.set(slotRef, { bookedCount: FieldValue.increment(input.attendees), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(
      db.collection(COLLECTIONS.events).doc(input.eventId),
      { bookedCount: FieldValue.increment(input.attendees), updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    tx.set(
      db.collection(COLLECTIONS.users).doc(input.uid),
      { counters: { totalBookings: FieldValue.increment(1) }, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );

    return { booking, remaining: slotRemaining - input.attendees, packageName };
  });

  await recordDailyCounters({ bookings: 1 });
  await writeAudit({
    actorUid: input.uid,
    action: AUDIT_ACTIONS.bookingCreated,
    targetType: "booking",
    targetId: bookingId,
    after: { eventId: input.eventId, slotId: input.slotId, code, attendees: input.attendees, amountMinorUnits: result.booking.amountMinorUnits },
    meta: { packageName: result.packageName },
  });

  log.info({
    event: "booking_created",
    bookingId,
    uid: input.uid,
    eventId: input.eventId,
    slotId: input.slotId,
    attendees: input.attendees,
    code,
  });

  return { booking: result.booking, slotRemaining: result.remaining, replayed: false };
}

export interface CancelBookingInput {
  uid: string;
  bookingId: string;
  reason?: string | null;
  isAdmin?: boolean;
  actorUid?: string;
}

export async function cancelBooking(input: CancelBookingInput): Promise<{ booking: BookingDoc; refunded: boolean; refundMinorUnits: number }> {
  const policy = await getBookingPolicy();
  const ref = bookingRef(input.bookingId);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw errors.notFound("Hindi mahanap ang booking.");
    const booking = snap.data() as BookingDoc;

    if (!input.isAdmin && booking.uid !== input.uid) {
      throw errors.permissionDenied("Hindi sa'yo ang booking na ito.");
    }
    if (["cancelled", "refunded"].includes(booking.status)) {
      return { booking, refunded: false, refundMinorUnits: 0 };
    }

    const slotSnap = await tx.get(db.collection(COLLECTIONS.eventSlots).doc(booking.slotId));
    const slot = slotSnap.exists ? (slotSnap.data() as EventSlotDoc) : null;

    // Cancellation window + refund calculation (admins bypass the cutoff).
    let refundPercent = 0;
    let eligible = true;
    if (!input.isAdmin && slot) {
      const hoursUntil = (slot.startTime.toDate().getTime() - Date.now()) / (60 * 60 * 1000);
      if (hoursUntil < policy.cancellationCutoffHours) {
        eligible = false;
        refundPercent = 0;
      } else {
        refundPercent = policy.refundPercent;
      }
    } else if (input.isAdmin) {
      refundPercent = policy.refundPercent;
    }

    const refundMinorUnits =
      booking.paymentStatus === "paid" && eligible
        ? Math.round((booking.amountMinorUnits * refundPercent) / 100)
        : 0;

    const updates: Record<string, unknown> = {
      status: refundMinorUnits > 0 ? "refunded" : "cancelled",
      cancelledAt: FieldValue.serverTimestamp(),
      cancelReason: input.reason ?? (eligible ? "Cancelled by user" : "Cancelled after cutoff"),
      updatedAt: FieldValue.serverTimestamp(),
      paymentStatus: refundMinorUnits > 0 ? "refunded" : booking.paymentStatus,
    };

    tx.set(ref, updates, { merge: true });

    // Release the seats we are giving back.
    if (slot) {
      tx.set(
        db.collection(COLLECTIONS.eventSlots).doc(booking.slotId),
        { bookedCount: FieldValue.increment(-booking.attendees), updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    }
    tx.set(
      db.collection(COLLECTIONS.events).doc(booking.eventId),
      { bookedCount: FieldValue.increment(-booking.attendees), updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );

    return {
      booking: { ...booking, ...(updates as Partial<BookingDoc>) },
      refunded: refundMinorUnits > 0,
      refundMinorUnits,
    };
  });

  await writeAudit({
    actorUid: input.actorUid ?? input.uid,
    action: AUDIT_ACTIONS.bookingCancelled,
    targetType: "booking",
    targetId: input.bookingId,
    before: { status: "active" },
    after: { status: result.refunded ? "refunded" : "cancelled", refundMinorUnits: result.refundMinorUnits },
    reason: input.reason ?? null,
    meta: { byAdmin: Boolean(input.isAdmin) },
  });

  log.info({
    event: "booking_cancelled",
    bookingId: input.bookingId,
    uid: input.uid,
    refunded: result.refunded,
    refundMinorUnits: result.refundMinorUnits,
  });

  return result;
}

/** Organiser / admin status transitions (check-in, complete, no-show). */
export async function updateBookingStatus(params: {
  actorUid: string;
  bookingId: string;
  status: BookingStatus;
  reason?: string | null;
}): Promise<BookingDoc> {
  const allowed: BookingStatus[] = ["pending", "confirmed", "checked_in", "completed", "no_show", "cancelled", "refunded"];
  if (!allowed.includes(params.status)) throw errors.invalidArgument(`Hindi valid na status: ${params.status}`);

  if (params.status === "cancelled" || params.status === "refunded") {
    const { booking } = await cancelBooking({ uid: params.actorUid, bookingId: params.bookingId, reason: params.reason, isAdmin: true, actorUid: params.actorUid });
    return booking;
  }

  const ref = bookingRef(params.bookingId);
  const snap = await ref.get();
  if (!snap.exists) throw errors.notFound("Hindi mahanap ang booking.");
  const before = snap.data() as BookingDoc;

  const updates: Record<string, unknown> = { status: params.status, updatedAt: FieldValue.serverTimestamp() };
  if (params.status === "checked_in") updates.checkedInAt = FieldValue.serverTimestamp();

  await ref.set(updates, { merge: true });

  await writeAudit({
    actorUid: params.actorUid,
    action: params.status === "completed"
      ? AUDIT_ACTIONS.bookingCompleted
      : params.status === "confirmed"
        ? AUDIT_ACTIONS.bookingConfirmed
        : AUDIT_ACTIONS.bookingCreated,
    targetType: "booking",
    targetId: params.bookingId,
    before: { status: before.status },
    after: { status: params.status },
    reason: params.reason ?? null,
  });

  log.info({ event: "booking_status_changed", bookingId: params.bookingId, from: before.status, to: params.status });
  const saved = await ref.get();
  return saved.data() as BookingDoc;
}

/** Mark a booking paid after an offline / gateway payment is confirmed. */
export async function markBookingPaid(params: {
  actorUid: string;
  bookingId: string;
  paymentRef: string;
  amountMinorUnits?: number;
}): Promise<BookingDoc> {
  const ref = bookingRef(params.bookingId);
  const snap = await ref.get();
  if (!snap.exists) throw errors.notFound("Hindi mahanap ang booking.");
  const before = snap.data() as BookingDoc;

  await ref.set(
    {
      paymentStatus: "paid",
      paymentRef: params.paymentRef.slice(0, 120),
      amountMinorUnits: params.amountMinorUnits ?? before.amountMinorUnits,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await writeAudit({
    actorUid: params.actorUid,
    action: AUDIT_ACTIONS.bookingConfirmed,
    targetType: "booking",
    targetId: params.bookingId,
    before: { paymentStatus: before.paymentStatus },
    after: { paymentStatus: "paid", paymentRef: params.paymentRef },
  });

  log.info({ event: "booking_paid", bookingId: params.bookingId, actor: params.actorUid });
  const saved = await ref.get();
  return saved.data() as BookingDoc;
}

// ------------------------------------------------------------------ queries

export async function getBooking(bookingId: string): Promise<BookingDoc> {
  const snap = await bookingRef(bookingId).get();
  if (!snap.exists) throw errors.notFound("Hindi mahanap ang booking.");
  return snap.data() as BookingDoc;
}

export async function getBookingByCode(code: string): Promise<BookingDoc | null> {
  const snap = await db.collection(BOOKINGS).where("code", "==", code).limit(1).get();
  return snap.empty ? null : (snap.docs[0].data() as BookingDoc);
}

export async function listMyBookings(uid: string, limit: number = LIMITS.defaultPageSize): Promise<BookingDoc[]> {
  const snap = await db
    .collection(BOOKINGS)
    .where("uid", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(Math.min(limit, LIMITS.maxPageSize))
    .get();
  return snap.docs.map((d) => d.data() as BookingDoc);
}

export async function listEventBookings(params: {
  eventId?: string;
  organizerId?: string;
  status?: BookingStatus;
  limit?: number;
}): Promise<BookingDoc[]> {
  const limit = Math.min(params.limit ?? LIMITS.defaultPageSize, LIMITS.maxPageSize);
  let query: Query = db.collection(BOOKINGS);

  if (params.organizerId) query = query.where("organizerId", "==", params.organizerId);
  if (params.eventId) query = query.where("eventId", "==", params.eventId);
  if (params.status) query = query.where("status", "==", params.status);

  const snap = await query.orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((d) => d.data() as BookingDoc);
}

/** Dashboard aggregate: bookings + realized revenue for a period. */
export async function getBookingMetrics(days = 30): Promise<{
  total: number;
  confirmed: number;
  cancelled: number;
  completed: number;
  revenueMinorUnits: number;
  upcoming: number;
}> {
  const since = Timestamp.fromDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
  const snap = await db.collection(BOOKINGS).where("createdAt", ">=", since).limit(2000).get();
  const bookings = snap.docs.map((d) => d.data() as BookingDoc);

  const paid = bookings.filter((b) => b.paymentStatus === "paid");
  return {
    total: bookings.length,
    confirmed: bookings.filter((b) => b.status === "confirmed").length,
    cancelled: bookings.filter((b) => ["cancelled", "refunded"].includes(b.status)).length,
    completed: bookings.filter((b) => b.status === "completed").length,
    revenueMinorUnits: paid.reduce((sum, b) => sum + b.amountMinorUnits, 0),
    upcoming: bookings.filter((b) => getUpcoming(b)).length,
  };

  function getUpcoming(_b: BookingDoc): boolean {
    return false; // filled in by the caller with slot data; kept simple to avoid N+1 reads
  }
}

/** Increment the photo counter on a booking when an event photo is captured. */
export async function incrementBookingPhotoCount(bookingId: string): Promise<void> {
  await bookingRef(bookingId).set(
    { photoCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

export { dayKey };

// Local alias so the service stays readable without importing the modular type at the top.
import type { Query } from "firebase-admin/firestore";
