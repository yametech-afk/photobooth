/**
 * Event + booking callables.
 *
 * Booking creation delegates to `bookingService.createBooking`, which performs the slot-capacity
 * check inside a Firestore transaction — the single most important correctness property here.
 */
import { onCall } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { guard, errors } from "../lib/errors";
import { resolveContext, requireAdmin } from "../lib/context";
import { enforceRateLimit } from "../lib/rateLimit";
import {
  asHttpsValidationError,
  optionalInt,
  optionalPhone,
  optionalString,
  optionalStringArray,
  requiredEnum,
  requiredInt,
  requiredString,
} from "../lib/validation";
import { log } from "../lib/logger";
import {
  cancelBooking,
  createBooking,
  getBooking,
  getBookingByCode,
  getBookingMetrics,
  listEventBookings,
  listMyBookings,
  markBookingPaid,
  updateBookingStatus,
} from "../services/bookingService";
import {
  createEvent,
  createSlot,
  deleteEvent,
  getEventWithSlots,
  listOrganizerEvents,
  listPackages,
  listPublicEvents,
  setEventCover,
  setEventStatus,
  updateEvent,
  updateSlot,
  upsertPackage,
} from "../services/eventService";
import { logEvents } from "../services/analyticsService";
import type { BookingStatus, EventStatus } from "../models/types";

const OPTS = { region: REGION, cors: true, timeoutSeconds: 60, memory: "256MiB" as const };

function parseDate(value: unknown, field: string): Date {
  const raw = requiredString(value, field, { max: 40 });
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw errors.invalidArgument(`${field} must be a valid ISO date`);
  return date;
}

// ------------------------------------------------------------------ public browsing

export const getPublicEvents = onCall(OPTS, async (request) =>
  guard(async () => {
    const data = (request.data ?? {}) as Record<string, unknown>;
    const result = await listPublicEvents({
      status: optionalString(data.status ?? null, "status", { max: 20 }) as EventStatus | undefined,
      city: optionalString(data.city ?? null, "city", { max: 80 }) ?? undefined,
      from: data.from ? parseDate(data.from, "from") : undefined,
      limit: optionalInt(data.limit, "limit", { min: 1, max: 100 }) ?? 25,
      cursor: optionalString(data.cursor ?? null, "cursor", { max: 64 }),
    });
    return { success: true as const, data: result, serverTime: new Date().toISOString() };
  })
);

export const getPublicEventDetail = onCall(OPTS, async (request) =>
  guard(async () => {
    const data = (request.data ?? {}) as { eventId?: string };
    const { event, slots, packages } = await getEventWithSlots(requiredString(data.eventId, "eventId", { max: 64 }));
    // Only expose bookable slots to guests.
    return {
      success: true as const,
      data: {
        event,
        slots: slots.filter((slot) => slot.status === "open"),
        packages: packages.filter((pkg) => pkg.isActive),
      },
      serverTime: new Date().toISOString(),
    };
  })
);

export const getPackages = onCall(OPTS, async () =>
  guard(async () => {
    const packages = await listPackages(true);
    return { success: true as const, data: { packages }, serverTime: new Date().toISOString() };
  })
);

// ------------------------------------------------------------------ bookings (user)

export const createEventBooking = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    await enforceRateLimit(ctx.uid, "booking_create");

    const data = (request.data ?? {}) as Record<string, unknown>;
    try {
      const result = await createBooking({
        uid: ctx.uid,
        eventId: requiredString(data.eventId, "eventId", { max: 64 }),
        slotId: requiredString(data.slotId, "slotId", { max: 64 }),
        packageId: requiredString(data.packageId, "packageId", { max: 64 }),
        guestName: requiredString(data.guestName ?? ctx.user?.displayName ?? "Guest", "guestName", { max: 80 }),
        guestEmail: optionalString(data.guestEmail ?? ctx.user?.email ?? null, "guestEmail", { max: 254 }),
        guestPhone: optionalPhone(data.guestPhone ?? ctx.user?.phoneNumber ?? null, "guestPhone"),
        attendees: requiredInt(data.attendees, "attendees", { min: 1, max: 20, fallback: 1 }),
        addOns: optionalStringArray(data.addOns, "addOns", { maxItems: 10, maxItemLength: 40 }),
        notes: optionalString(data.notes ?? null, "notes", { max: 500 }),
        idempotencyKey: optionalString(data.idempotencyKey ?? null, "idempotencyKey", { max: 128 }),
      });

      void logEvents({
        uid: ctx.uid,
        sessionId: optionalString(data.sessionId ?? null, "sessionId", { max: 64 }) ?? "unknown",
        platform: ctx.platform,
        appVersion: ctx.appVersion,
        events: [
          {
            name: "event_booking_completed",
            params: { event: result.booking.eventId, attendees: result.booking.attendees, value: result.booking.amountMinorUnits },
          },
        ],
      }).catch(() => undefined);

      return {
        success: true as const,
        data: {
          bookingId: result.booking.bookingId,
          code: result.booking.code,
          status: result.booking.status,
          amountMinorUnits: result.booking.amountMinorUnits,
          currency: result.booking.currency,
          slotRemaining: result.slotRemaining,
        },
        serverTime: new Date().toISOString(),
      };
    } catch (error) {
      asHttpsValidationError(error);
    }
  })
);

