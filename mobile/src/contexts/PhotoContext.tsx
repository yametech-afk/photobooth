import React, { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
import { collection, query, where, orderBy, limit, getDocs, type Timestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuthContext } from './AuthContext';

export type PendingPhoto = {
  uri: string;
  width?: number;
  height?: number;
};

export type RecentPhoto = {
  id: string;
  url: string;
  filterId: string;
  isPublic: boolean;
  createdAt: Timestamp | null;
};

type PhotoState = {
  /** Photos captured in the current booth session, waiting to be uploaded/edited. */
  pendingPhotos: PendingPhoto[];
  selectedFilterId: string;
  recentPhotos: RecentPhoto[];
  loadingRecent: boolean;
  setPendingPhotos: (photos: PendingPhoto[]) => void;
  addPendingPhoto: (photo: PendingPhoto) => void;
  clearPendingPhotos: () => void;
  setSelectedFilterId: (filterId: string) => void;
  refreshRecentPhotos: () => Promise<void>;
};

const PhotoContext = createContext<PhotoState | null>(null);

export function PhotoProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuthContext();
  const [pendingPhotos, setPendingPhotosState] = useState<PendingPhoto[]>([]);
  const [selectedFilterId, setSelectedFilterId] = useState('none');
  const [recentPhotos, setRecentPhotos] = useState<RecentPhoto[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  const refreshRecentPhotos = useCallback(async () => {
    if (!user) {
      setRecentPhotos([]);
      return;
    }
    try {
      setLoadingRecent(true);
      const snap = await getDocs(
        query(
          collection(db, 'photos'),
          where('uid', '==', user.uid),
          orderBy('createdAt', 'desc'),
          limit(20)
        )
      );
      setRecentPhotos(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            url: data.url as string,
            filterId: (data.filterId as string) ?? 'none',
            isPublic: Boolean(data.isPublic),
            createdAt: (data.createdAt as Timestamp) ?? null,
          };
        })
      );
    } catch (error) {
      console.warn('[photobooth] Failed to load recent photos:', error);
    } finally {
      setLoadingRecent(false);
    }
  }, [user]);

  useEffect(() => {
    refreshRecentPhotos();
  }, [refreshRecentPhotos]);

  const value = useMemo<PhotoState>(
    () => ({
      pendingPhotos,
      selectedFilterId,
      recentPhotos,
      loadingRecent,
      setPendingPhotos: setPendingPhotosState,
      addPendingPhoto: (photo) =>
        setPendingPhotosState((prev) => [...prev, photo]),
      clearPendingPhotos: () => setPendingPhotosState([]),
      setSelectedFilterId,
      refreshRecentPhotos,
    }),
    [pendingPhotos, selectedFilterId, recentPhotos, loadingRecent, refreshRecentPhotos]
  );

  return <PhotoContext.Provider value={value}>{children}</PhotoContext.Provider>;
}

export function usePhotos(): PhotoState {
  const ctx = useContext(PhotoContext);
  if (!ctx) {
    throw new Error('usePhotos must be used inside <PhotoProvider>');
  }
  return ctx;
}
