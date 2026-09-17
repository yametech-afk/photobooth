/**
 * Upload orchestration for the authoritative signed-URL protocol.
 *
 *   1. requestPhotoUpload   -> quota pre-check + reservation + signed PUT url
 *   2. PUT the JPEG straight to Cloud Storage (progress + cancel via expo-file-system)
 *   3. finalizePhotoUpload  -> server verifies the object, spends credits, publishes metadata
 *   on failure: reportUploadFailed -> release the reservation so quota is not burned
 *
 * Never base64 a photo through a callable — 10MB payloads exceed the request body
 * limit and there is no progress event.
 */
import * as FileSystem from 'expo-file-system';
import { LIMITS } from '../constants';
import { makeIdempotencyKey } from '../utils/format';
import { getFileSize, getImageDims, validateForUpload } from './imagePipeline';
import {
  finalizePhotoUpload,
  reportUploadFailed,
  requestPhotoUpload,
  type FinalizeUploadResult,
} from './cloudFunctions';
import type { PhotoUploadMode, PhotoVisibility, UploadStatus } from '../types';

export type StartUploadInput = {
  uid: string;
  fileUri: string;
  filterId: string;
  mode: PhotoUploadMode;
  visibility: PhotoVisibility;
  eventId?: string | null;
  bookingId?: string | null;
  caption?: string;
  hashtags?: string[];
  /** True when the colour grade was baked on device (GPU renderer). */
  filterApplied?: boolean;
  /** Already-baked dimensions, when known. */
  width?: number;
  height?: number;
  sizeBytes?: number;
  idempotencyKey?: string;
  sessionId?: string;
  thumbnailUri?: string;
  creditsOverride?: number;
};

export type UploadCallbacks = {
  onStatus?: (status: UploadStatus) => void;
  onProgress?: (progress: number) => void;
};

export type UploadOutcome = FinalizeUploadResult & {
  reservationId: string;
  attempts: number;
};

export type UploadHandle = {
  promise: Promise<UploadOutcome>;
  cancel: () => void;
};

const uploadTasks = new Map<string, FileSystem.UploadTask>();

export function isRetryable(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  // Quota / auth / validation problems need the user to act; network ones do not.
  if (message.includes('resource-exhausted')) return false;
  if (message.includes('permission-denied')) return false;
  if (message.includes('unauthenticated')) return false;
  if (message.includes('invalid-argument')) return false;
  if (message.includes('daily free limit')) return false;
  return true;
}

export function describeUploadError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw.toLowerCase();

  if (message.includes('resource-exhausted') || message.includes('daily free limit')) {
    return 'Naubos na ang daily free credits mo. Mag-upgrade sa Premium para sa unlimited.';
  }
  if (message.includes('permission-denied')) {
    return 'Hindi pinayagan ng server ang upload. I-refresh ang login at subukan ulit.';
  }
  if (message.includes('unauthenticated')) {
    return 'Kailangan mag-login muli bago mag-upload.';
  }
  if (message.includes('invalid-argument')) {
    return 'May maling detalye sa upload. I-try ulit.';
  }
  if (message.includes('timeout') || message.includes('network') || message.includes('nabigo ang upload')) {
    return 'Mahina ang koneksyon. Naka-save ang litrato sa device — pindutin ang Retry.';
  }
  return raw || 'Hindi natapos ang upload. Subukan ulit.';
}

/**
 * Starts one upload. Callers get a cancel handle immediately; the promise
 * settles with the server's finalize response or rejects with a described error.
 */