export const getMyBookings = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const data = (request.data ?? {}) as { limit?: number };
    const bookings = await listMyBookings(ctx.uid, optionalInt(data.limit, "limit", { min: 1, max: 100 }) ?? 25);
    return { success: true as const, data: { bookings }, serverTime: new Date().toISOString() };
  })
);

export const getBookingDetail = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const data = (request.data ?? {}) as { bookingId?: string; code?: string };
    const booking = data.bookingId
      ? await getBooking(requiredString(data.bookingId, "bookingId", { max: 64 }))
      : await getBookingByCode(requiredString(data.code, "code", { max: 32 }).toUpperCase());

    if (!booking) throw errors.notFound("Hindi mahanap ang booking.");
    const isOwner = booking.uid === ctx.uid || booking.organizerId === ctx.uid;
    if (!isOwner && !ctx.isAdmin) throw errors.permissionDenied("Hindi mo pwedeng tingnan ang booking na ito.");
    return { success: true as const, data: { booking }, serverTime: new Date().toISOString() };
  })
);

export const cancelEventBooking = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    await enforceRateLimit(ctx.uid, "booking_cancel");
    const data = (request.data ?? {}) as { bookingId?: string; reason?: string };
    const bookingId = requiredString(data.bookingId, "bookingId", { max: 64 });

    const result = await cancelBooking({
      uid: ctx.uid,
      bookingId,
      reason: optionalString(data.reason ?? null, "reason", { max: 300 }),
    });

    void logEvents({ uid: ctx.uid, sessionId: "booking", events: [{ name: "event_booking_cancelled", params: { event: result.booking.eventId } }] }).catch(() => undefined);
    return {
      success: true as const,
      data: { status: result.booking.status, refunded: result.refunded, refundMinorUnits: result.refundMinorUnits },
      serverTime: new Date().toISOString(),
    };
  })
);

// ------------------------------------------------------------------ admin: events

export const adminCreateEvent = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const admin = requireAdmin(ctx, ["superadmin", "admin"]);
    const data = (request.data ?? {}) as Record<string, unknown>;
    try {
      const event = await createEvent({
        organizerId: optionalString(data.organizerId ?? null, "organizerId", { max: 128 }) ?? admin.uid,
        title: requiredString(data.title, "title", { max: 120 }),
        description: optionalString(data.description ?? null, "description", { max: 2000 }) ?? "",
        venue: requiredString(data.venue, "venue", { max: 200 }),
        city: requiredString(data.city, "city", { max: 80 }),
        eventDate: parseDate(data.eventDate, "eventDate"),
        startTime: parseDate(data.startTime, "startTime"),
        endTime: parseDate(data.endTime, "endTime"),
        timezone: optionalString(data.timezone ?? null, "timezone", { max: 60 }) ?? "Asia/Manila",
        capacity: requiredInt(data.capacity, "capacity", { min: 1, max: 10000, fallback: 50 }),
        packageIds: optionalStringArray(data.packageIds, "packageIds", { maxItems: 10, maxItemLength: 64 }),
        tags: optionalStringArray(data.tags, "tags", { maxItems: 10, maxItemLength: 30 }),
        basePriceMinorUnits: optionalInt(data.basePriceMinorUnits, "basePriceMinorUnits", { min: 0, max: 100_000_000 }) ?? 0,
        currency: optionalString(data.currency ?? null, "currency", { max: 8 }) ?? "PHP",
      });
      return { success: true as const, data: { event }, serverTime: new Date().toISOString() };
    } catch (error) {
      asHttpsValidationError(error);
    }
  })
);

