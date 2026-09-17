/**
 * Photo + filter + quota callables.
 *
 * UPLOAD PROTOCOL (three calls, never a byte-through-function route):
 *   requestPhotoUpload   → signed Storage PUT url + reservation id (quota pre-checked)
 *   [client PUTs the JPEG to Storage]
 *   finalizePhotoUpload  → verifies the object exists, then spends credits and publishes metadata
 *   reportUploadFailed   → refunds/rolls back a reservation the client could not complete
 */
import { onCall } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { guard, errors } from "../lib/errors";
import { resolveContext, requireAdmin } from "../lib/context";
import { enforceRateLimit } from "../lib/rateLimit";
import { withIdempotency } from "../lib/idempotency";
import {
  asHttpsValidationError,
  optionalInt,
  optionalString,
  optionalStringArray,
  requiredEnum,
  requiredInt,
  requiredString,
  requiredStringArray,
} from "../lib/validation";
import { log } from "../lib/logger";
import {
  createShare,
  deletePhoto,
  deletePhotos,
  finalizeUpload,
  listPublicPhotos,
  listUserPhotos,
  refundPhotoCredits,
  requestUpload,
  resolveShare,
  revokeShare,
} from "../services/photoService";
import { deleteFilter, incrementFilterUsage, listFilters, upsertFilter } from "../services/filterService";
import { getQuotaSummary, getLedger } from "../services/quotaService";
import { getCreditCosts } from "../services/configService";
import { logEvents } from "../services/analyticsService";
import type { PhotoDoc, PhotoVisibility } from "../models/types";
import type { FilterDoc } from "../services/filterService";

const OPTS = { region: REGION, cors: true, timeoutSeconds: 60, memory: "256MiB" as const };

// ------------------------------------------------------------------ quota

/** Balance + daily limit + credit costs, for the in-app quota widget. */
export const getQuota = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const [quota, costs] = await Promise.all([getQuotaSummary(ctx.uid, ctx.user?.plan ?? "free"), getCreditCosts()]);
    return { success: true as const, data: { quota, costs }, serverTime: new Date().toISOString() };
  })
);

/** Paginated credit history for the account screen. */
export const getCreditHistory = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const data = (request.data ?? {}) as { limit?: number };
    const entries = await getLedger(ctx.uid, requiredInt(data.limit, "limit", { min: 1, max: 100, fallback: 25 }));
    return { success: true as const, data: { entries }, serverTime: new Date().toISOString() };
  })
);

// ------------------------------------------------------------------ uploads

/** Step 1 — reserve a slot and get a signed upload URL. */
export const requestPhotoUpload = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    await enforceRateLimit(ctx.uid, "upload_request");

    const data = (request.data ?? {}) as Record<string, unknown>;
    try {
      const mode = requiredEnum(data.mode, "mode", ["single", "burst", "gif", "strip"], "single");
      const visibility = requiredEnum(data.visibility, "visibility", ["private", "event", "public"], "private");
      const eventId = optionalString(data.eventId ?? null, "eventId", { max: 64 });
      if (visibility === "event" && !eventId) {
        throw errors.invalidArgument("Kailangan ang eventId kapag event visibility.");
      }

      const result = await requestUpload({
        uid: ctx.uid,
        filterId: requiredString(data.filterId ?? "none", "filterId", { max: 64 }),
        mode,
        visibility: visibility as PhotoVisibility,
        eventId,
        bookingId: optionalString(data.bookingId ?? null, "bookingId", { max: 64 }),
        contentType: optionalString(data.contentType ?? null, "contentType", { max: 64 }) ?? undefined,
        sizeBytes: optionalInt(data.sizeBytes, "sizeBytes", { min: 0, max: 50 * 1024 * 1024 }) ?? 0,
        idempotencyKey: optionalString(data.idempotencyKey ?? null, "idempotencyKey", { max: 128 }),
      });

      return { success: true as const, data: result, serverTime: new Date().toISOString() };
    } catch (error) {
      asHttpsValidationError(error);
    }
  })
);

