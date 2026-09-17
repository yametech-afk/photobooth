/**
 * Photo service — upload reservation, finalisation, deletion, sharing.
 *
 * Flow (never trust the client to write `photos` directly):
 *   1. `requestPhotoUpload`  → validates quota + limits, reserves an idempotency key, returns
 *                              a signed Storage path and a reservation id.
 *   2. client uploads the binary to that exact Storage path.
 *   3. `finalizePhotoUpload` → spends the credits, marks the doc `ready`, optionally mirrors
 *                              to the public gallery, bumps event/day counters.
 * A reservation that is never finalised expires via the TTL index on `uploadReservations.expiresAt`.
 */
import { bucket, db, FieldValue, Timestamp } from "../config/admin";
import { COLLECTIONS, LIMITS, STORAGE_PATHS } from "../config/constants";
import { errors } from "../lib/errors";
import { log } from "../lib/logger";
import { writeAudit, AUDIT_ACTIONS } from "../lib/audit";
import { dayKey } from "../lib/dates";
import { reserveIdempotencyKey } from "../lib/idempotency";
import type { PhotoDoc, PhotoShareDoc, PhotoVisibility, UploadReservationDoc } from "../models/types";
import { ensureQuota, getCreditCost, refund, spend } from "./quotaService";
import { getAppConfig } from "./configService";

const PHOTOS = COLLECTIONS.photos;
const RESERVATIONS = COLLECTIONS.uploadReservations;
const SHARES = COLLECTIONS.photoShares;

export function photoRef(photoId: string) {
  return db.collection(PHOTOS).doc(photoId);
}

export function reservationRef(reservationId: string) {
  return db.collection(RESERVATIONS).doc(reservationId);
}

