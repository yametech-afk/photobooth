/**
 * Public surface of the preview-editor module.
 *
 * Consumers (RootNavigator, HomeScreen, camera module, premium module) should import
 * from this file only — internal paths are free to move.
 */

// screens
export { default as PhotoPreviewScreen } from './screens/PhotoPreviewScreen';
export { default as PhotoEditorScreen } from './screens/PhotoEditorScreen';
export { default as StripLayoutScreen } from './screens/StripLayoutScreen';
export { default as GalleryScreen } from './screens/GalleryScreen';

// navigation wiring
export {
  default as PREVIEW_EDITOR_SCREENS,
  PREVIEW_EDITOR_SCREENS as previewEditorScreens,
  ENTRY_POINTS,
} from './navigation/registerPreviewEditor';
export type { PhotoScreenParams } from './navigation/params';

// components (usable elsewhere — e.g. the camera module's filter rail)
export { default as FilterPicker } from './components/FilterPicker';
export { default as FilterPreviewCanvas } from './components/FilterPreviewCanvas';
export { default as StripCanvas } from './components/StripCanvas';
export { default as StripLayoutPicker } from './components/StripLayoutPicker';
export { default as GalleryTile } from './components/GalleryTile';
export { default as ShareSheet } from './components/ShareSheet';
export { default as SaveToDeviceButton } from './components/SaveToDeviceButton';
export { default as UploadQueueSheet } from './components/UploadQueueSheet';
export { default as EmptyState } from './components/EmptyState';
export { UploadStatusBanner } from './components/UploadStatusBanner';
export { EditToolbar, CropRow, GradeSliders } from './components/EditToolbar';

// hooks
export { usePhotoEditor, initialEditState } from './hooks/usePhotoEditor';
export { usePhotoUpload } from './hooks/usePhotoUpload';
export { useGallery } from './hooks/useGallery';
export { useMediaPermission } from './hooks/useMediaPermission';

// services
export {
  requestPhotoUpload,
  finalizePhotoUpload,
  reportUploadFailed,
  getMyPhotos,
  deleteMyPhoto,
  deleteMyPhotos,
  createPhotoShare,
  revokePhotoShare,
  getSharedPhoto,
  getQuota,
  legacyUploadPhoto,
} from './services/cloudFunctions';
export { startUpload, describeUploadError, isRetryable } from './services/uploadService';
export {
  bakeGeometry,
  makeThumbnail,
  getImageDims,
  getFileSize,
  validateForUpload,
  persistLocally,
  deleteLocal,
} from './services/imagePipeline';
export { createFilterRenderer, bakeGrade, renderBridge } from './services/filterRenderer';
export { saveLocalFileToDevice, saveRemoteFileToDevice, requestMediaPermission } from './services/mediaLibrary';
export { shareFileNatively, createShareLink, revokeShareLink, buildShareUrl, copyToClipboard } from './services/shareService';
export { fetchGalleryPage, mapPhotoDoc, readCachedGallery, writeCachedGallery, applyVisualFilter } from './services/galleryService';

// constants + types
export {
  FILTER_PRESETS,
  GPU_FILTERS,
  PREMIUM_FILTER_IDS,
  STRIP_VARIANTS,
  STRIP_FRAMES,
  LIMITS,
  CREDITS,
  FUNCTIONS_REGION,
  getFilterPreset,
  getStripVariant,
  getStripFrame,
} from './constants';
export * from './types';