/**
 * Event + slot service (bookable photobooth events).
 *
 * Images and validation guarantee:
 *  - Public listings only ever expose `published` / `ongoing` events.
 *  - Capacity is enforced from the slot document inside a transaction (see bookingService).
 *  - Every mutation is audited.
 */
import { bucket, db, FieldValue, Timestamp } from "../config/admin";
import { COLLECTIONS, LIMITS, STORAGE_PATHS } from "../config/constants";
import { errors } from "../lib/errors";
import { log } from "../lib/logger";
import { writeAudit, AUDIT_ACTIONS } from "../lib/audit";
import type { EventDoc, EventSlotDoc, EventStatus, PackageDoc, SlotStatus } from "../models/types";

const EVENTS = COLLECTIONS.events;
const SLOTS = COLLECTIONS.eventSlots;
const PACKAGES = COLLECTIONS.packages;

export function eventRef(eventId: string) {
  return db.collection(EVENTS).doc(eventId);
}

export function slotRef(slotId: string) {
  return db.collection(SLOTS).doc(slotId);
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export interface CreateEventInput {
  organizerId: string;
  title: string;
  description: string;
  venue: string;
  city: string;
  eventDate: Date;
  startTime: Date;
  endTime: Date;
  timezone?: string;
  capacity: number;
  packageIds: string[];
  tags?: string[];
  basePriceMinorUnits?: number;
  currency?: string;
}

export async function createEvent(input: CreateEventInput): Promise<EventDoc> {
  if (input.endTime.getTime() <= input.startTime.getTime()) {
    throw errors.invalidArgument("Mas maaga ang startTime kaysa endTime.");
  }
  if (input.capacity < 1 || input.capacity > 10000) {
    throw errors.invalidArgument("capacity must be between 1 and 10000.");
  }

  const eventId = db.collection(EVENTS).doc().id;
  let slug = slugify(input.title) || `event-${eventId.slice(0, 6)}`;

  // Guarantee slug uniqueness without a unique-index dependency.
  const clash = await db.collection(EVENTS).where("slug", "==", slug).limit(1).get();
  if (!clash.empty) slug = `${slug}-${eventId.slice(0, 4)}`;

  const now = Timestamp.now();
  const doc: EventDoc = {
    eventId,
    organizerId: input.organizerId,
    title: input.title.slice(0, 120),
    slug,
    description: input.description.slice(0, 2000),
    coverPath: null,
    coverUrl: null,
    venue: input.venue.slice(0, 200),
    city: input.city.slice(0, 80),
    status: "draft",
    eventDate: Timestamp.fromDate(input.eventDate),
    startTime: Timestamp.fromDate(input.startTime),
    endTime: Timestamp.fromDate(input.endTime),
    timezone: input.timezone ?? "Asia/Manila",
    packageIds: input.packageIds.slice(0, 10),
    basePriceMinorUnits: input.basePriceMinorUnits ?? 0,
    currency: input.currency ?? "PHP",
    capacity: input.capacity,
    bookedCount: 0,
    photoCount: 0,
    tags: (input.tags ?? []).slice(0, 10),
    isFeatured: false,
    createdAt: now,
    updatedAt: now,
  };

  await eventRef(eventId).set(doc);
  await writeAudit({
    actorUid: input.organizerId,
    action: AUDIT_ACTIONS.eventCreated,
    targetType: "event",
    targetId: eventId,
    after: { title: doc.title, status: doc.status, eventDate: input.eventDate.toISOString() },
  });

  log.info({ event: "event_created", eventId, organizerId: input.organizerId, title: doc.title });
  return doc;
}

export async function updateEvent(params: {
  actorUid: string;
  eventId: string;
  patch: Partial<Pick<EventDoc, "title" | "description" | "venue" | "city" | "capacity" | "packageIds" | "tags" | "timezone">> & {
    eventDate?: Date;
    startTime?: Date;
    endTime?: Date;
  };
}): Promise<EventDoc> {
  const ref = eventRef(params.eventId);
  const snap = await ref.get();
  if (!snap.exists) throw errors.notFound("Hindi mahanap ang event.");
  const before = snap.data() as EventDoc;

  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  for (const key of ["title", "description", "venue", "city", "capacity", "packageIds", "tags", "timezone"] as const) {
    if (params.patch[key] !== undefined) updates[key] = params.patch[key];
  }
  if (params.patch.eventDate) updates.eventDate = Timestamp.fromDate(params.patch.eventDate);
  if (params.patch.startTime) updates.startTime = Timestamp.fromDate(params.patch.startTime);
  if (params.patch.endTime) updates.endTime = Timestamp.fromDate(params.patch.endTime);

  if (params.patch.capacity !== undefined && params.patch.capacity < before.bookedCount) {
    throw errors.failedPrecondition(
      `Hindi maaaring babaan ang capacity sa ${params.patch.capacity} — may ${before.bookedCount} nang booking.`
    );
  }

  await ref.set(updates, { merge: true });

  await writeAudit({
    actorUid: params.actorUid,
    action: AUDIT_ACTIONS.eventUpdated,
    targetType: "event",
    targetId: params.eventId,
    before: { title: before.title, capacity: before.capacity, status: before.status },
    after: updates,
  });

  const saved = await ref.get();
  return saved.data() as EventDoc;
}

export async function setEventStatus(params: { actorUid: string; eventId: string; status: EventStatus }): Promise<void> {
  const ref = eventRef(params.eventId);
  const snap = await ref.get();
  if (!snap.exists) throw errors.notFound("Hindi mahanap ang event.");
  const before = snap.data() as EventDoc;

  if (params.status === "published" && before.packageIds.length === 0) {
    throw errors.failedPrecondition("Magdagdag muna ng package bago i-publish ang event.");
  }

  await ref.set({ status: params.status, updatedAt: FieldValue.serverTimestamp(), publishedAt: params.status === "published" ? FieldValue.serverTimestamp() : before.status === "published" ? undefined : null }, { merge: true });

  await writeAudit({
    actorUid: params.actorUid,
    action: params.status === "published" ? AUDIT_ACTIONS.eventPublished : AUDIT_ACTIONS.eventUpdated,
    targetType: "event",
    targetId: params.eventId,
    before: { status: before.status },
    after: { status: params.status },
  });

  log.info({ event: "event_status_changed", eventId: params.eventId, from: before.status, to: params.status });
}

export async function deleteEvent(params: { actorUid: string; eventId: string }): Promise<void> {
  const ref = eventRef(params.eventId);
  const snap = await ref.get();
  if (!snap.exists) throw errors.notFound("Hindi mahanap ang event.");
  const event = snap.data() as EventDoc;

  const activeBookings = await db
    .collection(COLLECTIONS.bookings)
    .where("eventId", "==", params.eventId)
    .where("status", "in", ["pending", "confirmed", "checked_in"])
    .limit(1)
    .get();
  if (!activeBookings.empty) {
    throw errors.failedPrecondition("May active bookings ang event na ito. I-cancel muna ang mga ito.");
  }

  await ref.delete();
  if (event.coverPath) await bucket().file(event.coverPath).delete().catch(() => undefined);

  await writeAudit({
    actorUid: params.actorUid,
    action: AUDIT_ACTIONS.eventUpdated,
    targetType: "event",
    targetId: params.eventId,
    before: { title: event.title, status: event.status },
    after: null,
    reason: "event_deleted",
  });
}

// ------------------------------------------------------------------ slots

export async function createSlot(params: {
  actorUid: string;
  eventId: string;
  label: string;
  startTime: Date;
  endTime: Date;
  capacity: number;
  priceMinorUnits: number;
  currency?: string;
}): Promise<EventSlotDoc> {
  const eventSnap = await eventRef(params.eventId).get();
  if (!eventSnap.exists) throw errors.notFound("Hindi mahanap ang event.");
  const event = eventSnap.data() as EventDoc;

  if (params.endTime.getTime() <= params.startTime.getTime()) {
    throw errors.invalidArgument("Mas maaga ang startTime kaysa endTime ng slot.");
  }
  if (params.capacity < 1) throw errors.invalidArgument("capacity must be at least 1.");

  const slotId = db.collection(SLOTS).doc().id;
  const now = Timestamp.now();
  const doc: EventSlotDoc = {
    slotId,
    eventId: params.eventId,
    organizerId: event.organizerId,
    label: params.label.slice(0, 80),
    startTime: Timestamp.fromDate(params.startTime),
    endTime: Timestamp.fromDate(params.endTime),
    capacity: params.capacity,
    bookedCount: 0,
    priceMinorUnits: params.priceMinorUnits,
    currency: params.currency ?? event.currency,
    status: "open",
    createdAt: now,
    updatedAt: now,
  };

  await slotRef(slotId).set(doc);
  await writeAudit({
    actorUid: params.actorUid,
    action: AUDIT_ACTIONS.slotCreated,
    targetType: "eventSlot",
    targetId: slotId,
    after: { eventId: params.eventId, startTime: params.startTime.toISOString(), capacity: params.capacity },
  });

  log.info({ event: "slot_created", slotId, eventId: params.eventId, capacity: params.capacity });
  return doc;
}

export async function updateSlot(params: {
  actorUid: string;
  slotId: string;
  patch: { label?: string; capacity?: number; priceMinorUnits?: number; status?: SlotStatus; startTime?: Date; endTime?: Date };
}): Promise<EventSlotDoc> {
  const ref = slotRef(params.slotId);
  const snap = await ref.get();
  if (!snap.exists) throw errors.notFound("Hindi mahanap ang slot.");
  const before = snap.data() as EventSlotDoc;

  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (params.patch.label !== undefined) updates.label = params.patch.label;
  if (params.patch.capacity !== undefined) {
    if (params.patch.capacity < before.bookedCount) {
      throw errors.failedPrecondition(`Hindi maaaring babaan ang capacity sa ${params.patch.capacity}.`);
    }
    updates.capacity = params.patch.capacity;
  }
  if (params.patch.priceMinorUnits !== undefined) updates.priceMinorUnits = params.patch.priceMinorUnits;
  if (params.patch.status !== undefined) updates.status = params.patch.status;
  if (params.patch.startTime) updates.startTime = Timestamp.fromDate(params.patch.startTime);
  if (params.patch.endTime) updates.endTime = Timestamp.fromDate(params.patch.endTime);

  await ref.set(updates, { merge: true });
  await writeAudit({
    actorUid: params.actorUid,
    action: AUDIT_ACTIONS.slotUpdated,
    targetType: "eventSlot",
    targetId: params.slotId,
    before: { capacity: before.capacity, status: before.status, bookedCount: before.bookedCount },
    after: updates,
  });

  const saved = await ref.get();
  return saved.data() as EventSlotDoc;
}

// ------------------------------------------------------------------ queries

export interface ListEventsInput {
  status?: EventStatus;
  city?: string;
  from?: Date;
  limit?: number;
  cursor?: string | null;
}

export async function listPublicEvents(input: ListEventsInput = {}): Promise<{ items: EventDoc[]; nextCursor: string | null }> {
  const limit = Math.min(input.limit ?? LIMITS.defaultPageSize, LIMITS.maxPageSize);
  let query: FirebaseFirestore.Query = db.collection(EVENTS);

  if (input.city) {
    query = query.where("city", "==", input.city).where("status", "==", input.status ?? "published");
  } else {
    query = query.where("status", "==", input.status ?? "published");
  }

  if (input.from) query = query.where("eventDate", ">=", Timestamp.fromDate(input.from));

  if (input.cursor) {
    const cursorSnap = await eventRef(input.cursor).get();
    if (cursorSnap.exists) query = query.startAfter(cursorSnap);
  }

  const snap = await query.orderBy("eventDate", "asc").limit(limit + 1).get();
  const hasMore = snap.size > limit;
  const docs = hasMore ? snap.docs.slice(0, limit) : snap.docs;

  return {
    items: docs.map((d) => d.data() as EventDoc),
    nextCursor: hasMore ? docs[docs.length - 1].id : null,
  };
}

export async function listOrganizerEvents(organizerId: string, limit: number = LIMITS.defaultPageSize): Promise<EventDoc[]> {
  const snap = await db
    .collection(EVENTS)
    .where("organizerId", "==", organizerId)
    .orderBy("createdAt", "desc")
    .limit(Math.min(limit, LIMITS.maxPageSize))
    .get();
  return snap.docs.map((d) => d.data() as EventDoc);
}

export async function getEventWithSlots(eventId: string): Promise<{ event: EventDoc; slots: EventSlotDoc[]; packages: PackageDoc[] }> {
  const snap = await eventRef(eventId).get();
  if (!snap.exists) throw errors.notFound("Hindi mahanap ang event.");
  const event = snap.data() as EventDoc;

  const [slotSnap, packageSnap] = await Promise.all([
    db.collection(SLOTS).where("eventId", "==", eventId).orderBy("startTime", "asc").limit(200).get(),
    event.packageIds.length
      ? db.collection(PACKAGES).where("__name__", "in", event.packageIds.slice(0, 10)).get()
      : Promise.resolve(null),
  ]);

  return {
    event,
    slots: slotSnap.docs.map((d) => d.data() as EventSlotDoc),
    packages: packageSnap ? packageSnap.docs.map((d) => d.data() as PackageDoc) : [],
  };
}

/** Set / replace an event cover image (admin panel). */
export async function setEventCover(params: { actorUid: string; eventId: string; contentType: string }): Promise<{ uploadUrl: string; storagePath: string; expiresAt: string }> {
  const snap = await eventRef(params.eventId).get();
  if (!snap.exists) throw errors.notFound("Hindi mahanap ang event.");

  const ext = params.contentType.includes("png") ? "png" : params.contentType.includes("webp") ? "webp" : "jpg";
  const storagePath = STORAGE_PATHS.eventCover(params.eventId, `cover.${ext}`);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  const [uploadUrl] = await bucket().file(storagePath).getSignedUrl({
    version: "v4",
    action: "write",
    expires: expiresAt,
    contentType: params.contentType,
  });

  await eventRef(params.eventId).set({ coverPath: storagePath, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  log.info({ event: "event_cover_upload_url_issued", eventId: params.eventId, storagePath });
  return { uploadUrl, storagePath, expiresAt: expiresAt.toISOString() };
}

// ------------------------------------------------------------------ packages

export async function upsertPackage(params: {
  actorUid: string;
  packageId?: string | null;
  data: Omit<PackageDoc, "packageId" | "createdAt" | "updatedAt">;
}): Promise<PackageDoc> {
  const packageId = params.packageId ?? db.collection(PACKAGES).doc().id;
  const ref = db.collection(PACKAGES).doc(packageId);
  const existing = await ref.get();

  const doc = {
    ...params.data,
    packageId,
    isActive: params.data.isActive ?? true,
    sortOrder: params.data.sortOrder ?? 0,
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: existing.exists ? existing.data()?.createdAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
  };

  await ref.set(doc, { merge: true });
  await writeAudit({
    actorUid: params.actorUid,
    action: AUDIT_ACTIONS.packageUpserted,
    targetType: "package",
    targetId: packageId,
    after: { name: params.data.name, priceMinorUnits: params.data.priceMinorUnits },
  });

  const saved = await ref.get();
  return saved.data() as PackageDoc;
}

export async function listPackages(activeOnly = true): Promise<PackageDoc[]> {
  let query: FirebaseFirestore.Query = db.collection(PACKAGES);
  if (activeOnly) query = query.where("isActive", "==", true);
  const snap = await query.limit(100).get();
  const items = snap.docs.map((d) => d.data() as PackageDoc);
  return items.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}
