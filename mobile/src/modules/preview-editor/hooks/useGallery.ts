/**
 * Gallery data hook: cursor pagination + pull-to-refresh + optimistic delete
 * with rollback when the server refuses.
 *
 * Offline behaviour: the last successful page is cached in AsyncStorage and shown
 * immediately (marked as cached) while the live query runs.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyVisualFilter,
  dedupeById,
  fetchGalleryPage,
  readCachedGallery,
  sortByNewest,
  writeCachedGallery,
} from '../services/galleryService';
import { deleteLocal } from '../services/imagePipeline';
import { LIMITS } from '../constants';
import type { GalleryItem, GalleryVisualFilter } from '../types';

export type UseGalleryOptions = {
  uid: string | null;
  pageSize?: number;
  autoLoad?: boolean;
};

export type UseGalleryApi = {
  items: GalleryItem[];
  /** Items after the visual filter — what the grid should render. */
  visibleItems: GalleryItem[];
  loading: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  error: string | null;
  fromCache: boolean;
  hasMore: boolean;
  visualFilter: GalleryVisualFilter;
  setVisualFilter: (filter: GalleryVisualFilter) => void;
  favoriteIds: string[];
  toggleFavorite: (photoId: string) => void;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  retry: () => Promise<void>;
  /** Optimistic delete; resolves false when the server refused and we rolled back. */
  removeItem: (photoId: string) => Promise<boolean>;
  removeMany: (photoIds: string[]) => Promise<{ deleted: number; failed: string[] }>;
  /** Merge a freshly uploaded photo in without a full refetch. */
  prependItem: (item: GalleryItem) => void;
};

export function useGallery(options: UseGalleryOptions): UseGalleryApi {
  const { uid, pageSize = LIMITS.galleryPageSize, autoLoad = true } = options;

  const [items, setItems] = useState<GalleryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [visualFilter, setVisualFilter] = useState<GalleryVisualFilter>('all');
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  const signalRef = useRef({ canceled: false });

  const loadFirstPage = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!uid) {
        setItems([]);
        setHasMore(false);
        return;
      }

      signalRef.current.canceled = true;
      signalRef.current = { canceled: false };
      const signal = signalRef.current;

      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      setError(null);

      if (mode === 'initial') {
        const cached = await readCachedGallery(uid);
        if (cached.length > 0) {
          setItems(cached);
          setFromCache(true);
        }
      }

      try {
        const page = await fetchGalleryPage({ uid, pageSize, signal });
        if (signal.canceled) return;
        const merged = sortByNewest(dedupeById(page.items));
        setItems(merged);
        setCursor(page.nextCursor);
        setHasMore(Boolean(page.nextCursor));
        setFromCache(false);
        await writeCachedGallery(uid, merged);
      } catch (err) {
        if (signal.canceled) return;
        setError(
          err instanceof Error
            ? err.message
            : 'Hindi ma-load ang gallery. Pindutin ang Retry.'
        );
      } finally {
        signalRef.current.canceled = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [uid, pageSize]
  );

  const loadMore = useCallback(async () => {
    if (!uid || !cursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await fetchGalleryPage({ uid, cursor, pageSize });
      setItems((prev) => sortByNewest(dedupeById([...prev, ...page.items])));
      setCursor(page.nextCursor);
      setHasMore(Boolean(page.nextCursor));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Hindi ma-load ang susunod na page. Subukan ulit.'
      );
    } finally {
      setLoadingMore(false);
    }
  }, [uid, cursor, pageSize, loadingMore]);

  useEffect(() => {
    if (!autoLoad) return;
    void loadFirstPage('initial');
    return () => {
      signalRef.current.canceled = true;
    };
  }, [autoLoad, loadFirstPage]);

  const removeItem = useCallback(
    async (photoId: string): Promise<boolean> => {
      const snapshot = items;
      const target = snapshot.find((item) => item.id === photoId);
      // Optimistic: hide immediately so the grid does not lag behind the tap.
      setItems((prev) => prev.filter((item) => item.id !== photoId));

      try {
        const { deleteMyPhoto } = await import('../services/cloudFunctions');
        await deleteMyPhoto(photoId);
        if (uid) await writeCachedGallery(uid, snapshot.filter((item) => item.id !== photoId));
        if (target) void deleteLocal(target.url);
        return true;
      } catch (err) {
        setItems(snapshot); // rollback
        setError(
          err instanceof Error
            ? `Hindi na-delete: ${err.message}`
            : 'Hindi na-delete ang litrato. Subukan ulit.'
        );
        return false;
      }
    },
    [items, uid]
  );

  const removeMany = useCallback(
    async (photoIds: string[]): Promise<{ deleted: number; failed: string[] }> => {
      const snapshot = items;
      const idSet = new Set(photoIds);
      setItems((prev) => prev.filter((item) => !idSet.has(item.id)));

      try {
        const { deleteMyPhotos } = await import('../services/cloudFunctions');
        const result = await deleteMyPhotos(photoIds);
        if (result.failed.length > 0) {
          const failedSet = new Set(result.failed);
          setItems(snapshot.filter((item) => failedSet.has(item.id) || !idSet.has(item.id)));
          setError(`${result.failed.length} litrato ang hindi na-delete. Pindutin ang Retry.`);
        }
        if (uid) await writeCachedGallery(uid, snapshot.filter((item) => !idSet.has(item.id)));
        return result;
      } catch (err) {
        setItems(snapshot);
        setError(err instanceof Error ? err.message : 'Nabigo ang bulk delete.');
        return { deleted: 0, failed: photoIds };
      }
    },
    [items, uid]
  );

  const prependItem = useCallback(
    (item: GalleryItem) => {
      setItems((prev) => sortByNewest(dedupeById([item, ...prev])));
      if (uid) void writeCachedGallery(uid, sortByNewest([item, ...items]));
    },
    [uid, items]
  );

  const toggleFavorite = useCallback((photoId: string) => {
    setFavoriteIds((prev) =>
      prev.includes(photoId) ? prev.filter((id) => id !== photoId) : [...prev, photoId]
    );
  }, []);

  const visibleItems = useMemo(
    () => applyVisualFilter(items, visualFilter, favoriteIds),
    [items, visualFilter, favoriteIds]
  );

  return {
    items,
    visibleItems,
    loading,
    loadingMore,
    refreshing,
    error,
    fromCache,
    hasMore,
    visualFilter,
    setVisualFilter,
    favoriteIds,
    toggleFavorite,
    refresh: useCallback(() => loadFirstPage('refresh'), [loadFirstPage]),
    loadMore,
    retry: useCallback(() => loadFirstPage('refresh'), [loadFirstPage]),
    removeItem,
    removeMany,
    prependItem,
  };
}