/**
 * Route params owned by this module.
 *
 * These are the additions the mobile-core `MainStackParamList` needs — the
 * `PhotoPreview` entry already exists there and is mirrored here for reference.
 * INTEGRATION.md §2 shows the exact patch for navigation/types.ts.
 */
import type { PhotoUploadMode, PhotoSource, StripVariantId } from '../types';

export type PhotoScreenParams = {
  /** Already declared by the mobile-core module — read, do not redefine. */
  PhotoPreview: {
    photos: PhotoSource[];
    filter: string;
  };
  /** Full-screen editor for a single photo. */
  PhotoEditor: {
    uri: string;
    filterId: string;
    width?: number;
    height?: number;
    mode?: PhotoUploadMode;
    /** Set when the editor was opened from the gallery (enables re-upload). */
    photoId?: string;
  };
  /** Strip composer: arranges the captured burst into a printable strip. */
  StripLayout: {
    photos: PhotoSource[];
    filterId?: string;
    variant?: StripVariantId;
  };
};

/** Union of every route this module registers. */
export type PreviewEditorRouteName = keyof PhotoScreenParams;