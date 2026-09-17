# Photo Preview / Editor / Strip / Gallery / Share — Photobooth module

Final missing workstream of the Photobooth app: everything that happens **after** the
camera fires. Built against the existing React Native + Firebase monorepo (mobile-core,
backend, monetization, admin panel, DevOps) — it consumes their contracts, it does not
fork them.

**Modules:** 14 hooks/services · 12 components · 4 screens · 2 navigation files
**Verified:** TypeScript syntax + import/export integrity pass (`scripts/check-module.mjs`, see below)

---

## What it does

| Capability | Implementation |
|---|---|
| Preview captured photo(s) | `screens/PhotoPreviewScreen.tsx` — burst rail, index counter, GPU filter preview |
| Retake | `navigation.replace('Camera')` + `clearPendingPhotos()` |
| Apply / change filters | `components/FilterPicker.tsx` — 11 free GPU presets + 8 AI/premium presets |
| Real-time colour grading | `services/filterRenderer.ts` — expo-gl fragment shader (not CSS, not a JS pixel loop) |
| Basic edits | `components/EditToolbar.tsx` — rotate, flip, 5 crop ratios, brightness/contrast/saturation/vignette |
| Strip layouts | `components/StripCanvas.tsx` + `screens/StripLayoutScreen.tsx` — 5 layouts × 5 frames, captured with `react-native-view-shot` |
| Save to device | `services/mediaLibrary.ts` + `components/SaveToDeviceButton.tsx` — lazy permission, `Photobooth` album |
| Upload with progress | `services/uploadService.ts` + `hooks/usePhotoUpload.ts` — signed-URL protocol, sequential queue, auto-retry, cancel, reservation rollback |
| Gallery | `hooks/useGallery.ts` + `services/galleryService.ts` + `screens/GalleryScreen.tsx` — cursor pagination, cache-first, multi-select |
| Share | `components/ShareSheet.tsx` + `services/shareService.ts` — native sheet + revocable server link |
| Empty states | `components/EmptyState.tsx` — 5 distinct cases (no photos, no results, error, offline, no selection) |
| Delete / retry flows | optimistic delete with rollback; per-job and bulk upload retry |

Full contracts, wiring steps and the verification checklist: **`INTEGRATION.md`**.

---

## File tree

```
src/modules/preview-editor/
├── index.ts                      # public barrel — import from here only
├── constants.ts                  # FILTER_PRESETS, STRIP_VARIANTS/FRAMES, LIMITS, CREDITS, FUNCTIONS_REGION
├── types.ts                      # FilterPreset, EditState, StripConfig, UploadJob, GalleryItem, ShareResult…
├── INTEGRATION.md                # contracts, wiring, permissions, checklist, limitations
├── README.md                     # this file
├── navigation/
│   ├── params.ts                 # route params owned by this module
│   ├── types.ts                  # merge-ready MainStackParamList (superset of core)
│   └── registerPreviewEditor.tsx # copy-paste screens + entry points
├── screens/
│   ├── PhotoPreviewScreen.tsx    # preview · retake · filter · upload · share
│   ├── PhotoEditorScreen.tsx     # rotate/flip/crop + sliders + bake + upload
│   ├── StripLayoutScreen.tsx     # strip composer · render · save · upload
│   └── GalleryScreen.tsx         # paginated grid · filters · detail sheet · bulk delete
├── components/
│   ├── FilterPreviewCanvas.tsx   # GL canvas (60fps uniforms)
│   ├── FilterPicker.tsx          # filter rail with AI + premium lock badges
│   ├── EditToolbar.tsx           # EditToolbar · CropRow · GradeSliders
│   ├── StripCanvas.tsx           # the captured strip view tree
│   ├── StripLayoutPicker.tsx     # layout + frame picker
│   ├── UploadStatusBanner.tsx    # inline progress / error + retry
│   ├── UploadQueueSheet.tsx      # full queue: retry / cancel / remove / clear
│   ├── GalleryTile.tsx           # cell with scrim, badges, selection checkbox
│   ├── ShareSheet.tsx            # local share + revocable link + TTL toggle
│   ├── SaveToDeviceButton.tsx    # ready / ask / blocked permission states
│   └── EmptyState.tsx            # 5 empty/error states
├── hooks/
│   ├── usePhotoEditor.ts         # reducer: geometry + grade + filter selection, isDirty
│   ├── usePhotoUpload.ts         # queue, progress, auto-retry, cancel, credits callback
│   ├── useGallery.ts             # pagination, refresh, optimistic delete + rollback
│   └── useMediaPermission.ts     # permission state machine + friendly copy
├── services/
│   ├── cloudFunctions.ts         # typed callables (region-pinned) + legacy compat wrapper
│   ├── uploadService.ts          # 3-step upload protocol, cancel, error mapping
│   ├── imagePipeline.ts          # manipulateAsync geometry, thumbnail, size guard
│   ├── filterRenderer.ts         # GL shader + renderBridge + bakeGrade()
│   ├── mediaLibrary.ts           # camera-roll save, Photobooth album
│   ├── shareService.ts           # native sheet, deep links, link mint/revoke
│   └── galleryService.ts         # Firestore query + callable fallback + cache
└── utils/
    └── format.ts                 # bytes, relative time, date stamp, status copy, clamp
```

---

## Install

Drop the module into the monorepo at `mobile/src/modules/preview-editor/`, then:

```bash
cd mobile
npx expo install expo-gl expo-clipboard react-native-view-shot
npm install @react-native-community/slider
npx expo prebuild --clean      # native modules need a dev client, not Expo Go
npx expo run:android
```

Wire the screens (2 edits) — see `INTEGRATION.md` §2.

---

## Design decisions worth knowing

1. **Colour grading is a GPU shader, not CSS or JS.** A per-frame JS bridge call would
   drop the preview to single-digit fps on mid-range Android. Geometry stays in
   `expo-image-manipulator`; colour stays in the shader; the two are only merged when
   the user saves.
2. **The photo never travels through a Cloud Function body.** Upload is
   `request → signed PUT → finalize`, so there is real progress, real cancel, and no
   10 MB base64 ceiling.
3. **A failed upload cannot burn a credit.** `reportUploadFailed` releases the
   reservation on cancel and on every failure path.
4. **The strip is captured from a real view tree**, so the file is pixel-identical to
   what the user saw — no second layout implementation.
5. **Deletes are optimistic and reversible.** A refused delete puts the tile back.
6. **Screens never call Firebase directly** — every call goes through `services/`,
   which is why the whole module is testable without a device.

---

## Not included (by design)

- The camera screen itself (camera/AI module owns it) — this module only consumes its route params.
- The paywall UI (premium module) — this module only calls `onLockedPress` / navigates to `Premium`.
- Any backend code — every callable it uses already exists in the backend module.

See `INTEGRATION.md` §13 for the honest limitations list (AI filters cannot preview
live, favourites are device-local, no offline upload queue).