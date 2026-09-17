/**
 * Single capture + burst mode with interval, cancel, and memory cleanup.
 * Burst shots accumulate in a ref array (not state) to avoid re-render storms,
 * with periodic state sync for the progress indicator.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraViewHandle } from '../components/CameraView';
import { BURST_DEFAULT_COUNT, BURST_INTERVAL_MS, CAPTURE_QUALITY, MAX_BURST_COUNT } from '../constants';
import type { BurstOptions, BurstProgress, CapturedPhoto, CaptureMode } from '../types';

export interface CaptureHandlers {
  /** Strip the local filter id from URIs when done — photos go to preview/editor next. */
  onComplete(mode: CaptureMode, photos: CapturedPhoto[]): void;
  onError?(error: Error): void;
}

export function usePhotoCapture(handlers: CaptureHandlers) {
  const cameraRef = useRef<CameraViewHandle | null>(null);
  const burstBufferRef = useRef<CapturedPhoto[]>([]);
  const cancelledRef = useRef(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [burstProgress, setBurstProgress] = useState<BurstProgress | null>(null);

  // Cleanup on unmount: drop buffered URIs so nothing pins memory.
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      burstBufferRef.current = [];
    };
  }, []);

  const captureOnce = useCallback(async (filterId: string): Promise<CapturedPhoto> => {
    if (!cameraRef.current) throw new Error('Camera is not ready');
    const shot = await cameraRef.current.takePictureAsync({
      quality: CAPTURE_QUALITY,
      skipProcessing: false,
    });
    return {
      uri: shot.uri,
      width: shot.width,
      height: shot.height,
      filterId,
      mode: 'single',
      capturedAt: Date.now(),
    };
  }, []);

  const captureSingle = useCallback(
    async (filterId: string) => {
      setIsCapturing(true);
      try {
        const photo = await captureOnce(filterId);
        photo.mode = 'single';
        handlers.onComplete('single', [photo]);
      } catch (e) {
        handlers.onError?.(e instanceof Error ? e : new Error(String(e)));
      } finally {
        setIsCapturing(false);
      }
    },
    [captureOnce, handlers]
  );

  const cancelBurst = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  const captureBurst = useCallback(
    async (filterId: string, options?: Partial<BurstOptions>) => {
      const count = Math.min(options?.count ?? BURST_DEFAULT_COUNT, MAX_BURST_COUNT);
      const intervalMs = options?.intervalMs ?? BURST_INTERVAL_MS;

      setIsCapturing(true);
      cancelledRef.current = false;
      burstBufferRef.current = [];
      setBurstProgress({ index: 0, total: count, photos: [] });

      try {
        for (let i = 0; i < count; i++) {
          if (cancelledRef.current) break; // user pressed stop
          const photo = await captureOnce(filterId);
          photo.mode = 'burst';
          burstBufferRef.current.push(photo);
          setBurstProgress({
            index: i + 1,
            total: count,
            photos: [...burstBufferRef.current], // shallow copy for indicator
          });
          if (i < count - 1) await new Promise((r) => setTimeout(r, intervalMs));
        }
        const photos = burstBufferRef.current;
        if (photos.length > 0) handlers.onComplete('burst', photos);
      } catch (e) {
        // Free the buffer on failure — burst shots are large and this is a fresh start.
        burstBufferRef.current = [];
        handlers.onError?.(e instanceof Error ? e : new Error(String(e)));
      } finally {
        setBurstProgress(null);
        setIsCapturing(false);
        cancelledRef.current = false;
      }
    },
    [captureOnce, handlers]
  );

  return {
    cameraRef,
    isCapturing,
    burstProgress,
    captureSingle,
    captureBurst,
    cancelBurst,
  };
}