export const adminUpdateEvent = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const admin = requireAdmin(ctx, ["superadmin", "admin"]);
    const data = (request.data ?? {}) as Record<string, unknown>;
    const event = await updateEvent({
      actorUid: admin.uid,
      eventId: requiredString(data.eventId, "eventId", { max: 64 }),
      patch: {
        title: optionalString(data.title ?? null, "title", { max: 120 }) ?? undefined,
        description: optionalString(data.description ?? null, "description", { max: 2000 }) ?? undefined,
        venue: optionalString(data.venue ?? null, "venue", { max: 200 }) ?? undefined,
        city: optionalString(data.city ?? null, "city", { max: 80 }) ?? undefined,
        capacity: optionalInt(data.capacity, "capacity", { min: 1, max: 10000 }) ?? undefined,
        packageIds: data.packageIds ? optionalStringArray(data.packageIds, "packageIds", { maxItems: 10, maxItemLength: 64 }) : undefined,
        tags: data.tags ? optionalStringArray(data.tags, "tags", { maxItems: 10, maxItemLength: 30 }) : undefined,
        timezone: optionalString(data.timezone ?? null, "timezone", { max: 60 }) ?? undefined,
        eventDate: data.eventDate ? parseDate(data.eventDate, "eventDate") : undefined,
        startTime: data.startTime ? parseDate(data.startTime, "startTime") : undefined,
        endTime: data.endTime ? parseDate(data.endTime, "endTime") : undefined,
      },
    });
    return { success: true as const, data: { event }, serverTime: new Date().toISOString() };
  })
);

export const adminSetEventStatus = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const admin = requireAdmin(ctx, ["superadmin", "admin"]);
    const data = (request.data ?? {}) as { eventId?: string; status?: string };
    await setEventStatus({
      actorUid: admin.uid,
      eventId: requiredString(data.eventId, "eventId", { max: 64 }),
      status: requiredEnum(data.status, "status", ["draft", "published", "ongoing", "completed", "cancelled"], "published") as EventStatus,
    });
    return { success: true as const, data: { ok: true }, serverTime: new Date().toISOString() };
  })
);

export const adminDeleteEvent = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const admin = requireAdmin(ctx, ["superadmin"]);
    const data = (request.data ?? {}) as { eventId?: string };
    await deleteEvent({ actorUid: admin.uid, eventId: requiredString(data.eventId, "eventId", { max: 64 }) });
    return { success: true as const, data: { deleted: true }, serverTime: new Date().toISOString() };
  })
);

export const adminListEvents = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const admin = requireAdmin(ctx, ["superadmin", "admin", "support"]);
    const data = (request.data ?? {}) as { organizerId?: string; limit?: number };
    const organizerId = optionalString(data.organizerId ?? null, "organizerId", { max: 128 });
    const limit = optionalInt(data.limit, "limit", { min: 1, max: 100 }) ?? 50;

    const events = organizerId ? await listOrganizerEvents(organizerId, limit) : (await listPublicEvents({ limit })).items;
    return { success: true as const, data: { events, role: admin.role }, serverTime: new Date().toISOString() };
  })
);

export const adminSetEventCover = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const admin = requireAdmin(ctx, ["superadmin", "admin"]);
    const data = (request.data ?? {}) as { eventId?: string; contentType?: string };
    const result = await setEventCover({
      actorUid: admin.uid,
      eventId: requiredString(data.eventId, "eventId", { max: 64 }),
      contentType: requiredEnum(data.contentType ?? "image/jpeg", "contentType", ["image/jpeg", "image/jpg", "image/png", "image/webp"], "image/jpeg"),
    });
    return { success: true as const, data: result, serverTime: new Date().toISOString() };
  })
);

// ------------------------------------------------------------------ admin: slots

export const adminCreateEventSlot = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const admin = requireAdmin(ctx, ["superadmin", "admin"]);
    const data = (request.data ?? {}) as Record<string, unknown>;
    try {
      const slot = await createSlot({
        actorUid: admin.uid,
        eventId: requiredString(data.eventId, "eventId", { max: 64 }),
        label: requiredString(data.label, "label", { max: 80 }),
        startTime: parseDate(data.startTime, "startTime"),
        endTime: parseDate(data.endTime, "endTime"),
        capacity: requiredInt(data.capacity, "capacity", { min: 1, max: 5000, fallback: 20 }),
        priceMinorUnits: optionalInt(data.priceMinorUnits, "priceMinorUnits", { min: 0, max: 100_000_000 }) ?? 0,
        currency: optionalString(data.currency ?? null, "currency", { max: 8 }) ?? undefined,
      });
      return { success: true as const, data: { slot }, serverTime: new Date().toISOString() };
    } catch (error) {
      asHttpsValidationError(error);
    }
  })
);

export const adminUpdateEventSlot = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const admin = requireAdmin(ctx, ["superadmin", "admin"]);
    const data = (request.data ?? {}) as Record<string, unknown>;
    const slot = await updateSlot({
      actorUid: admin.uid,
      slotId: requiredString(data.slotId, "slotId", { max: 64 }),
      patch: {
        label: optionalString(data.label ?? null, "label", { max: 80 }) ?? undefined,
        capacity: optionalInt(data.capacity, "capacity", { min: 1, max: 5000 }) ?? undefined,
        priceMinorUnits: optionalInt(data.priceMinorUnits, "priceMinorUnits", { min: 0, max: 100_000_000 }) ?? undefined,
        status: data.status ? (requiredEnum(data.status, "status", ["draft", "open", "closed", "cancelled"], "open") as never) : undefined,
        startTime: data.startTime ? parseDate(data.startTime, "startTime") : undefined,
        endTime: data.endTime ? parseDate(data.endTime, "endTime") : undefined,
      },
    });
    return { success: true as const, data: { slot }, serverTime: new Date().toISOString() };
  })
);

