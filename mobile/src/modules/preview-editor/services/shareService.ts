/**
 * Sharing.
 *
 * Two independent paths, and the UI offers both because they solve different
 * problems:
 *  - Local: the native share sheet with a `file://` uri. Works offline, hands the
 *    full-resolution file to Instagram / TikTok / WhatsApp, no server round trip.
 *  - Link: `createPhotoShare` mints a revocable token on the backend and returns a
 *    public `/s/{token}` page. Works even when the target app cannot take a file,
 *    and the user can revoke it later.
 */
import { Alert, Share, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as Clipboard from 'expo-clipboard';
import { SHARE_BASE_URL, LIMITS } from '../constants';
import { createPhotoShare, revokePhotoShare } from './cloudFunctions';
import { persistLocally } from './imagePipeline';
import type { ShareChannel, ShareResult } from '../types';

export type NativeShareOptions = {
  fileUri: string;
  message?: string;
  title?: string;
  /** Set on iOS so the sheet shows a real filename instead of IMG_0001.JPG. */
  fileName?: string;
};

/**
 * Opens the OS share sheet with the image attached.
 * The file is first copied into our own cache dir: temp camera files are deleted
 * by the OS while the sheet is open, which produces a "file not found" toast in
 * the receiving app on slower devices.
 */
export async function shareFileNatively(options: NativeShareOptions): Promise<boolean> {
  const stable = await persistLocally(options.fileUri, options.fileName);

  try {
    const result = await Share.share(
      {
        title: options.title ?? 'Photobooth',
        message: options.message ?? 'Gawa sa Photobooth 📸',
        url: stable,
      },
      {
        dialogTitle: options.title ?? 'I-share ang litrato',
        subject: options.title ?? 'Photobooth photo',
        ...(Platform.OS === 'ios' ? { excludedActivityTypes: [] } : {}),
      }
    );
    return result.action === Share.sharedAction;
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'Hindi mabuksan ang share sheet.'
    );
  }
}

/** Platform-specific intent used when the user picks a named app instead of "Share…". */
export function appChannelFor(platform: string): ShareChannel {
  switch (platform) {
    case 'instagram':
      return 'instagram';
    case 'tiktok':
      return 'tiktok';
    case 'facebook':
      return 'facebook';
    case 'email':
      return 'email';
    default:
      return 'link';
  }
}

/**
 * Best-effort deep link into a specific app. Returns false when the app is not
 * installed so the caller can fall back to the generic share sheet.
 */
export async function tryOpenAppForShare(
  channel: ShareChannel,
  fileUri: string
): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  const schemes: Partial<Record<ShareChannel, string>> = {
    instagram: 'instagram://library?AssetPath=',
    tiktok: 'snssdk1233://',
    facebook: 'fb://',
  };
  const scheme = schemes[channel];
  if (!scheme) return false;

  const can = await Linking.canOpenURL(scheme).catch(() => false);
  if (!can) return false;

  try {
    const url = channel === 'instagram' ? `${scheme}${encodeURIComponent(fileUri)}` : scheme;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/** Creates (or reuses) a revocable public link for a photo that already lives in Firebase. */
export async function createShareLink(params: {
  photoId: string;
  channel?: ShareChannel;
  ttlHours?: number;
  sessionId?: string;
}): Promise<ShareResult> {
  return createPhotoShare({
    photoId: params.photoId,
    channel: params.channel ?? 'link',
    ttlHours: Math.min(
      Math.max(params.ttlHours ?? LIMITS.shareTtlHours.default, LIMITS.shareTtlHours.min),
      LIMITS.shareTtlHours.max
    ),
    sessionId: params.sessionId,
  });
}

export async function revokeShareLink(shareId: string): Promise<void> {
  await revokePhotoShare(shareId);
}

/** Canonical public url for a token. Falls back to the module constant when the
 *  backend has not been configured with a custom domain yet. */
export function buildShareUrl(token: string): string {
  return `${SHARE_BASE_URL}/${token}`;
}

export async function copyToClipboard(value: string): Promise<void> {
  await Clipboard.setStringAsync(value);
}

/**
 * Share a link through the native sheet. Returns the minted ShareResult so the
 * caller can show a "revoke" affordance while the link is still alive.
 */
export async function shareLinkForPhoto(params: {
  photoId: string;
  caption?: string;
  channel?: ShareChannel;
  ttlHours?: number;
  sessionId?: string;
}): Promise<ShareResult> {
  const share = await createShareLink(params);
  const url = share.url || buildShareUrl(share.token);

  await Share.share(
    {
      title: 'Photobooth link',
      message: params.caption ? `${params.caption}\n${url}` : url,
      url,
    },
    { dialogTitle: 'I-share ang link' }
  );

  return share;
}

/** Long-press helper used by the gallery sheet. */
export function offerCopyLink(url: string): void {
  Alert.alert('Share link', url, [
    { text: 'Kopyahin', onPress: () => void copyToClipboard(url) },
    { text: 'Isara', style: 'cancel' },
  ]);
}