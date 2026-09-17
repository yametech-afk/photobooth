import { usePhotos } from '../contexts/PhotoContext';

export function usePhotosHook() {
  return usePhotos();
}

export { usePhotosHook as usePhotosState };
