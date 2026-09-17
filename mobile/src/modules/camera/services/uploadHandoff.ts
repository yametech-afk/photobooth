/**
 * Upload handoff — implements the backend's 3-step protocol behind the
 * UploadHandoff interface so the camera screens never touch Firebase directly:
 *
 *   1. requestPhotoUpload   (callable)  -> quota pre-check + reservation + signed URL
 *   2. uploadFile           (fetch PUT) -> bytes to the signed Storage URL
 *   3. finalizePhotoUpload  (callable)  -> server verifies file, debits credits
 *   4. reportUploadFailed   (callable)  -> best-effort reservation rollback
 *
 * `getFunctions` is injected so this stays testable and so the module can be
 * wired to emulators (connectFunctionsEmulator) without code changes.
 */
import type {
  FinalizeMeta,
  RequestUploadParams,
  UploadHandoff,
  UploadHandoffResult,
  UploadReservation,
} from '../types';
import { UPLOAD_CONTENT_TYPE, MAX_UPLOAD_WIDTH, UPLOAD_COMPRESS } from '../constants';
import { compressForUpload } from './imageProcessing';

/** Minimal structural type over firebase/functions' Functions instance. */
export interface FunctionsLike {
  httpsCallable(name: string): (payload: unknown) => Promise<{ data: unknown }>;
}

export function createUploadHandoff(functions: FunctionsLike): UploadHandoff {
  const call = async <T>(name: string, payload: unknown): Promise<T> => {
    const fn = functions.httpsCallable(name);
    const res = await fn(payload);
    return res.data as T;
  };

  return {
    async requestPhotoUpload(params: RequestUploadParams): Promise<UploadReservation> {
      const data = await call<{
        reservationId: string;
        photoId: string;
        uploadUrl: string;
        storagePath: string;
      }>('requestPhotoUpload', {
        filterId: params.filterId,
        mode: params.mode,
        eventId: params.eventId ?? null,
      });
      return data;
    },

    async uploadFile(
      reservation: UploadReservation,
      fileUri: string,
      _contentType: string = UPLOAD_CONTENT_TYPE
    ): Promise<void> {
      // Downscale before the PUT so uploads stay fast on mobile data.
      const compressed = await compressForUpload(fileUri, {
        maxWidth: MAX_UPLOAD_WIDTH,
        compress: UPLOAD_COMPRESS,
      });
      const blob = await fetch(compressed.uri).then((r) => r.blob());
      const res = await fetch(reservation.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': UPLOAD_CONTENT_TYPE },
        body: blob,
      });
      if (!res.ok) throw new Error(`Signed-URL upload failed: HTTP ${res.status}`);
    },

    async finalizePhotoUpload(
      reservation: UploadReservation,
      meta: FinalizeMeta
    ): Promise<UploadHandoffResult> {
      const data = await call<{ photoId: string; publicUrl?: string }>(
        'finalizePhotoUpload',
        {
          reservationId: reservation.reservationId,
          photoId: reservation.photoId,
          storagePath: reservation.storagePath,
          filterId: meta.filterId,
          mode: meta.mode,
          width: meta.width,
          height: meta.height,
          sizeBytes: meta.sizeBytes,
          contentType: meta.contentType ?? UPLOAD_CONTENT_TYPE,
          eventId: meta.eventId ?? null,
        }
      );
      return { ...data, status: 'ready' };
    },

    async reportUploadFailed(reservation: UploadReservation, reason: string): Promise<void> {
      try {
        await call('reportUploadFailed', {
          reservationId: reservation.reservationId,
          photoId: reservation.photoId,
          reason,
        });
      } catch {
        // Best effort: if the rollback call also fails, the TTL (30 min) cleans up.
      }
    },
  };
}
