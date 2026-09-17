/**
 * @photobooth/camera — barrel export.
 * Import everything from here in the mobile app:
 *   import { CameraScreen, useFilterSelection } from './modules/camera';
 */
export { CameraView } from './components/CameraView';
export type { CameraViewHandle } from './components/CameraView';
export { FilterPicker } from './components/FilterPicker';
export { CameraScreen } from './screens/CameraScreen';
export { useCameraPermission } from './hooks/useCameraPermission';
export { useCameraDirection } from './hooks/useCameraDirection';
export { useFilterSelection } from './hooks/useFilterSelection';
export { usePhotoCapture } from './hooks/usePhotoCapture';
export { createUploadHandoff } from './services/uploadHandoff';
export type { FunctionsLike } from './services/uploadHandoff';
export { compressForUpload } from './services/imageProcessing';
export { mapDetectedFaces, detectFacesForStickers } from './services/faceDetection';
export { createMonetizationGate } from './monetizationBridge';
export { FILTER_CATALOG, getFilterById } from './filters/filterCatalog';
export {
  CAPTURE_QUALITY,
  BURST_DEFAULT_COUNT,
  MAX_BURST_COUNT,
  BURST_INTERVAL_MS,
  MAX_UPLOAD_WIDTH,
  UPLOAD_COMPRESS,
  UPLOAD_CONTENT_TYPE,
} from './constants';
export type {
  CameraPosition,
  CaptureMode,
  CapturedPhoto,
  RawShot,
  FilterDefinition,
  PremiumFilterGate,
  UploadReservation,
  UploadHandoffResult,
  RequestUploadParams,
  FinalizeMeta,
  UploadHandoff,
  BurstOptions,
  BurstProgress,
  CameraPermissionStatus,
  UploadStatus,
  DetectedFace,
} from './types';
