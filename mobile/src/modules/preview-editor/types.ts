/**
 * Shared types for the Photo Preview / Editor / Strip / Gallery / Share module.
 *
 * Kept intentionally free of React and Firebase *runtime* imports so screens,
 * hooks and services can all depend on one contract file.
 */
import type { Timestamp } from 'firebase/firestore';

/** A captured photo coming out of the camera module. */
export type PhotoSource = {
  uri: string;
  width?: number;
  height?: number;
  /** Bytes, when the camera module already knows it (avoids an extra stat). */
  sizeBytes?: number;
};

// ------------------------------------------------------------------ filters

export type FilterCategory = 'basic' | 'artistic' | 'seasonal' | 'branded' | 'utility';

/**
 * 'gpu'   -> rendered instantly on device through the expo-gl colour-grade shader.
 * 'cloud' -> rendered server-side by the AI pipeline; we only forward `id` as filterId.
 */
export type FilterRenderer = 'gpu' | 'cloud';

/** Uniform values for the fragment shader in services/filterRenderer.ts. */
export type ColorGrade = {
  /** -1 .. 1, 0 = neutral */
  brightness: number;
  /** 0 .. 2, 1 = neutral */
  contrast: number;
  /** 0 .. 2, 1 = neutral */
  saturation: number;
  /** 0 .. 1 mix towards sepia */
  sepia: number;
  /** 0 .. 1 mix towards greyscale */
  grayscale: number;
  /** 0 .. 1 channel inversion */
  invert: number;
  /** RGB multiply tint */
  tint: [number, number, number];
  /** 0 .. 1 blend of the tint */
  tintStrength: number;
  /** 0 .. 1 corner darkening */
  vignette: number;
};

export type FilterPreset = {
  id: string;
  name: string;
  category: FilterCategory;
  isPremium: boolean;
  renderer: FilterRenderer;
  /** Accent used by the offline filter chip / thumbnail fallback. */
  color: string;
  /** Present for renderer === 'gpu'. */
  grade?: Partial<ColorGrade>;
  /** Present for renderer === 'cloud' (shown as an AI badge in the UI). */
  prompt?: string;
};

// ------------------------------------------------------------------ editing

export type CropRatio = 'original' | '1:1' | '4:5' | '16:9' | '9:16';

export type TransformState = {
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  cropRatio: CropRatio;
  /** Long-edge target in px; undefined = keep source size. */
  resizeLongEdge?: number;
};

export type EditState = {
  transform: TransformState;
  grade: ColorGrade;
  filterId: string;
};

export const NEUTRAL_GRADE: ColorGrade = {
  brightness: 0,
  contrast: 1,
  saturation: 1,
  sepia: 0,
  grayscale: 0,
  invert: 0,
  tint: [1, 1, 1],
  tintStrength: 0,
  vignette: 0,
};

export const NEUTRAL_TRANSFORM: TransformState = {
  rotation: 0,
  flipH: false,
  flipV: false,
  cropRatio: 'original',
};

// ------------------------------------------------------------------ strips

export type StripVariantId = 'classic4' | 'film3' | 'duo2' | 'grid6' | 'polaroid1';

export type StripVariant = {
  id: StripVariantId;
  name: string;
  /** Photo slots, filled in capture order; extra photos are ignored. */
  slots: number;
  columns: number;
  /** Aspect ratio (w / h) of one photo cell. */
  cellRatio: number;
  description: string;
};

export type StripFrameId = 'retro' | 'neon' | 'film' | 'clean' | 'event';

export type StripFrame = {
  id: StripFrameId;
  name: string;
  background: string;
  accent: string;
  textColor: string;
};

export type StripConfig = {
  variant: StripVariantId;
  frame: StripFrameId;
  caption: string;
  showDateStamp: boolean;
  photoUris: string[];
};

// ------------------------------------------------------------------ uploads

export type PhotoVisibility = 'private' | 'event' | 'public';
export type PhotoUploadMode = 'single' | 'burst' | 'gif' | 'strip';
export type ProcessedStatus = 'ready' | 'processing' | 'failed' | 'deleted';

export type UploadStatus =
  | 'idle'
  | 'preparing'
  | 'uploading'
  | 'finalizing'
  | 'saving'
  | 'done'
  | 'error'
  | 'canceled';

export type UploadJob = {
  id: string;
  /** Local file uri being uploaded. */
  uri: string;
  filterId: string;
  mode: PhotoUploadMode;
  visibility: PhotoVisibility;
  eventId?: string | null;
  bookingId?: string | null;
  caption?: string;
  hashtags?: string[];
  idempotencyKey: string;
  status: UploadStatus;
  /** 0 .. 1 */
  progress: number;
  attempts: number;
  error: string | null;
  reservationId: string | null;
  photoId: string | null;
  publicUrl: string | null;
  sizeBytes: number;
  width?: number;
  height?: number;
  createdAt: number;
  updatedAt: number;
};

export type UploadResult = {
  photoId: string;
  publicUrl: string | null;
  creditsRemaining: number | 'unlimited';
  status: ProcessedStatus;
  visibility: PhotoVisibility;
};

// ------------------------------------------------------------------ gallery

export type GalleryItem = {
  id: string;
  url: string;
  thumbUrl: string | null;
  filterId: string;
  caption: string | null;
  visibility: PhotoVisibility;
  status: ProcessedStatus;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  likes: number;
  shares: number;
  isFlagged: boolean;
  mode: PhotoUploadMode;
  createdAt: Timestamp | null;
  /** Epoch ms mirror so list sorting survives a missing server timestamp. */
  createdAtMs: number | null;
};

export type GalleryCursor = string | null;

export type GalleryPage = {
  items: GalleryItem[];
  nextCursor: GalleryCursor;
};

export type GalleryVisualFilter = 'all' | 'favorites' | 'public' | 'private' | 'strips';

// ------------------------------------------------------------------ sharing

export type ShareChannel = 'link' | 'instagram' | 'tiktok' | 'facebook' | 'qr' | 'email';

export type ShareResult = {
  shareId: string;
  token: string;
  url: string;
  expiresAt: string;
};

export type SaveToDeviceResult = {
  assetUri: string;
  album: string | null;
};