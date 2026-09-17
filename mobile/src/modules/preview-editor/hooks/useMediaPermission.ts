/**
 * Tracks the camera-roll permission so the Save button can render the right state
 * (ready / needs-permission / blocked) before the user taps it, instead of firing
 * an unexplained OS dialog.
 */
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform, type AppStateStatus } from 'react-native';
import {
  getMediaPermission,
  requestMediaPermission,
  type PermissionState,
} from '../services/mediaLibrary';

export type UseMediaPermissionApi = {
  status: PermissionState;
  canAskAgain: boolean;
  checking: boolean;
  /** Returns true when we ended up granted. */
  ensure: () => Promise<boolean>;
  openSettings: () => Promise<void>;
  refresh: () => Promise<void>;
};

export function useMediaPermission(): UseMediaPermissionApi {
  const [status, setStatus] = useState<PermissionState>('undetermined');
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      setStatus(await getMediaPermission());
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Re-check after the user comes back from Settings.
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const ensure = useCallback(async (): Promise<boolean> => {
    if (status === 'granted') return true;
    const next = await requestMediaPermission();
    setStatus(next);
    return next === 'granted';
  }, [status]);

  return {
    status,
    checking,
    canAskAgain: status !== 'denied',
    ensure,
    openSettings: useCallback(async () => {
      await Linking.openSettings().catch(() => undefined);
    }, []),
    refresh,
  };
}

/** Friendly copy for each permission state — used by the Save button + banner. */
export function permissionCopy(status: PermissionState): {
  title: string;
  body: string;
  action: string;
} | null {
  if (status === 'granted') return null;
  if (status === 'denied') {
    return {
      title: 'Naka-block ang photo access',
      body:
        Platform.OS === 'ios'
          ? 'Buksan ang Settings > Photobooth > Photos para payagan ang pag-save sa camera roll.'
          : 'Buksan ang Settings > Apps > Photobooth > Permissions para payagan ang Storage/Photos.',
      action: 'Buksan ang Settings',
    };
  }
  return {
    title: 'Payagan ang pag-save sa device',
    body: 'Kailangan ng photo library access para ma-save ang litrato at photo strip sa camera roll mo.',
    action: 'Payagan',
  };
}