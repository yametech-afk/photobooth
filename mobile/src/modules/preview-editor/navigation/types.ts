/**
 * Extended navigation param list (merge-ready).
 *
 * This is the mobile-core `src/navigation/types.ts` with the two routes this
 * module adds — `PhotoEditor` and `StripLayout`. It is a strict superset: every
 * pre-existing route (Onboarding/Login/SignUp/HomeTab/GalleryTab/SettingsTab/
 * MainTabs/Camera/PhotoPreview/Premium) is preserved verbatim, so replacing the
 * file is safe. If you prefer not to replace it, copy only the two new entries
 * into `MainStackParamList` — nothing else changed.
 */

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
  /** ADDED by preview-editor: full-screen single-photo editor. */
  PhotoEditor: {
    uri: string;
    filterId: string;
    width?: number;
    height?: number;
    mode?: 'single' | 'burst' | 'gif' | 'strip';
    photoId?: string;
  };
  /** ADDED by preview-editor: strip composer / print layout. */
  StripLayout: {
    photos: { uri: string; width?: number; height?: number }[];
    filterId?: string;
    variant?: 'classic4' | 'film3' | 'duo2' | 'grid6' | 'polaroid1';
  };
  /** Premium subscription upsell + checkout, hosted by the premium module. */
  Premium: undefined;
};

export type RootParamList = AuthStackParamList & MainStackParamList;