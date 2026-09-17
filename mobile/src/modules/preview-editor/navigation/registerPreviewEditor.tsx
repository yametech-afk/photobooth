/**
 * Wiring helper for the mobile-core `RootNavigator`.
 *
 * Copy the two `MainStack.Screen` blocks below into the `MainFlow()` navigator
 * (they replace the `ModulePlaceholderScreen` for `PhotoPreview`), and add the
 * `StripLayout` screen. Nothing else in the navigator changes — routes are
 * declared in navigation/types.ts so the params stay type-checked.
 *
 *   import { PhotoPreviewScreen, PhotoEditorScreen, StripLayoutScreen } from
 *     '../modules/preview-editor';
 *
 *   <MainStack.Screen name="PhotoPreview" component={PhotoPreviewScreen} />
 *   <MainStack.Screen name="PhotoEditor" component={PhotoEditorScreen} />
 *   <MainStack.Screen
 *     name="StripLayout"
 *     component={StripLayoutScreen}
 *     options={{ presentation: 'modal' }}
 *   />
 */
import React from 'react';
import type { MainStackParamList } from '../../../navigation/types';
import PhotoPreviewScreen from '../screens/PhotoPreviewScreen';
import PhotoEditorScreen from '../screens/PhotoEditorScreen';
import StripLayoutScreen from '../screens/StripLayoutScreen';

export type ScreenName = keyof MainStackParamList;

export const PREVIEW_EDITOR_SCREENS = [
  { name: 'PhotoPreview' as const, component: PhotoPreviewScreen, options: { animation: 'fade' as const } },
  { name: 'PhotoEditor' as const, component: PhotoEditorScreen, options: { animation: 'slide_from_right' as const } },
  { name: 'StripLayout' as const, component: StripLayoutScreen, options: { presentation: 'modal' as const } },
];

/** Where each screen is reachable from, for the integration checklist. */
export const ENTRY_POINTS = {
  PhotoPreview: ['Camera module after capture', 'Gallery → long-press → retake flow'],
  PhotoEditor: ['PhotoPreview → "I-edit"', 'Gallery → tap → Edit'],
  StripLayout: ['PhotoPreview → "Strip" (burst of 2+)', 'Home → Start Booth → Strip mode'],
} as const;

export const screens = PREVIEW_EDITOR_SCREENS;

export { PhotoPreviewScreen, PhotoEditorScreen, StripLayoutScreen };
export default PREVIEW_EDITOR_SCREENS;