export function startUpload(input: StartUploadInput, callbacks: UploadCallbacks = {}): UploadHandle {
  let canceled = false;
  let currentTask: FileSystem.UploadTask | null = null;
  let reservationId: string | null = null;
  let attempts = 0;

  const setStatus = (status: UploadStatus) => callbacks.onStatus?.(status);

  const promise = (async (): Promise<UploadOutcome> => {
    try {
      setStatus('preparing');

      const validation = await validateForUpload(input.fileUri);
      if (!validation.ok) throw new Error(validation.reason);

      const sizeBytes = input.sizeBytes ?? validation.sizeBytes ?? (await getFileSize(input.fileUri));
      const dims =
        input.width && input.height
          ? { width: input.width, height: input.height }
          : await getImageDims(input.fileUri);

      const idempotencyKey =
        input.idempotencyKey ?? makeIdempotencyKey(input.uid, input.fileUri, input.filterId);

      if (canceled) throw new Error('Kinansela ang upload.');

      const reservation = await requestPhotoUpload({
        filterId: input.filterId,
        mode: input.mode,
        visibility: input.visibility,
        eventId: input.eventId ?? null,
        bookingId: input.bookingId ?? null,
        contentType: 'image/jpeg',
        sizeBytes,
        idempotencyKey,
      });
      reservationId = reservation.reservationId;

      if (canceled) {
        await reportUploadFailed({ reservationId, reason: 'client_canceled' }).catch(() => undefined);
        throw new Error('Kinansela ang upload.');
      }

      setStatus('uploading');
      const task = FileSystem.createUploadTask(
        reservation.uploadUrl,
        input.fileUri,
        {
          httpMethod: 'PUT',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: { 'Content-Type': 'image/jpeg' },
        },
        (progress) => {
          const total = progress.totalBytesExpectedToSend || sizeBytes || 1;
          const ratio = Math.min(1, progress.totalBytesSent / total);
          callbacks.onProgress?.(ratio);
        }
      );
      currentTask = task;
      uploadTasks.set(reservation.reservationId, task);

      const response = await task.uploadAsync();
      uploadTasks.delete(reservation.reservationId);

      if (canceled) {
        await reportUploadFailed({ reservationId, reason: 'client_canceled' }).catch(() => undefined);
        throw new Error('Kinansela ang upload.');
      }
      if (!response || response.status < 200 || response.status >= 300) {
        throw new Error(`Nabigo ang upload sa Storage (HTTP ${response?.status ?? '???'}).`);
      }

      callbacks.onProgress?.(1);
      setStatus('finalizing');

      let thumbnailPath: string | undefined;
      if (input.thumbnailUri) {
        thumbnailPath = await uploadThumbnail(input.thumbnailUri, input.uid, reservation.photoId);
      }

      const finalized = await finalizePhotoUpload({
        reservationId: reservation.reservationId,
        photoId: reservation.photoId,
        width: dims.width || undefined,
        height: dims.height || undefined,
        sizeBytes,
        caption: input.caption,
        hashtags: input.hashtags,
        thumbnailPath,
        filterApplied: input.filterApplied ?? input.filterId !== 'none',
        creditsOverride: input.creditsOverride,
        sessionId: input.sessionId,
      });

      attempts = 1;
      setStatus('done');
      return { ...finalized, reservationId: reservation.reservationId, attempts };
    } catch (error) {
      if (reservationId && !canceled) {
        // Best effort: release the reservation so a failed upload does not burn quota.
        await reportUploadFailed({
          reservationId,
          reason: error instanceof Error ? error.message.slice(0, 180) : 'unknown',
        }).catch(() => undefined);
      }
      setStatus(canceled ? 'canceled' : 'error');
      throw new Error(describeUploadError(error));
    }
  })();

  return {
    promise,
    cancel: () => {
      canceled = true;
      attempts = 0;
      const task = currentTask;
      if (task) {
        task.cancelAsync().catch(() => undefined);
      }
      if (reservationId) uploadTasks.delete(reservationId);
    },
  };
}

/**
 * Uploads the grid thumbnail through the same signed-URL handshake. Small file,
 * therefore a plain `uploadAsync` (no progress UI) is enough.
 */
async function uploadThumbnail(
  thumbUri: string,
  uid: string,
  sourcePhotoId: string
): Promise<string | undefined> {
  try {
    const sizeBytes = await getFileSize(thumbUri);
    if (sizeBytes <= 0) return undefined;

    const reservation = await requestPhotoUpload({
      filterId: 'thumbnail',
      mode: 'single',
      visibility: 'private',
      contentType: 'image/jpeg',
      sizeBytes,
      idempotencyKey: makeIdempotencyKey(uid, thumbUri, sourcePhotoId),
    });

    const res = await FileSystem.uploadAsync(reservation.uploadUrl, thumbUri, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { 'Content-Type': 'image/jpeg' },
    });
    if (res.status < 200 || res.status >= 300) return undefined;

    // The thumbnail is not a user-visible photo, so it must NOT be finalized as
    // one (that would spend a credit). Report it as a client-side release with the
    // storage path kept for the parent photo's metadata.
    await reportUploadFailed({
      reservationId: reservation.reservationId,
      reason: 'thumbnail_side_upload',
    }).catch(() => undefined);

    return reservation.storagePath;
  } catch (error) {
    console.warn('[preview-editor] Thumbnail upload skipped:', error);
    return undefined;
  }
}

/** Exponential backoff used by the queue's automatic retry. */
export function backoffMs(attempt: number): number {
  return Math.min(8000, 700 * 2 ** Math.max(0, attempt - 1));
}

export function assertWithinLimits(sizeBytes: number): void {
  if (sizeBytes > LIMITS.maxUploadBytes) {
    throw new Error('Sobrang laki ng file para sa upload (max 10MB).');
  }
}