/** Step 2 — verify the binary and charge credits. */
export const finalizePhotoUpload = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    await enforceRateLimit(ctx.uid, "photo_upload");

    const data = (request.data ?? {}) as Record<string, unknown>;
    try {
      const reservationId = requiredString(data.reservationId, "reservationId", { max: 64 });
      const photoId = requiredString(data.photoId, "photoId", { max: 64 });

      const result = await finalizeUpload({
        uid: ctx.uid,
        reservationId,
        photoId,
        width: optionalInt(data.width, "width", { min: 1, max: 20000 }),
        height: optionalInt(data.height, "height", { min: 1, max: 20000 }),
        sizeBytes: optionalInt(data.sizeBytes, "sizeBytes", { min: 0, max: 50 * 1024 * 1024 }),
        caption: optionalString(data.caption ?? null, "caption", { max: 280 }),
        hashtags: optionalStringArray(data.hashtags, "hashtags", { maxItems: 10, maxItemLength: 30 }),
        thumbnailPath: optionalString(data.thumbnailPath ?? null, "thumbnailPath", { max: 256 }),
        filterApplied: Boolean(data.filterApplied),
        creditsOverride: optionalInt(data.creditsOverride, "creditsOverride", { min: 0, max: 100 }),
      });

      // Fire-and-forget analytics + filter popularity (never block the response).
      void logEvents({
        uid: ctx.uid,
        sessionId: optionalString(data.sessionId ?? null, "sessionId", { max: 64 }) ?? "unknown",
        platform: ctx.platform,
        appVersion: ctx.appVersion,
        events: [
          {
            name: "photo_upload_completed",
            params: { mode: result.photo.mode, filter: result.photo.filterId, size: result.photo.sizeBytes },
          },
        ],
      }).catch(() => undefined);
      void incrementFilterUsage(result.photo.filterId);

      return {
        success: true as const,
        data: {
          photoId: result.photo.photoId,
          status: result.photo.status,
          publicUrl: result.publicUrl,
          creditsRemaining: result.creditsRemaining,
          visibility: result.photo.visibility,
        },
        serverTime: new Date().toISOString(),
      };
    } catch (error) {
      asHttpsValidationError(error);
    }
  })
);

/** Client-side upload failure — release the reservation. */
export const reportUploadFailed = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const data = (request.data ?? {}) as Record<string, unknown>;
    const { failUpload } = await import("../services/photoService");
    await failUpload({
      uid: ctx.uid,
      reservationId: requiredString(data.reservationId, "reservationId", { max: 64 }),
      reason: optionalString(data.reason ?? null, "reason", { max: 200 }) ?? "client_error",
    });
    return { success: true as const, data: { released: true }, serverTime: new Date().toISOString() };
  })
);

// ------------------------------------------------------------------ photos

export const getMyPhotos = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const data = (request.data ?? {}) as Record<string, unknown>;
    const result = await listUserPhotos({
      uid: ctx.uid,
      status: (optionalString(data.status ?? null, "status", { max: 20 }) ?? "ready") as PhotoDoc["status"],
      filterId: optionalString(data.filterId ?? null, "filterId", { max: 64 }) ?? undefined,
      eventId: optionalString(data.eventId ?? null, "eventId", { max: 64 }) ?? undefined,
      limit: requiredInt(data.limit, "limit", { min: 1, max: 100, fallback: 25 }),
      cursor: optionalString(data.cursor ?? null, "cursor", { max: 64 }),
    });
    return { success: true as const, data: result, serverTime: new Date().toISOString() };
  })
);

export const getPublicGallery = onCall(OPTS, async (request) =>
  guard(async () => {
    const data = (request.data ?? {}) as { limit?: number };
    const items = await listPublicPhotos(requiredInt(data.limit, "limit", { min: 1, max: 100, fallback: 20 }));
    return { success: true as const, data: { items }, serverTime: new Date().toISOString() };
  })
);

