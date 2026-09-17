/**
 * On-device image pipeline built on expo-image-manipulator.
 *
 * Responsibility split:
 *  - Geometry (rotate / flip / crop / resize) and container/compression changes
 *    happen here and produce a *new local file*.
 *  - Colour grading happens on the GPU (services/filterRenderer.ts) and is baked
 *    with `GLView.takeSnapshotAsync`. Keeping them apart means a colour scrub
 *    costs no file I/O, and a rotation does not have to re-run the shader.
 */
import { Image } from 'react-native';
import {
  manipulateAsync,
  SaveFormat,
  FlipType,
  type Action,
} from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { LIMITS } from '../constants';
import { clamp } from '../utils/format';
import type { ColorGrade, CropRatio, TransformState } from '../types';

export type ImageDims = { width: number; height: number };

const RATIO_VALUES: Record<Exclude<CropRatio, 'original'>, number> = {
  '1:1': 1,
  '4:5': 4 / 5,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
};

/** Reads intrinsic dimensions by running an empty manipulation (cached by the module). */
const dimsCache = new Map<string, ImageDims>();

export async function getImageDims(uri: string): Promise<ImageDims> {
  const cached = dimsCache.get(uri);
  if (cached) return cached;

  try {
    const result = await manipulateAsync(uri, [], { compress: 1, format: SaveFormat.JPEG });
    const dims = { width: result.width, height: result.height };
    dimsCache.set(uri, dims);
    return dims;
  } catch (error) {
    // Fall back to the RN Image cache, which works for remote uris too.
    const dims = await new Promise<ImageDims>((resolve) =>
      Image.getSize(
        uri,
        (width, height) => resolve({ width, height }),
        () => resolve({ width: 0, height: 0 })
      )
    );
    dimsCache.set(uri, dims);
    return dims;
  }
}

/** Square-centred crop rect for a target aspect ratio. */
export function computeCropRect(
  dims: ImageDims,
  ratio: CropRatio
): { originX: number; originY: number; width: number; height: number } | null {
  if (ratio === 'original' || dims.width <= 0 || dims.height <= 0) return null;
  const target = RATIO_VALUES[ratio];

  // After a 90/270 rotation the visual aspect swaps, so compute against the
  // orientation the user actually sees.
  const current = dims.width / dims.height;
  let width = dims.width;
  let height = dims.height;

  if (current > target) {
    width = Math.round(dims.height * target);
  } else {
    height = Math.round(dims.width / target);
  }

  return {
    originX: Math.round((dims.width - width) / 2),
    originY: Math.round((dims.height - height) / 2),
    width,
    height,
  };
}

function dimsAfterRotation(dims: ImageDims, rotation: number): ImageDims {
  return rotation % 180 === 0 ? dims : { width: dims.height, height: dims.width };
}

/**
 * Bakes geometry + compression into a fresh JPEG.
 * Returns the file uri plus the final dimensions so the caller can pass them to
 * `finalizePhotoUpload` (the backend stores width/height for the gallery grid).
 */
export async function bakeGeometry(
  uri: string,
  transform: TransformState,
  opts: { quality?: number; maxLongEdge?: number } = {}
): Promise<{ uri: string; width: number; height: number }> {
  const source = await getImageDims(uri);
  const actions: Action[] = [];

  if (transform.rotation !== 0) actions.push({ rotate: transform.rotation });
  if (transform.flipH) actions.push({ flip: FlipType.Horizontal });
  if (transform.flipV) actions.push({ flip: FlipType.Vertical });

  const rotated = dimsAfterRotation(source, transform.rotation);
  const crop = computeCropRect(rotated, transform.cropRatio);
  if (crop) actions.push({ crop });

  const visible = crop ? { width: crop.width, height: crop.height } : rotated;
  const longEdge = Math.max(visible.width, visible.height);
  const ceiling = clamp(
    opts.maxLongEdge ?? transform.resizeLongEdge ?? LIMITS.defaultResizeLongEdge,
    320,
    LIMITS.maxResizeLongEdge
  );
  if (longEdge > ceiling) {
    actions.push(
      visible.width >= visible.height
        ? { resize: { width: ceiling } }
        : { resize: { height: ceiling } }
    );
  }

  // expo-image-manipulator refuses an empty action list on some platforms, so
  // always run at least one pass to normalise the JPEG container.
  const result = await manipulateAsync(uri, actions.length > 0 ? actions : [], {
    compress: clamp(opts.quality ?? 0.92, 0.3, 1),
    format: SaveFormat.JPEG,
  });

  dimsCache.set(result.uri, { width: result.width, height: result.height });
  return { uri: result.uri, width: result.width, height: result.height };
}

/**
 * Lightweight downscale used for the grid thumbnail. A separate small file keeps
 * the gallery fast on mid-range Android without the user paying 4K bytes twice.
 */
export async function makeThumbnail(uri: string, width = 480): Promise<string> {
  const result = await manipulateAsync(uri, [{ resize: { width } }], {
    compress: 0.7,
    format: SaveFormat.JPEG,
  });
  return result.uri;
}

export async function getFileSize(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true });
    return info.exists && typeof info.size === 'number' ? info.size : 0;
  } catch {
    return 0;
  }
}

/** Copies a temp/cache file into the module's own scratch dir so it survives cleanup. */
export async function persistLocally(uri: string, name?: string): Promise<string> {
  const dir = `${FileSystem.cacheDirectory}photobooth/exports`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  const target = `${dir}/${name ?? `photo-${Date.now()}.jpg`}`;
  await FileSystem.copyAsync({ from: uri, to: target });
  return target;
}

export async function deleteLocal(uri: string): Promise<void> {
  if (!uri.startsWith('file://')) return;
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}

/**
 * Sanity gate before upload — mirrors storage.rules so the user gets a clear
 * message instead of an opaque PERMISSION_DENIED three seconds later.
 */
export async function validateForUpload(
  uri: string,
  contentType = 'image/jpeg'
): Promise<{ ok: true; sizeBytes: number } | { ok: false; reason: string }> {
  const sizeBytes = await getFileSize(uri);
  if (sizeBytes <= 0) return { ok: false, reason: 'Hindi mabasa ang file. Subukan ulit ang pag-save.' };
  if (sizeBytes > LIMITS.maxUploadBytes) {
    return {
      ok: false,
      reason: `Sobrang laki (${Math.round(sizeBytes / 1024 / 1024)}MB). Limitasyon: 10MB.`,
    };
  }
  if (!LIMITS.allowedContentTypes.includes(contentType)) {
    return { ok: false, reason: `Hindi suportadong format: ${contentType}.` };
  }
  return { ok: true, sizeBytes };
}

/** Applies `grade` values onto a 0..1 progress-friendly merge (used by presets). */
export function mergeGrade(base: ColorGrade, patch: Partial<ColorGrade>): ColorGrade {
  return { ...base, ...patch };
}