/**
 * Save-to-device.
 *
 * Permissions are requested lazily (only when the user taps Save) because a cold
 * camera-roll prompt on first launch is the fastest way to get the app denied.
 * Platform notes are in INTEGRATION.md §5:
 *   iOS  -> NSPhotoLibraryAddUsageDescription (write-only, no read prompt needed)
 *   Android 13+ -> READ_MEDIA_IMAGES
 *   Android <=12 -> WRITE_EXTERNAL_STORAGE
 */
import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import type { SaveToDeviceResult } from '../types';

export const ALBUM_NAME = 'Photobooth';

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export async function getMediaPermission(): Promise<PermissionState> {
  const { status } = await MediaLibrary.getPermissionsAsync(true);
  return status as PermissionState;
}

/**
 * Requests the least privilege we can get away with: on iOS add-only access is
 * enough to save; we only ask for full access when the user actually needs to
 * read back from the roll (not part of this flow).
 */
export async function requestMediaPermission(): Promise<PermissionState> {
  const addOnly = Platform.OS === 'ios';
  const { status } = await MediaLibrary.requestPermissionsAsync(addOnly);
  return status as PermissionState;
}

async function ensurePermission(): Promise<void> {
  const current = await getMediaPermission();
  if (current === 'granted') return;
  const next = await requestMediaPermission();
  if (next !== 'granted') {
    throw new Error(
      'Kailangan ang photo library permission para maka-save sa device. Buksan ang Settings > Permissions.'
    );
  }
}

/**
 * Saves a local file into the Photobooth album.
 * `createAlbumAsync` is called with `copyAsset: false` so the file is not
 * duplicated when it is already inside the roll.
 */
export async function saveLocalFileToDevice(uri: string): Promise<SaveToDeviceResult> {
  await ensurePermission();
  const asset = await MediaLibrary.createAssetAsync(uri);

  let albumName: string | null = null;
  try {
    const existing = await MediaLibrary.getAlbumAsync(ALBUM_NAME);
    if (existing) {
      await MediaLibrary.addAssetsToAlbumAsync([asset], existing, false);
      albumName = existing.title ?? ALBUM_NAME;
    } else {
      const created = await MediaLibrary.createAlbumAsync(ALBUM_NAME, asset, false);
      albumName = created.title ?? ALBUM_NAME;
    }
  } catch (error) {
    // Album bookkeeping is a nicety; the asset is already saved at this point.
    console.warn('[preview-editor] Album creation skipped:', error);
  }

  return { assetUri: asset.uri, album: albumName };
}

/**
 * Downloads a remote photo (already uploaded) and then saves it, so "Save to
 * device" works from the gallery too and not just right after capture.
 */
export async function saveRemoteFileToDevice(
  remoteUrl: string,
  fileName?: string
): Promise<SaveToDeviceResult> {
  const dir = `${FileSystem.cacheDirectory}photobooth/downloads`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  const target = `${dir}/${fileName ?? `photobooth-${Date.now()}.jpg`}`;

  const downloaded = await FileSystem.downloadAsync(remoteUrl, target);
  if (downloaded.status !== 200) {
    throw new Error(`Nabigo ang download (HTTP ${downloaded.status}).`);
  }
  const result = await saveLocalFileToDevice(downloaded.uri);
  // Keep the cache tidy; the roll owns its own copy now.
  await FileSystem.deleteAsync(downloaded.uri, { idempotent: true }).catch(() => undefined);
  return result;
}

/** Opens the OS dialog that points at the freshly saved asset (best effort). */
export async function revealAsset(assetUri: string): Promise<void> {
  try {
    const asset = await MediaLibrary.getAssetInfoAsync(assetUri);
    if (asset?.uri) await MediaLibrary.getAssetInfoAsync(asset.uri);
  } catch {
    // Nothing to do — the user can open the Photos app manually.
  }
}