// ------------------------------------------------------------------ admin: bookings

export const adminListBookings = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    requireAdmin(ctx, ["superadmin", "admin", "support"]);
    const data = (request.data ?? {}) as Record<string, unknown>;
    const bookings = await listEventBookings({
      eventId: optionalString(data.eventId ?? null, "eventId", { max: 64 }) ?? undefined,
      organizerId: optionalString(data.organizerId ?? null, "organizerId", { max: 128 }) ?? undefined,
      status: optionalString(data.status ?? null, "status", { max: 20 }) as BookingStatus | undefined,
      limit: optionalInt(data.limit, "limit", { min: 1, max: 100 }) ?? 50,
    });
    return { success: true as const, data: { bookings }, serverTime: new Date().toISOString() };
  })
);

export const adminUpdateBookingStatus = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const admin = requireAdmin(ctx, ["superadmin", "admin"]);
    const data = (request.data ?? {}) as Record<string, unknown>;
    const booking = await updateBookingStatus({
      actorUid: admin.uid,
      bookingId: requiredString(data.bookingId, "bookingId", { max: 64 }),
      status: requiredEnum(
        data.status,
        "status",
        ["pending", "confirmed", "checked_in", "completed", "no_show", "cancelled", "refunded"],
        "confirmed"
      ) as BookingStatus,
      reason: optionalString(data.reason ?? null, "reason", { max: 300 }),
    });
    return { success: true as const, data: { booking }, serverTime: new Date().toISOString() };
  })
);

export const adminMarkBookingPaid = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const admin = requireAdmin(ctx, ["superadmin", "admin"]);
    const data = (request.data ?? {}) as Record<string, unknown>;
    const booking = await markBookingPaid({
      actorUid: admin.uid,
      bookingId: requiredString(data.bookingId, "bookingId", { max: 64 }),
      paymentRef: requiredString(data.paymentRef, "paymentRef", { max: 120 }),
      amountMinorUnits: optionalInt(data.amountMinorUnits, "amountMinorUnits", { min: 0, max: 100_000_000 }) ?? undefined,
    });
    return { success: true as const, data: { booking }, serverTime: new Date().toISOString() };
  })
);

export const adminGetBookingMetrics = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    requireAdmin(ctx, ["superadmin", "admin", "support"]);
    const data = (request.data ?? {}) as { days?: number };
    const metrics = await getBookingMetrics(optionalInt(data.days, "days", { min: 1, max: 365 }) ?? 30);
    return { success: true as const, data: { metrics }, serverTime: new Date().toISOString() };
  })
);

// ------------------------------------------------------------------ admin: packages

export const adminUpsertPackage = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const admin = requireAdmin(ctx, ["superadmin", "admin"]);
    const data = (request.data ?? {}) as Record<string, unknown>;
    try {
      const pkg = await upsertPackage({
        actorUid: admin.uid,
        packageId: optionalString(data.packageId ?? null, "packageId", { max: 64 }),
        data: {
          name: requiredString(data.name, "name", { max: 80 }),
          description: optionalString(data.description ?? null, "description", { max: 500 }) ?? "",
          priceMinorUnits: requiredInt(data.priceMinorUnits, "priceMinorUnits", { min: 0, max: 100_000_000, fallback: 0 }),
          currency: optionalString(data.currency ?? null, "currency", { max: 8 }) ?? "PHP",
          durationMinutes: requiredInt(data.durationMinutes, "durationMinutes", { min: 5, max: 1440, fallback: 60 }),
          photosIncluded: requiredInt(data.photosIncluded, "photosIncluded", { min: 0, max: 100000, fallback: 50 }),
          printsIncluded: requiredInt(data.printsIncluded, "printsIncluded", { min: 0, max: 100000, fallback: 0 }),
          includesGif: Boolean(data.includesGif),
          includesPremiumFilters: Boolean(data.includesPremiumFilters),
          isActive: data.isActive === undefined ? true : Boolean(data.isActive),
          sortOrder: optionalInt(data.sortOrder, "sortOrder", { min: 0, max: 9999 }) ?? 0,
        },
      });
      return { success: true as const, data: { package: pkg }, serverTime: new Date().toISOString() };
    } catch (error) {
      asHttpsValidationError(error);
    }
  })
);

export { log };