export const deleteMyPhoto = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const data = (request.data ?? {}) as { photoId?: string; photoIds?: string[] };
    if (Array.isArray(data.photoIds)) {
      const photoIds = requiredStringArray(data.photoIds, "photoIds", { maxItems: 50, maxItemLength: 64 });
      const result = await deletePhotos({ uid: ctx.uid, photoIds });
      return { success: true as const, data: result, serverTime: new Date().toISOString() };
    }
    await deletePhoto({ uid: ctx.uid, photoId: requiredString(data.photoId, "photoId", { max: 64 }) });
    return { success: true as const, data: { deleted: 1 }, serverTime: new Date().toISOString() };
  })
);

// ------------------------------------------------------------------ sharing

export const createPhotoShare = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    await enforceRateLimit(ctx.uid, "share_create");
    const data = (request.data ?? {}) as Record<string, unknown>;

    const { result } = await withIdempotency(
      ctx.uid,
      "create_share",
      optionalString(data.idempotencyKey ?? null, "idempotencyKey", { max: 128 }),
      async () => {
        const share = await createShare({
          uid: ctx.uid,
          photoId: requiredString(data.photoId, "photoId", { max: 64 }),
          channel: requiredEnum(data.channel, "channel", ["link", "instagram", "tiktok", "facebook", "qr", "email"], "link"),
          ttlHours: optionalInt(data.ttlHours, "ttlHours", { min: 1, max: 336 }),
        });
        return { shareId: share.shareId, token: share.token, url: share.url, expiresAt: share.expiresAt.toDate().toISOString() };
      }
    );

    void logEvents({
      uid: ctx.uid,
      sessionId: optionalString(data.sessionId ?? null, "sessionId", { max: 64 }) ?? "unknown",
      platform: ctx.platform,
      appVersion: ctx.appVersion,
      events: [{ name: "photo_shared", params: { channel: String(data.channel ?? "link") } }],
    }).catch(() => undefined);

    return { success: true as const, data: result, serverTime: new Date().toISOString() };
  })
);

export const revokePhotoShare = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const data = (request.data ?? {}) as { shareId?: string };
    await revokeShare({ uid: ctx.uid, shareId: requiredString(data.shareId, "shareId", { max: 64 }) });
    return { success: true as const, data: { revoked: true }, serverTime: new Date().toISOString() };
  })
);

/** PUBLIC — used by the /s/:token web share page. No auth required. */
export const getSharedPhoto = onCall(
  { ...OPTS, timeoutSeconds: 20 },
  async (request) =>
    guard(async () => {
      const data = (request.data ?? {}) as { token?: string };
      const token = requiredString(data.token, "token", { max: 64 });
      const result = await resolveShare(token);
      if (!result.share) throw errors.notFound("Hindi mahanap ang share link.");

      // Never leak the private storage path through a public endpoint.
      return {
        success: true as const,
        data: {
          expired: result.expired,
          caption: result.photo?.caption ?? null,
          publicUrl: result.photo?.publicUrl ?? null,
          filterId: result.photo?.filterId ?? null,
          createdAt: result.photo?.createdAt ?? null,
          channel: result.share.channel,
        },
        serverTime: new Date().toISOString(),
      };
    })
);

// ------------------------------------------------------------------ filters

/** Public catalogue (the app caches this locally). */
export const getFilters = onCall(OPTS, async (request) =>
  guard(async () => {
    const data = (request.data ?? {}) as { includeInactive?: boolean };
    const includeInactive = Boolean(data.includeInactive && request.auth);
    const filters = await listFilters(includeInactive);
    return { success: true as const, data: { filters }, serverTime: new Date().toISOString() };
  })
);

// ------------------------------------------------------------------ admin: filters

