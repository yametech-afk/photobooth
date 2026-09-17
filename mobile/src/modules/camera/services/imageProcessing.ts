/**
 * Image pre-processing for upload — thin wrapper over expo-image-manipulator.
 * Kept separate so it can be stubbed in tests.
 */
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

export interface CompressOptions {
  maxWidth: number;
  compress: number;
}

export async function compressForUpload(uri: string, opts: CompressOptions) {
  return manipulateAsync(
    uri,
    [{ resize: { width: opts.maxWidth } }],
    { compress: opts.compress, format: SaveFormat.JPEG }
  );
}
