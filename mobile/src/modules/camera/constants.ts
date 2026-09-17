/** Tunables for the camera module — single source of truth, no magic numbers in components. */

export const CAPTURE_QUALITY = 0.9;
export const BURST_DEFAULT_COUNT = 4;
export const MAX_BURST_COUNT = 8;
export const BURST_INTERVAL_MS = 750;

/** Photos are downscaled before upload to keep the signed-URL PUT fast on mobile data. */
export const MAX_UPLOAD_WIDTH = 1440;
export const UPLOAD_COMPRESS = 0.85;
export const UPLOAD_CONTENT_TYPE = 'image/jpeg';
