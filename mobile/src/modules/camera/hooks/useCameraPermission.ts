/**
 * Camera permission hook — request + react to user decision.
 * Matches mobile-core conventions (plain RN + Expo modules, no extra state libs).
 */
import { useCallback, useEffect, useState } from 'react';
import { Camera } from 'expo-camera';
import type { CameraPermissionStatus } from '../types';

export function useCameraPermission() {
  const [status, setStatus] = useState<CameraPermissionStatus>('undetermined');

  useEffect(() => {
    let mounted = true;
    Camera.getCameraPermissionsAsync().then((res) => {
      if (mounted) setStatus(res.status === 'granted' ? 'granted' : 'denied');
    });
    return () => {
      mounted = false;
    };
  }, []);

  const request = useCallback(async () => {
    const res = await Camera.requestCameraPermissionsAsync();
    const next: CameraPermissionStatus = res.status === 'granted' ? 'granted' : 'denied';
    setStatus(next);
    return next;
  }, []);

  const recheck = useCallback(async () => {
    const res = await Camera.getCameraPermissionsAsync();
    const next: CameraPermissionStatus = res.status === 'granted' ? 'granted' : 'denied';
    setStatus(next);
    return next;
  }, []);

  return { status, request, recheck };
}
