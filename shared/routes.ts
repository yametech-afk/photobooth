/**
 * ============================================================
 * SHARED CONTRACT (ROUTES) — NAVIGATION PARAM LISTS
 * ============================================================
 * Pinagmulan (canonical, bit-for-bit):
 *   - mobile/src/navigation/types.ts (mobile-core registry)
 *   - mobile/src/modules/preview-editor/navigation/types.ts (strict superset:
 *     nagdaragdag lang ng PhotoEditor + StripLayout — pareho ang lahat ng iba)
 *
 * TUNTUNIN: ang registry na ito ang kanonikong listahan ng mga route.
 * Bawal magdagdag ng screen nang hindi idadagdag dito (type-safe navigation).
 * Ang admin panel ay may sariling react-router paths — tingnan ROUTE_PATHS
 * sa ibaba (galing sa admin-panel/src/pages/).
 */

import type { PhotoSource, PhotoUploadMode, StripVariantId } from '../mobile/src/modules/preview-editor/types';

// ---------------------------------------------------------------- Auth stack

export type AuthStackParamList = {
  Onboarding: undefined;
  Login: undefined;
  SignUp: undefined;
};

// ---------------------------------------------------------------- Main tabs

export type MainTabParamList = {
  HomeTab: undefined;
  GalleryTab: undefined;
  SettingsTab: undefined;
};

// ---------------------------------------------------------------- Main stack
// Mga route na hawak ng modules (hosting map):
//   Camera        → mobile/src/modules/camera/screens/CameraScreen.tsx
//   PhotoPreview  → mobile/src/modules/preview-editor/screens/PhotoPreviewScreen.tsx
//   PhotoEditor   → mobile/src/modules/preview-editor/screens/PhotoEditorScreen.tsx
//   StripLayout   → mobile/src/modules/preview-editor/screens/StripLayoutScreen.tsx
//   Premium       → monetization PremiumScreen (kasalukuyang placeholder stack route
//                    sa v3 — tingnan README Rev 3 wiring status + INTEGRATION_CHECKLIST §4)

export type MainStackParamList = {
  MainTabs: undefined;
  /** Full-screen camera capture, hosted by the camera/AI module. */
  Camera: undefined;
  /** Post-capture preview + filter + editor, hosted by the preview/editor module. */
  PhotoPreview: {
    photos: { uri: string; width?: number; height?: number }[];
    filter: string;
  };
  /** Premium subscription upsell + checkout, hosted by the premium module. */
  Premium: undefined;
  /** Full-screen editor for a single photo — preview-editor module. */
  PhotoEditor: {
    uri: string;
    filterId: string;
    width?: number;
    height?: number;
    mode?: PhotoUploadMode;
    /** Set kapag ang editor ay binuksan mula sa gallery (enable re-upload). */
    photoId?: string;
  };
  /** Strip composer: naghahati-hati ng burst sa printable strip — preview-editor module. */
  StripLayout: {
    photos: PhotoSource[];
    filterId?: string;
    variant?: StripVariantId;
  };
};

export type RootParamList = AuthStackParamList & MainStackParamList;

// ---------------------------------------------------------------- Admin panel route paths
// Galing sa admin-panel/src/pages/* (react-router). Documented lang dito para
// may reference ang QA at integration tests — hindi ini-import ng admin.

export const ROUTE_PATHS = {
  login: '/login',
  dashboard: '/dashboard',
  users: '/users',
  photos: '/photos',
  filters: '/filters',
  events: '/events',
  bookings: '/bookings',
  revenue: '/revenue',
  notifications: '/notifications',
  settings: '/settings',
} as const;
