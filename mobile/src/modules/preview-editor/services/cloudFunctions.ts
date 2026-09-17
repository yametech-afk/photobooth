/**
 * Typed wrappers for every Cloud Function this module calls.
 *
 * Contract source: `functions/src/callables/photos.ts` in the backend module.
 * Every callable answers with the envelope `{ success, data, serverTime }`, but
 * firebase's `httpsCallable` already unwraps `data`, so the types below describe
 * the *inner* `data` object — call sites therefore read `res.reservationId`.
 *
 * The legacy single-shot `uploadPhoto(base64)` callable from the mobile-core
 * module is kept behind `legacyUploadPhoto()` for backwards compatibility. The
 * signed-URL protocol below is the supported path: the photo never travels
 * through a function body.
 */
import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from '../../../services/firebase';
import { FUNCTIONS_REGION } from '../constants';
import type {
  PhotoUploadMode,
  PhotoVisibility,
  ProcessedStatus,
  ShareChannel,
  ShareResult,
  UploadResult,
} from '../types';

// The backend deploys every callable to asia-southeast1 (see REGION in
// functions/src/config/constants.ts). Omitting the region here yields a
// "function not found" error at runtime on a real project, so pin it.
const functions = getFunctions(firebaseApp, FUNCTIONS_REGION);

// ------------------------------------------------------------------ uploads

export type RequestUploadInput = {
  filterId: string;
  mode: PhotoUploadMode;
  visibility: PhotoVisibility;
  eventId?: string | null;
  bookingId?: string | null;
  contentType?: string;
  sizeBytes?: number;
  idempotencyKey?: string;
};

export type RequestUploadResult = {
  reservationId: string;
  photoId: string;
  storagePath: string;
  uploadUrl: string;
  expiresAt: string | { seconds: number } | null;
  contentType: string;
  creditsToSpend: number;
  mode: PhotoUploadMode;
  visibility: PhotoVisibility;
};

export type FinalizeUploadInput = {
  reservationId: string;
  photoId: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  caption?: string;
  hashtags?: string[];
  thumbnailPath?: string;
  filterApplied?: boolean;
  creditsOverride?: number;
  sessionId?: string;
};

export type FinalizeUploadResult = {
  photoId: string;
  status: ProcessedStatus;
  publicUrl: string | null;
  creditsRemaining: number | 'unlimited';
  visibility: PhotoVisibility;
};

/** Step 1 — reserve quota and get a signed Storage PUT url. */
export async function requestPhotoUpload(input: RequestUploadInput): Promise<RequestUploadResult> {
  const callable = httpsCallable<RequestUploadInput, RequestUploadResult>(
    functions,
    'requestPhotoUpload'
  );
  const res = await callable(input);
  return res.data;
}

/** Step 2 — confirm the object exists; this is where credits are spent. */
export async function finalizePhotoUpload(input: FinalizeUploadInput): Promise<FinalizeUploadResult> {
  const callable = httpsCallable<FinalizeUploadInput, FinalizeUploadResult>(
    functions,
    'finalizePhotoUpload'
  );
  const res = await callable(input);
  return res.data;
}

/** Roll back a reservation the client could not complete. */
export async function reportUploadFailed(params: {
  reservationId: string;
  reason?: string;
}): Promise<{ released: boolean }> {
  const callable = httpsCallable<{ reservationId: string; reason?: string }, { released: boolean }>(
    functions,
    'reportUploadFailed'
  );
  const res = await callable({ reservationId: params.reservationId, reason: params.reason });
  return res.data;
}

/** Quota widget: balance + daily limit + credit costs. */
export async function getQuota(): Promise<{
  quota: Record<string, unknown>;
  costs: Record<string, number>;
}> {
  const callable = httpsCallable<void, { quota: Record<string, unknown>; costs: Record<string, number> }>(
    functions,
    'getQuota'
  );
  const res = await callable();
  return res.data;
}

/** Current plan + credits — used to decide filter gating and watermarking. */
export async function getMySubscription(): Promise<Record<string, unknown>> {
  const callable = httpsCallable<void, Record<string, unknown>>(functions, 'getMySubscription');
  const res = await callable();
  return res.data;
}

// ------------------------------------------------------------------ photos

export type GetMyPhotosInput = {
  status?: ProcessedStatus;
  filterId?: string;
  eventId?: string;
  limit?: number;
  cursor?: string | null;
};

export type GetMyPhotosResult = {
  items: Record<string, unknown>[];
  nextCursor: string | null;
};

/** Server-side paginated gallery (used as the fallback when a direct read is denied). */
export async function getMyPhotos(input: GetMyPhotosInput): Promise<GetMyPhotosResult> {
  const callable = httpsCallable<GetMyPhotosInput, GetMyPhotosResult>(functions, 'getMyPhotos');
  const res = await callable(input);
  return res.data;
}

export async function deleteMyPhoto(photoId: string): Promise<{ deleted: number }> {
  const callable = httpsCallable<{ photoId: string }, { deleted: number }>(functions, 'deleteMyPhoto');
  const res = await callable({ photoId });
  return res.data;
}

export async function deleteMyPhotos(photoIds: string[]): Promise<{ deleted: number; failed: string[] }> {
  const callable = httpsCallable<
    { photoIds: string[] },
    { deleted: number; failed: string[] }
  >(functions, 'deleteMyPhoto');
  const res = await callable({ photoIds });
  return res.data;
}

// ------------------------------------------------------------------ sharing

export async function createPhotoShare(params: {
  photoId: string;
  channel: ShareChannel;
  ttlHours?: number;
  idempotencyKey?: string;
  sessionId?: string;
}): Promise<ShareResult> {
  const callable = httpsCallable<typeof params, ShareResult>(functions, 'createPhotoShare');
  const res = await callable(params);
  return res.data;
}

export async function revokePhotoShare(shareId: string): Promise<{ revoked: boolean }> {
  const callable = httpsCallable<{ shareId: string }, { revoked: boolean }>(
    functions,
    'revokePhotoShare'
  );
  const res = await callable({ shareId });
  return res.data;
}

/** Public — resolves a share token without auth (used by the /s/:token web page). */
export async function getSharedPhoto(token: string): Promise<{
  expired: boolean;
  publicUrl: string | null;
  caption: string | null;
  filterId: string | null;
}> {
  const callable = httpsCallable<
    { token: string },
    { expired: boolean; publicUrl: string | null; caption: string | null; filterId: string | null }
  >(functions, 'getSharedPhoto');
  const res = await callable({ token });
  return res.data;
}

// ------------------------------------------------------------------ legacy

/**
 * Deprecated single-shot upload kept from the mobile-core module
 * (`src/services/functions.ts`). Do not use for new code — the photo has to be
 * base64'd into the request body, which blows past the 10 MB callable limit.
 */
export async function legacyUploadPhoto(params: {
  photoBase64: string;
  filterId: string;
  eventId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<{
  success: boolean;
  photoId: string;
  url: string;
  remainingCredits: number | 'unlimited';
}> {
  const callable = httpsCallable<typeof params, {
    success: boolean;
    photoId: string;
    url: string;
    remainingCredits: number | 'unlimited';
  }>(functions, 'uploadPhoto');
  const res = await callable(params);
  return res.data;
}

export type { UploadResult };