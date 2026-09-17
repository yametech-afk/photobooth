/**
 * Shared types for the Photobooth Camera module.
 * Kept dependency-free so the module stays portable across the monorepo.
 */

export type CameraPosition = 'front' | 'back';
export type CaptureMode = 'single' | 'burst';

export interface RawShot {
  uri: string;
  width?: number;
  height?: number;
}

export interface CapturedPhoto {
  uri: string;
  width?: number;
  height?: number;
  filterId: string;
  mode: CaptureMode;
  capturedAt: number;
}

export interface FilterDefinition {
  id: string;
  label: string;
  isPremium: boolean;
}

/**
 * Contract the camera module consumes for premium gating.
 * The default adapter bridges this to the monetization module
 * (src/monetization -> useFilterGate / canUseFilter).
 */
export interface PremiumFilterGate {
  canUseFilter(filterId: string): boolean;
  lockedFilterIds(): string[];
  /** Called when the user taps a locked filter — open the paywall here. */
  onLockedFilterTouched?(filterId: string): void;
}

/**
 * 3-step upload handoff contract matching the Firebase backend:
 * 1) requestPhotoUpload  -> signed URL + reservation (quota pre-checked)
 * 2) uploadFile          -> PUT the bytes to the signed URL
 * 3) finalizePhotoUpload -> server verifies file, debits credits, publishes metadata
 * 4) reportUploadFailed  -> best-effort rollback of the reservation
 */
export interface UploadReservation {
  reservationId: string;
  photoId: string;
  uploadUrl: string;
  storagePath: string;
}

export interface UploadHandoffResult {
  photoId: string;
  publicUrl?: string;
  status: 'ready' | 'failed';
}

export interface RequestUploadParams {
  filterId: string;
  mode: CaptureMode;
  eventId?: string | null;
}

export interface FinalizeMeta {
  filterId: string;
  mode: CaptureMode;
  width?: number;
  height?: number;
  sizeBytes?: number;
  contentType?: string;
  eventId?: string | null;
}

export interface UploadHandoff {
  requestPhotoUpload(params: RequestUploadParams): Promise<UploadReservation>;
  uploadFile(reservation: UploadReservation, fileUri: string, contentType: string): Promise<void>;
  finalizePhotoUpload(reservation: UploadReservation, meta: FinalizeMeta): Promise<UploadHandoffResult>;
  reportUploadFailed(reservation: UploadReservation, reason: string): Promise<void>;
}

export interface BurstOptions {
  count: number;
  intervalMs: number;
}

export interface BurstProgress {
  index: number;
  total: number;
  photos: CapturedPhoto[];
}

export type CameraPermissionStatus = 'undetermined' | 'granted' | 'denied';

export type UploadStatus =
  | 'idle'
  | 'compressing'
  | 'reserving'
  | 'uploading'
  | 'finalizing'
  | 'done'
  | 'error';

export interface DetectedFace {
  bounds: { x: number; y: number; width: number; height: number };
  rollAngle?: number;
  yawAngle?: number;
  smilingProbability?: number;
}
