/** Front/back camera toggle. */
import { useCallback, useState } from 'react';
import type { CameraPosition } from '../types';

export function useCameraDirection(initial: CameraPosition = 'front') {
  const [position, setPosition] = useState<CameraPosition>(initial);

  const toggle = useCallback(() => {
    setPosition((p) => (p === 'front' ? 'back' : 'front'));
  }, []);

  const set = useCallback((p: CameraPosition) => setPosition(p), []);

  return { position, toggle, set };
}