export const adminUpsertFilter = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const admin = requireAdmin(ctx, ["superadmin", "admin"]);
    const data = (request.data ?? {}) as Record<string, unknown>;
    try {
      const filter = await upsertFilter({
        actorUid: admin.uid,
        filterId: optionalString(data.filterId ?? null, "filterId", { max: 64 }),
        data: {
          name: requiredString(data.name, "name", { max: 60 }),
          slug: requiredString(data.slug, "slug", { max: 60, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ }),
          description: optionalString(data.description ?? null, "description", { max: 300 }) ?? "",
          prompt: optionalString(data.prompt ?? null, "prompt", { max: 800 }) ?? "",
          negativePrompt: optionalString(data.negativePrompt ?? null, "negativePrompt", { max: 400 }) ?? undefined,
          strength: typeof data.strength === "number" ? Math.max(0, Math.min(data.strength, 1)) : undefined,
          isPremium: Boolean(data.isPremium),
          priceMinorUnits: optionalInt(data.priceMinorUnits, "priceMinorUnits", { min: 0, max: 10_000_000 }) ?? 0,
          currency: optionalString(data.currency ?? null, "currency", { max: 8 }) ?? "PHP",
          category: requiredEnum(
            data.category ?? "artistic",
            "category",
            ["basic", "artistic", "seasonal", "branded", "utility"],
            "artistic"
          ) as FilterDoc["category"],
          color: optionalString(data.color ?? null, "color", { max: 16 }) ?? "#FF4DA6",
          isActive: data.isActive === undefined ? true : Boolean(data.isActive),
          sortOrder: optionalInt(data.sortOrder, "sortOrder", { min: 0, max: 9999 }) ?? 0,
        },
      });
      const { invalidateConfigCache } = await import("../services/configService");
      invalidateConfigCache();
      return { success: true as const, data: { filter }, serverTime: new Date().toISOString() };
    } catch (error) {
      asHttpsValidationError(error);
    }
  })
);

export const adminDeleteFilter = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const admin = requireAdmin(ctx, ["superadmin", "admin"]);
    const data = (request.data ?? {}) as { filterId?: string };
    await deleteFilter({ actorUid: admin.uid, filterId: requiredString(data.filterId, "filterId", { max: 64 }) });
    return { success: true as const, data: { deleted: true }, serverTime: new Date().toISOString() };
  })
);

// ------------------------------------------------------------------ admin: photos

export const adminListFlaggedPhotos = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const admin = requireAdmin(ctx, ["superadmin", "admin", "moderator"]);
    const data = (request.data ?? {}) as { limit?: number };
    const { listFlaggedPhotos } = await import("../services/photoService");
    const items = await listFlaggedPhotos(requiredInt(data.limit, "limit", { min: 1, max: 100, fallback: 50 }));
    return { success: true as const, data: { items, moderator: admin.role }, serverTime: new Date().toISOString() };
  })
);

export const adminModeratePhoto = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const admin = requireAdmin(ctx, ["superadmin", "admin", "moderator"]);
    const data = (request.data ?? {}) as Record<string, unknown>;
    const { moderatePhoto } = await import("../services/photoService");
    await moderatePhoto({
      actorUid: admin.uid,
      photoId: requiredString(data.photoId, "photoId", { max: 64 }),
      action: requiredEnum(data.action, "action", ["flag", "unflag", "hide", "restore"], "flag"),
      reason: optionalString(data.reason ?? null, "reason", { max: 300 }),
    });
    return { success: true as const, data: { ok: true }, serverTime: new Date().toISOString() };
  })
);

export const adminDeletePhoto = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const admin = requireAdmin(ctx, ["superadmin", "admin"]);
    const data = (request.data ?? {}) as { photoId?: string; refundCredits?: boolean };
    const photoId = requiredString(data.photoId, "photoId", { max: 64 });
    if (data.refundCredits) {
      await refundPhotoCredits({ photoId, reason: `Deleted by admin ${admin.uid}`, actorUid: admin.uid });
    }
    await deletePhoto({ uid: admin.uid, photoId, isAdmin: true });
    return { success: true as const, data: { deleted: true }, serverTime: new Date().toISOString() };
  })
);

export { log };