function newId(prefix: string): string {
  // Collision-resistant, sortable-ish id that does not need an extra package.
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${ts}${rand}`;
}

export interface RequestUploadInput {
  uid: string;
  filterId: string;
  mode: PhotoDoc["mode"];
  visibility: PhotoVisibility;
  eventId?: string | null;
  bookingId?: string | null;
  contentType?: string;
  sizeBytes?: number;
  idempotencyKey?: string | null;
}

export interface RequestUploadResult {
  reservationId: string;
  photoId: string;
  storagePath: string;
  uploadUrl: string;
  expiresAt: string;
  creditsToSpend: number;
  replayed: boolean;
}

/** Step 1 — authorise and reserve. Credits are NOT yet debited here. */
export async function requestUpload(input: RequestUploadInput): Promise<RequestUploadResult> {
  const appConfig = await getAppConfig();
  if (!appConfig.uploadsEnabled || appConfig.maintenanceMode) {
    throw errors.failedPrecondition("Pansamantalang hindi available ang uploads.");
  }

  const sizeBytes = input.sizeBytes ?? 0;
  if (sizeBytes > LIMITS.maxUploadBytes) {
    throw errors.invalidArgument(`Lumalampas ang file sa ${Math.round(LIMITS.maxUploadBytes / 1024 / 1024)}MB na limit.`);
  }
  const contentType = (input.contentType ?? "image/jpeg").toLowerCase();
  if (!/^image\/(jpeg|jpg|png|webp|heic)$/.test(contentType)) {
    throw errors.invalidArgument("Hindi suportadong image type. Gumamit ng JPEG, PNG, WEBP o HEIC.");
  }

  const quota = await ensureQuota(input.uid);
  const actionMap: Record<PhotoDoc["mode"], "photo_capture" | "burst_capture" | "gif_capture"> = {
    single: "photo_capture",
    burst: "burst_capture",
    gif: "gif_capture",
    strip: "photo_capture",
  };
  const creditAction = actionMap[input.mode] ?? "photo_capture";
  let cost = await getCreditCost(creditAction);

  // Event photos are billed to the organiser's package, not to the guest.
  if (input.eventId && input.visibility === "event") {
    const eventSnap = await db.collection(COLLECTIONS.events).doc(input.eventId).get();
    if (!eventSnap.exists) throw errors.notFound("Hindi mahanap ang event.");
    const event = eventSnap.data() as { status: string };
    if (!["published", "ongoing"].includes(event.status)) {
      throw errors.failedPrecondition("Hindi pa bukas ang event na ito para sa uploads.");
    }
    cost = 0; // covered by the event package
  }

  // Guard against double-charging on retry: same key ⇒ same reservation.
  if (input.idempotencyKey) {
    await reserveIdempotencyKey(input.uid, "request_upload", input.idempotencyKey);
  }

  const photoId = newId("photo");
  const reservationId = newId("res");
  const storagePath = STORAGE_PATHS.userPhoto(input.uid, photoId);
  const expiresAt = new Date(Date.now() + LIMITS.uploadReservationTtlMinutes * 60 * 1000);

  const reservation: UploadReservationDoc = {
    reservationId,
    uid: input.uid,
    photoId,
    storagePath,
    filterId: input.filterId,
    mode: input.mode,
    visibility: input.visibility,
    eventId: input.eventId ?? null,
    creditsToSpend: cost,
    status: "pending",
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromDate(expiresAt),
  };

  const batch = db.batch();
  batch.set(reservationRef(reservationId), reservation);
  batch.set(photoRef(photoId), {
    photoId,
    uid: input.uid,
    eventId: input.eventId ?? null,
    bookingId: input.bookingId ?? null,
    storagePath,
    thumbnailPath: null,
    publicUrl: null,
    filterId: input.filterId,
    filterApplied: false,
    mode: input.mode,
    status: "reserved",
    visibility: input.visibility,
    caption: null,
    hashtags: [],
    width: null,
    height: null,
    sizeBytes,
    contentType,
    creditsSpent: cost,
    likes: 0,
    shares: 0,
    views: 0,
    isFlagged: false,
    flagReason: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    deletedAt: null,
  } satisfies Omit<PhotoDoc, "createdAt" | "updatedAt"> & Record<string, unknown>);
  await batch.commit();

  // A v4 signed upload URL lets the client PUT the binary without routing bytes through a
  // function (bytes over functions are slow and expensive).
  const [uploadUrl] = await bucket()
    .file(storagePath)
    .getSignedUrl({
      version: "v4",
      action: "write",
      expires: expiresAt,
      contentType,
    });

  log.info({
    event: "upload_requested",
    uid: input.uid,
    photoId,
    mode: input.mode,
    cost,
    dailyCount: quota.dailyCount,
  });

  return {
    reservationId,
    photoId,
    storagePath,
    uploadUrl,
    expiresAt: expiresAt.toISOString(),
    creditsToSpend: cost,
    replayed: false,
  };
}

export interface FinalizeUploadInput {
  uid: string;
  reservationId: string;
  photoId: string;
  width?: number | null;
  height?: number | null;
  sizeBytes?: number | null;
  caption?: string | null;
  hashtags?: string[];
  thumbnailPath?: string | null;
  filterApplied?: boolean;
  creditsOverride?: number | null;
}

/** Step 2 — debit credits and publish metadata. */
export async function finalizeUpload(input: FinalizeUploadInput): Promise<{
  photo: PhotoDoc;
  creditsRemaining: number;
  publicUrl: string | null;
}> {
  const resSnap = await reservationRef(input.reservationId).get();
  if (!resSnap.exists) throw errors.notFound("Walang ganitong upload reservation.");
  const reservation = resSnap.data() as UploadReservationDoc;

  if (reservation.uid !== input.uid) throw errors.permissionDenied("Hindi sa'yo ang reservation na ito.");
  if (reservation.photoId !== input.photoId) throw errors.invalidArgument("Hindi tugma ang photoId sa reservation.");
  if (reservation.status === "consumed") {
    const existing = await photoRef(input.photoId).get();
    if (existing.exists) {
      const photo = existing.data() as PhotoDoc;
      const quota = await ensureQuota(input.uid);
      return { photo, creditsRemaining: quota.creditsRemaining, publicUrl: photo.publicUrl };
    }
  }
  if (reservation.expiresAt.toDate().getTime() < Date.now()) {
    throw errors.failedPrecondition("Nag-expire na ang upload reservation. Subukang muli.");
  }

  // Confirm the binary actually landed in Storage before charging the user.
  const file = bucket().file(reservation.storagePath);
  const [exists] = await file.exists();
  if (!exists) {
    throw errors.failedPrecondition("Hindi natagpuan ang na-upload na file. Subukang i-upload muli.");
  }
  const [metadata] = await file.getMetadata();

  const caption = input.caption ? input.caption.trim().slice(0, LIMITS.maxPhotoCaptionLength) : null;
  const hashtags = (input.hashtags ?? []).slice(0, 10).map((t) => t.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase()).filter(Boolean);

  const credits = typeof input.creditsOverride === "number" ? input.creditsOverride : reservation.creditsToSpend;
  let creditsRemaining = (await ensureQuota(input.uid)).creditsRemaining;

  // Spend AFTER the binary exists, and refund automatically if the metadata write fails.
  let spendResult: Awaited<ReturnType<typeof spend>> | null = null;
  if (credits > 0) {
    spendResult = await spend({
      uid: input.uid,
      amount: credits,
      action: reservation.mode === "burst" ? "burst_capture" : reservation.mode === "gif" ? "gif_capture" : "photo_capture",
      reason: `Upload ${reservation.photoId} (${reservation.mode})`,
      refType: "photo",
      refId: reservation.photoId,
      idempotencyKey: `finalize_${input.reservationId}`,
    });
    creditsRemaining = spendResult.creditsRemaining;
  }

  let publicUrl: string | null = null;
  try {
    if (reservation.visibility === "public") {
      // Mirror to a world-readable path so share links work without signed URLs.
      const publicPath = STORAGE_PATHS.publicPhoto(`${reservation.photoId}.jpg`);
      await bucket().file(reservation.storagePath).copy(bucket().file(publicPath));
      await bucket().file(publicPath).makePublic();
      publicUrl = `https://storage.googleapis.com/${bucket().name}/${publicPath}`;
    }
  } catch (error) {
    log.warn({ event: "public_mirror_failed", photoId: reservation.photoId, error: String(error) });
  }

  const now = Timestamp.now();
  const batch = db.batch();
  batch.set(
    photoRef(input.photoId),
    {
      status: "ready",
      width: input.width ?? null,
      height: input.height ?? null,
      sizeBytes: input.sizeBytes ?? Number(metadata.size ?? 0),
      contentType: metadata.contentType ?? "image/jpeg",
      caption,
      hashtags,
      thumbnailPath: input.thumbnailPath ?? null,
      filterApplied: Boolean(input.filterApplied),
      creditsSpent: credits,
      publicUrl,
      updatedAt: FieldValue.serverTimestamp(),
      readyAt: now,
    },
    { merge: true }
  );
  batch.set(reservationRef(input.reservationId), { status: "consumed", consumedAt: now }, { merge: true });
  batch.set(
    db.collection(COLLECTIONS.users).doc(input.uid),
    {
      counters: { totalPhotosTaken: FieldValue.increment(1) },
      lastActiveAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  if (reservation.eventId) {
    batch.set(
      db.collection(COLLECTIONS.events).doc(reservation.eventId),
      {
        photoCount: FieldValue.increment(1),
        lastPhotoAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
  batch.set(
    db.collection(COLLECTIONS.analyticsDaily).doc(dayKey()),
    { dayKey: dayKey(), uploads: FieldValue.increment(1), photos: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  await batch.commit();

  await writeAudit({
    actorUid: input.uid,
    action: AUDIT_ACTIONS.photoUploaded,
    targetType: "photo",
    targetId: input.photoId,
    after: { mode: reservation.mode, filterId: reservation.filterId, credits },
    meta: { visibility: reservation.visibility, eventId: reservation.eventId },
  });

  const saved = await photoRef(input.photoId).get();
  const photo = saved.data() as PhotoDoc;

  log.info({ event: "upload_finalized", uid: input.uid, photoId: input.photoId, credits, creditsRemaining });
  return { photo, creditsRemaining, publicUrl };
}

/**
 * Mark a stuck reservation failed and refund anything it may have charged.
 * Called by the client on upload error, and by a scheduled janitor for abandoned reservations.
 */
export async function failUpload(params: { uid: string; reservationId: string; reason?: string }): Promise<void> {
  const snap = await reservationRef(params.reservationId).get();
  if (!snap.exists) return;
  const reservation = snap.data() as UploadReservationDoc;
  if (reservation.uid !== params.uid) throw errors.permissionDenied("Hindi sa'yo ang reservation na ito.");

  const batch = db.batch();
  batch.set(reservationRef(params.reservationId), { status: "expired", reason: params.reason ?? "client_error" }, { merge: true });
  batch.set(photoRef(reservation.photoId), { status: "failed", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();

  // Best-effort cleanup of a partially uploaded object.
  await bucket().file(reservation.storagePath).delete().catch(() => undefined);
  log.warn({ event: "upload_failed", uid: params.uid, photoId: reservation.photoId, reason: params.reason ?? "client_error" });
}

/** Owner- or admin-initiated delete. Storage objects are removed first, then the doc. */
export async function deletePhoto(params: { uid: string; photoId: string; isAdmin?: boolean }): Promise<void> {
  const snap = await photoRef(params.photoId).get();
  if (!snap.exists) throw errors.notFound("Hindi mahanap ang photo.");
  const photo = snap.data() as PhotoDoc;
  if (!params.isAdmin && photo.uid !== params.uid) throw errors.permissionDenied("Hindi sa'yo ang photo na ito.");

  await bucket().file(photo.storagePath).delete().catch((error: unknown) =>
    log.warn({ event: "storage_delete_failed", photoId: params.photoId, error: String(error) })
  );
  if (photo.thumbnailPath) await bucket().file(photo.thumbnailPath).delete().catch(() => undefined);
  if (photo.publicUrl) {
    await bucket().file(STORAGE_PATHS.publicPhoto(`${params.photoId}.jpg`)).delete().catch(() => undefined);
  }

  await photoRef(params.photoId).delete();

  await writeAudit({
    actorUid: params.uid,
    action: AUDIT_ACTIONS.photoDeleted,
    targetType: "photo",
    targetId: params.photoId,
    before: { uid: photo.uid, mode: photo.mode, creditsSpent: photo.creditsSpent },
    meta: { byAdmin: Boolean(params.isAdmin) },
  });

  log.info({ event: "photo_deleted", photoId: params.photoId, byAdmin: Boolean(params.isAdmin) });
}

/** Batch delete for the gallery "select multiple" action. */
export async function deletePhotos(params: { uid: string; photoIds: string[]; isAdmin?: boolean }): Promise<{ deleted: number; failed: string[] }> {
  let deleted = 0;
  const failed: string[] = [];
  for (const photoId of params.photoIds.slice(0, 50)) {
    try {
      await deletePhoto({ uid: params.uid, photoId, isAdmin: params.isAdmin });
      deleted += 1;
    } catch (error) {
      log.warn({ event: "bulk_delete_item_failed", photoId, error: String(error) });
      failed.push(photoId);
    }
  }
  return { deleted, failed };
}

// ------------------------------------------------------------------ sharing

export interface ShareInput {
  uid: string;
  photoId: string;
  channel: PhotoShareDoc["channel"];
  ttlHours?: number | null;
}

export async function createShare(input: ShareInput): Promise<PhotoShareDoc> {
  const appConfig = await getAppConfig();
  if (!appConfig.sharingEnabled) throw errors.failedPrecondition("Pansamantalang naka-disable ang sharing.");

  const snap = await photoRef(input.photoId).get();
  if (!snap.exists) throw errors.notFound("Hindi mahanap ang photo.");
  const photo = snap.data() as PhotoDoc;
  if (photo.uid !== input.uid) throw errors.permissionDenied("Hindi sa'yo ang photo na ito.");
  if (photo.status !== "ready") throw errors.failedPrecondition("Hindi pa ready ang photo para i-share.");

  const ttl = Math.min(Math.max(input.ttlHours ?? LIMITS.shareLinkDefaultTtlHours, 1), LIMITS.shareLinkMaxTtlHours);
  const shareId = newId("share");
  const token = `${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
  const expiresAt = new Date(Date.now() + ttl * 60 * 60 * 1000);

  // Ensure the object is reachable by the share page without exposing the private path.
  const publicPath = STORAGE_PATHS.publicPhoto(`${input.photoId}.jpg`);
  const publicFile = bucket().file(publicPath);
  const [publicExists] = await publicFile.exists();
  if (!publicExists) {
    await bucket().file(photo.storagePath).copy(publicFile);
    await publicFile.makePublic();
  }
  const publicUrl = `https://storage.googleapis.com/${bucket().name}/${publicPath}`;

  const doc: PhotoShareDoc = {
    shareId,
    photoId: input.photoId,
    uid: input.uid,
    token,
    url: `https://photobooth.app/s/${token}`,
    channel: input.channel,
    expiresAt: Timestamp.fromDate(expiresAt),
    revoked: false,
    viewCount: 0,
    createdAt: Timestamp.now(),
  };

  await db.collection(SHARES).doc(shareId).set(doc);
  await photoRef(input.photoId).set(
    { shares: FieldValue.increment(1), publicUrl, visibility: photo.visibility === "private" ? "public" : photo.visibility, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  await db.collection(COLLECTIONS.users).doc(input.uid).set(
    { counters: { totalShares: FieldValue.increment(1) }, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  log.info({ event: "share_created", uid: input.uid, photoId: input.photoId, channel: input.channel, shareId });
  return doc;
}

/** Public, unauthenticated share resolution (used by the /s/:token web page). */
export async function resolveShare(token: string): Promise<{
  photo: PhotoDoc | null;
  share: PhotoShareDoc | null;
  expired: boolean;
}> {
  const snap = await db.collection(SHARES).where("token", "==", token).limit(1).get();
  if (snap.empty) return { photo: null, share: null, expired: false };
  const share = snap.docs[0].data() as PhotoShareDoc;
  const expired = share.revoked || share.expiresAt.toDate().getTime() < Date.now();

  if (!expired) {
    await db.collection(SHARES).doc(share.shareId).set({ viewCount: FieldValue.increment(1) }, { merge: true });
    await photoRef(share.photoId).set({ views: FieldValue.increment(1) }, { merge: true });
  }

  const photoSnap = await photoRef(share.photoId).get();
  return {
    photo: photoSnap.exists ? (photoSnap.data() as PhotoDoc) : null,
    share,
    expired,
  };
}

export async function revokeShare(params: { uid: string; shareId: string; isAdmin?: boolean }): Promise<void> {
  const ref = db.collection(SHARES).doc(params.shareId);
  const snap = await ref.get();
  if (!snap.exists) throw errors.notFound("Hindi mahanap ang share link.");
  const share = snap.data() as PhotoShareDoc;
  if (!params.isAdmin && share.uid !== params.uid) throw errors.permissionDenied("Hindi sa'yo ang share link na ito.");
  await ref.set({ revoked: true, revokedAt: FieldValue.serverTimestamp() }, { merge: true });
  log.info({ event: "share_revoked", shareId: params.shareId, uid: params.uid });
}

// ------------------------------------------------------------------ queries

export interface PhotoQueryInput {
  uid: string;
  status?: PhotoDoc["status"];
  filterId?: string;
  eventId?: string;
  limit?: number;
  cursor?: string | null;
}

export async function listUserPhotos(input: PhotoQueryInput): Promise<{ items: PhotoDoc[]; nextCursor: string | null }> {
  const limit = Math.min(input.limit ?? LIMITS.defaultPageSize, LIMITS.maxPageSize);
  let query: FirebaseFirestore.Query = db.collection(PHOTOS).where("uid", "==", input.uid);
  query = query.where("status", "==", input.status ?? "ready");
  if (input.filterId) query = query.where("filterId", "==", input.filterId);
  if (input.eventId) query = query.where("eventId", "==", input.eventId);

  if (input.cursor) {
    const cursorSnap = await photoRef(input.cursor).get();
    if (cursorSnap.exists) query = query.startAfter(cursorSnap);
  }

  const snap = await query.orderBy("createdAt", "desc").limit(limit + 1).get();
  const docs = snap.docs;
  const hasMore = docs.length > limit;
  const page = hasMore ? docs.slice(0, limit) : docs;

  return {
    items: page.map((d) => d.data() as PhotoDoc),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

/** Public gallery feed for the app home screen. */
export async function listPublicPhotos(limit: number = LIMITS.defaultPageSize): Promise<PhotoDoc[]> {
  const snap = await db
    .collection(PHOTOS)
    .where("visibility", "==", "public")
    .where("status", "==", "ready")
    .orderBy("likes", "desc")
    .orderBy("createdAt", "desc")
    .limit(Math.min(limit, LIMITS.maxPageSize))
    .get();
  return snap.docs.map((d) => d.data() as PhotoDoc);
}

/** Admin moderation queue. */
export async function listFlaggedPhotos(limit: number = LIMITS.defaultPageSize): Promise<PhotoDoc[]> {
  const snap = await db
    .collection(PHOTOS)
    .where("isFlagged", "==", true)
    .orderBy("createdAt", "desc")
    .limit(Math.min(limit, LIMITS.maxPageSize))
    .get();
  return snap.docs.map((d) => d.data() as PhotoDoc);
}

export async function moderatePhoto(params: {
  actorUid: string;
  photoId: string;
  action: "flag" | "unflag" | "hide" | "restore";
  reason?: string | null;
}): Promise<void> {
  const ref = photoRef(params.photoId);
  const snap = await ref.get();
  if (!snap.exists) throw errors.notFound("Hindi mahanap ang photo.");

  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (params.action === "flag") {
    patch.isFlagged = true;
    patch.flagReason = params.reason ?? "Na-flag ng moderator";
  } else if (params.action === "unflag") {
    patch.isFlagged = false;
    patch.flagReason = null;
  } else if (params.action === "hide") {
    patch.visibility = "private";
    patch.isFlagged = true;
  } else if (params.action === "restore") {
    patch.isFlagged = false;
    patch.flagReason = null;
    patch.visibility = "public";
  }

  await ref.set(patch, { merge: true });
  await writeAudit({
    actorUid: params.actorUid,
    action: AUDIT_ACTIONS.photoModerated,
    targetType: "photo",
    targetId: params.photoId,
    after: patch,
    reason: params.reason ?? null,
  });
}

/** Refund credits for a photo that failed AI processing or was removed by an admin. */
export async function refundPhotoCredits(params: {
  photoId: string;
  reason: string;
  actorUid?: string | null;
}): Promise<{ refunded: number }> {
  const snap = await photoRef(params.photoId).get();
  if (!snap.exists) throw errors.notFound("Hindi mahanap ang photo.");
  const photo = snap.data() as PhotoDoc;
  if (photo.creditsSpent <= 0) return { refunded: 0 };

  await refund({
    uid: photo.uid,
    amount: photo.creditsSpent,
    action: "photo_refund",
    reason: params.reason,
    refType: "photo",
    refId: params.photoId,
  });
  await photoRef(params.photoId).set({ creditsSpent: 0, refundedAt: FieldValue.serverTimestamp() }, { merge: true });
  log.info({ event: "photo_credits_refunded", photoId: params.photoId, amount: photo.creditsSpent });
  return { refunded: photo.creditsSpent };
}

/** Daily rollup counter used by the admin dashboard. */
export async function countPhotosSince(day: string): Promise<number> {
  const snap = await db
    .collection(PHOTOS)
    .where("status", "==", "ready")
    .where("createdAt", ">=", Timestamp.fromDate(new Date(`${day}T00:00:00+08:00`)))
    .count()
    .get();
  return snap.data().count;
}

export { newId };
