/**
 * Firestore-backed gallery loading.
 *
 * The query shape is deliberately pinned to the composite index the backend ships
 * (`photos`: uid ASC + status ASC + createdAt DESC) so nothing has to be re-indexed
 * for this module. Visual filters (visibility / strip mode) are applied client-side
 * over the loaded page — see INTEGRATION.md §6 for why, and what to do when the
 * catalogue grows.
 *
 * A tiny AsyncStorage cache gives an instant first paint offline; it is only ever
 * used as a placeholder until the network page arrives (never as the source of truth).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { LIMITS } from '../constants';
import { getMyPhotos } from './cloudFunctions';
import type {
  GalleryCursor,
  GalleryItem,
  GalleryPage,
  PhotoUploadMode,
  PhotoVisibility,
  ProcessedStatus,
} from '../types';

const CACHE_KEY = (uid: string) => `photobooth.gallery.v1.${uid}`;
const CACHE_MAX = 24;

function toMs(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === 'number') return value;
  const candidate = value as { toMillis?: () => number; seconds?: number };
  if (typeof candidate.toMillis === 'function') return candidate.toMillis();
  if (typeof candidate.seconds === 'number') return candidate.seconds * 1000;
  return null;
}

export function mapPhotoDoc(id: string, data: DocumentData): GalleryItem {
  const createdAt = (data.createdAt ?? null) as GalleryItem['createdAt'];
  return {
    id,
    url: (data.publicUrl as string) || (data.url as string) || '',
    thumbUrl: (data.thumbnailUrl as string) || (data.thumbUrl as string) || null,
    filterId: (data.filterId as string) ?? 'none',
    caption: (data.caption as string) ?? null,
    visibility: ((data.visibility as PhotoVisibility) ?? 'private') as PhotoVisibility,
    status: ((data.status as ProcessedStatus) ?? 'ready') as ProcessedStatus,
    width: typeof data.width === 'number' ? data.width : null,
    height: typeof data.height === 'number' ? data.height : null,
    sizeBytes: typeof data.sizeBytes === 'number' ? data.sizeBytes : null,
    likes: typeof data.likes === 'number' ? data.likes : 0,
    shares: typeof data.shares === 'number' ? data.shares : 0,
    isFlagged: Boolean(data.isFlagged),
    mode: ((data.mode as PhotoUploadMode) ?? 'single') as PhotoUploadMode,
    createdAt,
    createdAtMs: toMs(createdAt),
  };
}

export type FetchGalleryParams = {
  uid: string;
  cursor?: GalleryCursor;
  pageSize?: number;
  status?: ProcessedStatus;
  signal?: { canceled: boolean };
};

/**
 * Reads one page directly from Firestore (client SDK).
 * Falls back to the `getMyPhotos` callable when the direct read is denied —
 * e.g. when rules tighten and a user has to read through the server.
 */
export async function fetchGalleryPage(params: FetchGalleryParams): Promise<GalleryPage> {
  const pageSize = params.pageSize ?? LIMITS.galleryPageSize;
  const status = params.status ?? 'ready';

  try {
    let q = query(
      collection(db, 'photos'),
      where('uid', '==', params.uid),
      where('status', '==', status),
      orderBy('createdAt', 'desc'),
      limit(pageSize)
    );

    if (params.cursor) {
      const cursorSnap = await getDoc(doc(db, 'photos', params.cursor));
      if (cursorSnap.exists()) {
        q = query(q, startAfter(cursorSnap as QueryDocumentSnapshot<DocumentData>));
      }
    }

    const snap = await getDocs(q);
    if (params.signal?.canceled) return { items: [], nextCursor: null };

    const items = snap.docs.map((d) => mapPhotoDoc(d.id, d.data()));
    const nextCursor = items.length === pageSize ? items[items.length - 1].id : null;
    return { items, nextCursor };
  } catch (error) {
    console.warn('[preview-editor] Direct gallery read failed, falling back to callable:', error);
    const fallback = await getMyPhotos({
      status,
      limit: pageSize,
      cursor: params.cursor ?? null,
    });
    const items = fallback.items.map((raw) => {
      const record = raw as Record<string, unknown> & { photoId?: string; id?: string };
      return mapPhotoDoc(String(record.photoId ?? record.id ?? ''), record as DocumentData);
    });
    return { items, nextCursor: fallback.nextCursor };
  }
}

// ------------------------------------------------------------------ cache

export async function readCachedGallery(uid: string): Promise<GalleryItem[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GalleryItem[];
    return Array.isArray(parsed) ? parsed.slice(0, CACHE_MAX) : [];
  } catch {
    return [];
  }
}

export async function writeCachedGallery(uid: string, items: GalleryItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY(uid), JSON.stringify(items.slice(0, CACHE_MAX)));
  } catch {
    // Cache is an optimisation; never surface a failure to the user.
  }
}

export async function clearCachedGallery(uid: string): Promise<void> {
  await AsyncStorage.removeItem(CACHE_KEY(uid)).catch(() => undefined);
}

// ------------------------------------------------------------------ client-side filters

/**
 * Applied over an already-loaded page. Uses `mode`/`visibility` fields rather than
 * a Firestore `where` so a new filter never needs a new composite index.
 */
export function applyVisualFilter(
  items: GalleryItem[],
  visual: 'all' | 'favorites' | 'public' | 'private' | 'strips',
  favoriteIds: string[] = []
): GalleryItem[] {
  switch (visual) {
    case 'public':
      return items.filter((i) => i.visibility === 'public');
    case 'private':
      return items.filter((i) => i.visibility === 'private');
    case 'strips':
      return items.filter((i) => i.mode === 'strip');
    case 'favorites':
      return items.filter((i) => favoriteIds.includes(i.id));
    case 'all':
    default:
      return items;
  }
}

export function dedupeById(items: GalleryItem[]): GalleryItem[] {
  const seen = new Set<string>();
  const output: GalleryItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    output.push(item);
  }
  return output;
}

export function sortByNewest(items: GalleryItem[]): GalleryItem[] {
  return [...items].sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
}