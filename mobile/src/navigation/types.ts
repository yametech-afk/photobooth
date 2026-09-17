/**
 * Central route registry. Every screen the app can navigate to is declared here
 * so navigation params stay type-safe across modules.
 */

import type {
  PhotoSource,
  PhotoUploadMode,
  StripVariantId,
} from '../modules/preview-editor/types';

export type AuthStackParamList = {
  Onboarding: undefined;
  Login: undefined;
  SignUp: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  GalleryTab: undefined;
  SettingsTab: undefined;
};

export type MainStackParamList = {
  MainTabs: undefined;
  /** Full-screen camera capture, hosted by the camera/AI module. */
  Camera: undefined;
  /** Post-capture preview + filter + editor, hosted by the preview/editor module. */
  PhotoPreview: {
    photos: { uri: string; width?: number; height?: number }[];
    filter: string;
  };
  /** Premium subscription hub — real screen from the monetization module. */
  Premium: undefined;
  /** B2B event packages / booking — real screen from the monetization module. */
  EventBooking: undefined;
  /** Full-screen editor for a single photo — preview-editor module. */
  PhotoEditor: {
    uri: string;
    filterId: string;
    width?: number;
    height?: number;
    mode?: PhotoUploadMode;
    /** Set when the editor was opened from the gallery (enables re-upload). */
    photoId?: string;
  };
  /** Strip composer: arranges a burst into a printable strip — preview-editor module. */
  StripLayout: {
    photos: PhotoSource[];
    filterId?: string;
    variant?: StripVariantId;
  };
};

export type RootParamList = AuthStackParamList & MainStackParamList;