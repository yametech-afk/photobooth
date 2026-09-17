# INTEGRATION.md — Photo Preview / Editor / Strip / Gallery / Share module

How this module plugs into the existing Photobooth monorepo. It assumes the
mobile-core, backend, monetization, admin-panel and DevOps modules already exist
(they do — this is the last missing workstream).

- **Stack:** React Native + Expo 50 + Firebase (Firestore, Storage, Cloud Functions v2)
- **Backend region:** `asia-southeast1` (pinned in `constants.ts` → `FUNCTIONS_REGION`)
- **Depends on:** mobile-core (`src/services/firebase`, `src/contexts/PhotoContext`, `src/theme`, `src/hooks/useAuth`, `src/navigation/types`)
- **Adds:** no changes to existing backend code — it consumes callables the backend module already ships

---

## 1. Architecture at a glance

```
Route params from camera ─┐
                          ▼
  PhotoPreviewScreen ──► PhotoEditorScreen ──► StripLayoutScreen
        │                       │                    │
        │ usePhotoEditor (reducer: geometry + grade + filterId)
        │ FilterPreviewCanvas ──► services/filterRenderer  (expo-gl shader)
        │ services/imagePipeline ──► expo-image-manipulator (rotate/flip/crop/resize)
        │
        └─► usePhotoUpload (queue, progress, retry, cancel)
                 │
                 ├─1 requestPhotoUpload  → signed Storage PUT url + reservation
                 ├─2 FileSystem.createUploadTask (progress + cancel)
                 └─3 finalizePhotoUpload → verifies object, spends credits
                      ↳ reportUploadFailed on any failure (refunds the reservation)

  GalleryScreen ◄── useGallery ──► galleryService (Firestore, cursor pagination)
        │                              └─ fallback: getMyPhotos callable
        └─► detail sheet: edit / share / save / delete

  SaveToDeviceButton ──► mediaLibrary (expo-media-library, lazy permission)
  ShareSheet ──────────► shareService (native sheet + createPhotoShare token)
```

**Firebase split (do not blur this):**
| Concern | Service | Notes |
|---|---|---|
| Image bytes | Cloud Storage | signed PUT from the client, path `users/{uid}/photos/{photoId}.jpg` |
| Photo metadata | Firestore `photos/{photoId}` | written **only** by `finalizePhotoUpload` |
| Ownership | Auth `uid` | every read/write is scoped to `request.auth.uid` |
| Quota / credits | Firestore `quotas/{uid}` + `quotaLedger` | mutation only inside the backend transaction |
| Share links | Firestore `photoShares` + `/s/{token}` page | revocable, TTL-bounded |

---

## 2. Navigation wiring (2 files)

**a. Merge the param list.** `src/modules/preview-editor/navigation/types.ts` is the
core `src/navigation/types.ts` plus two routes (everything else is byte-identical):

```ts
PhotoEditor: { uri: string; filterId: string; width?; height?; mode?; photoId? };
StripLayout: { photos: { uri: string; width?: number; height?: number }[]; filterId?: string; variant?: StripVariantId };
```

Copy those two entries into `MainStackParamList` (or replace the file — it is a strict
superset of the core one, so the camera + premium routes keep working).

**b. Replace the placeholders in `RootNavigator.tsx`:**

```tsx
import PhotoPreviewScreen from '../modules/preview-editor/screens/PhotoPreviewScreen';
import PhotoEditorScreen from '../modules/preview-editor/screens/PhotoEditorScreen';
import StripLayoutScreen from '../modules/preview-editor/screens/StripLayoutScreen';

<MainStack.Screen name="PhotoPreview" component={PhotoPreviewScreen} />
<MainStack.Screen name="PhotoEditor" component={PhotoEditorScreen} />
<MainStack.Screen
  name="StripLayout"
  component={StripLayoutScreen}
  options={{ presentation: 'modal' }}
/>
```

**c. Swap the gallery screen (optional but recommended).** Replace
`src/screens/gallery/GalleryScreen.tsx` with the module version, or re-export it:

```ts
// src/screens/gallery/GalleryScreen.tsx
export { default } from '../../modules/preview-editor/screens/GalleryScreen';
```

Nothing else changes: `PhotoContext.recentPhotos` is still refreshed after every
successful upload, so Home and any other consumer stay in sync.

---

## 3. Camera module contract (what this module expects)

The camera module already navigates with:

```ts
navigation.navigate('PhotoPreview', {
  photos: [{ uri, width?, height? }],
  filter: selectedFilterId,   // from PhotoContext.selectedFilterId
});
```

Two additions this module benefits from:

1. **Burst / strip shots** — pass 2–6 entries in `photos[]` and the preview screen
   switches to burst mode automatically (index counter, thumbnail rail,
   `mode: 'burst'` on upload). The "I-upload lahat" action uploads each shot.
2. **Strip hand-off** — from the preview screen the user can open `StripLayout`
   with the same `photos[]`. If you prefer to capture *directly* into a strip,
   navigate to `StripLayout` from the camera instead and skip the preview.

If the camera module wants the filter rail itself, import `FilterPicker` and
`FilterPreviewCanvas` from the module barrel instead of re-implementing them.

---

## 4. Backend contract (already shipped — no changes needed)

| Callable | Request | Response (`data`) |
|---|---|---|
| `requestPhotoUpload` | `{ filterId, mode, visibility, eventId?, bookingId?, contentType?, sizeBytes?, idempotencyKey? }` | `{ reservationId, photoId, storagePath, uploadUrl, expiresAt, contentType, creditsToSpend, mode, visibility }` |
| `finalizePhotoUpload` | `{ reservationId, photoId, width?, height?, sizeBytes?, caption?, hashtags?, thumbnailPath?, filterApplied?, sessionId? }` | `{ photoId, status, publicUrl, creditsRemaining, visibility }` |
| `reportUploadFailed` | `{ reservationId, reason? }` | `{ released: true }` |
| `getMyPhotos` | `{ status?, filterId?, eventId?, limit?, cursor? }` | `{ items, nextCursor }` |
| `deleteMyPhoto` | `{ photoId }` **or** `{ photoIds: [] }` | `{ deleted }` / `{ deleted, failed[] }` |
| `createPhotoShare` | `{ photoId, channel, ttlHours?, idempotencyKey?, sessionId? }` | `{ shareId, token, url, expiresAt }` |
| `revokePhotoShare` | `{ shareId }` | `{ revoked: true }` |
| `getSharedPhoto` | `{ token }` (public) | `{ expired, publicUrl, caption, filterId }` |
| `getQuota` | — | `{ quota, costs }` |

Compatibility notes that matter:

- **Region.** All callables are in `asia-southeast1`; `services/cloudFunctions.ts`
  pins it via `getFunctions(firebaseApp, FUNCTIONS_REGION)`. Using the default region
  produces `not-found` at runtime.
- **Envelope.** The backend answers `{ success, data, serverTime }` but `httpsCallable`
  already unwraps one level, so this module types the **inner** `data` and reads
  `res.reservationId` directly.
- **Legacy path.** The mobile-core `uploadPhoto(base64)` callable is still wrapped as
  `legacyUploadPhoto()` for backwards compatibility. Do not use it for new code — a
  10 MB base64 body exceeds the callable request limit and gives you no progress events.
- **Credit refunds.** `reportUploadFailed` is called on cancel and on any failure, so a
  network drop never burns quota. Deleting an AI-filtered photo refunds credits
  server-side (`refundPhotoCredits`).

---

## 5. Device permissions

`SaveToDeviceButton` requests lazily, only when the user taps save. Required plist /
manifest entries:

```jsonc
// app.json → expo.ios.infoPlist
"NSCameraUsageDescription": "Kailangan ang camera para kumuha ng litrato sa photobooth.",
"NSPhotoLibraryAddUsageDescription": "Kailangan ang permission para i-save ang mga photo strip sa gallery mo."

// app.json → expo.android.permissions
"CAMERA", "READ_EXTERNAL_STORAGE", "WRITE_EXTERNAL_STORAGE"
// Android 13+: also declare READ_MEDIA_IMAGES (expo-media-library adds it at prebuild)
```

The Android 13+ split (`READ_MEDIA_IMAGES` instead of `WRITE_EXTERNAL_STORAGE`) is
handled by `expo-media-library`'s config plugin; run `npx expo prebuild --clean` after
adding the plugin so the manifest regenerates.

On iOS only *add-only* access is requested (`requestPermissionsAsync(true, ['photo'])`),
which is the least privilege that still allows saving.

---

## 6. Storage rules and filters

Storage paths written by this module:

| Path | Who writes | Limits (enforced by `storage.rules`) |
|---|---|---|
| `users/{uid}/photos/{photoId}.jpg` | signed PUT by the client | ≤ 10 MB, `image/jpeg|png|webp|heic` |
| `users/{uid}/photos/{thumbId}.jpg` | client thumbnail side-upload | small, same rules |

The thumbnail upload deliberately goes through the same handshake and is then
**released** (not finalized) so it never spends a credit — the storage path is passed
to the parent photo as `thumbnailPath`.

---

## 7. Filter rendering: two lanes

| Lane | Renderer | Cost | When it runs |
|---|---|---|---|
| Local presets (`mono`, `sepia`, `vivid`, `noir`, …) | `expo-gl` fragment shader, real time | free | preview + on-device bake before upload |
| AI presets (`cyberpunk`, `oil-painting`, …, the 8 premium ids) | backend AI pipeline | 1 credit, Premium only | after upload; the client only sends `filterId` |

The GPU shader lives in `services/filterRenderer.ts`. It is a shader, not a CSS
filter and not a JS pixel loop — a per-frame JS bridge call would drop the preview
to single-digit fps on mid-range Android. `bakeGrade()` reads the framebuffer back
through `GLView.takeSnapshotAsync`, so the exported file matches the preview exactly.

If the GL context cannot be created (older device, unsupported driver) the canvas
renders a clear fallback message and the screens stay usable — the filter still
applies at save time.

---

## 8. Upload state machine

```
idle → preparing → uploading → finalizing → done
             ↘ error (retryable → back to idle after backoff) / canceled
```

- **Queue is sequential.** Parallel uploads compete for the same uplink, make every
  job slower, and make the credits counter jitter. One job at a time keeps progress
  honest.
- **Auto-retry:** transient failures retry up to 3 times with exponential backoff
  (700 ms → 1.4 s → 2.8 s, capped 8 s). Non-retryable errors (quota exhausted,
  permission denied, invalid argument) stop immediately and surface a specific action.
- **Cancel:** cancels the in-flight `FileSystemUploadTask` *and* releases the
  reservation, so a canceled upload costs nothing.
- **Idempotency:** each job carries an idempotency key persisted across retries; the
  backend stores it in `idempotencyKeys/{key}` with a 24 h TTL, so a retried request
  cannot double-charge.

---

## 9. Gallery loading contract

- Primary query: `photos` where `uid == user.uid`, `status == 'ready'`, `orderBy createdAt desc`,
  `limit 24`, `startAfter(cursor)`. This matches the composite index the backend ships
  (`uid ASC + status ASC + createdAt DESC`) — **no new index required**.
- Fallback: if the direct read is denied (rules tightened, App Check rollout), the
  hook transparently retries through the `getMyPhotos` callable. Same shape, same UI.
- Visual filters (public / private / strips / favorites) are applied **client-side**
  over the loaded page, so adding one never needs a new composite index. If the
  catalogue grows past ~500 photos per user, move `visibility` into the query and
  add `uid + status + visibility + createdAt` to `firestore.indexes.json`.
- Cache: the last successful page is stored in AsyncStorage and painted immediately,
  then replaced by the live page. It is never authoritative.
- Deletes are optimistic and roll back on failure, so a refused delete cannot make a
  photo disappear from the UI while it still exists on the server.

---

## 10. Monetization hooks

The module **reads** plan state and never writes it:

```ts
const { profile } = useAuth();
const isPremium = profile?.plan === 'premium';
```

- Premium filter chips render a lock and route to `navigation.navigate('Premium')`
  through the `onLockedPress` callback (the paywall itself stays in the premium module).
- Strip exports burn a watermark when `!isPremium` (`StripCanvas watermark` prop) —
  the same rule the server applies, shown before upload rather than after.
- `creditsRemaining` from `finalizePhotoUpload` is fed to `onCreditsChanged` so the
  Home badge updates without a refetch.

---

## 11. Dependencies to add

Not in the mobile-core `package.json` yet:

```bash
npx expo install expo-gl expo-clipboard react-native-view-shot
npm install @react-native-community/slider
```

| Package | Used for | Where |
|---|---|---|
| `expo-gl` | fragment-shader colour grading | `services/filterRenderer.ts` |
| `react-native-view-shot` | capture the strip view tree to a file | `screens/StripLayoutScreen.tsx` |
| `@react-native-community/slider` | brightness / contrast / saturation / vignette | `components/EditToolbar.tsx` |
| `expo-clipboard` | "Kopyahin" the share link | `services/shareService.ts` |

After adding native modules run a **dev client / prebuild** build — Expo Go will not
contain `expo-gl`'s native side reliably:

```bash
npx expo prebuild --clean
npx expo run:android      # or run:ios
```

`expo-image-manipulator`, `expo-file-system`, `expo-media-library`, `expo-haptics`,
`expo-linear-gradient`, `firebase`, `@react-native-async-storage/async-storage` and
`@expo/vector-icons` are already declared by the mobile-core module.

---

## 12. Verification checklist

Run through this in order; each line is a real, observable behaviour.

**Preview**
- [ ] Camera → `PhotoPreview` shows the captured photo with the filter rail
- [ ] Burst of 4 shows `1 / 4 • burst` and a thumbnail rail that switches shots
- [ ] GPU presets change the preview instantly with no network (airplane mode proves it)
- [ ] Tapping a locked AI filter shows the Premium notice instead of applying it
- [ ] AI filter selected → the canvas shows the "nire-render sa server" panel, not a broken image
- [ ] Retake replaces the route back to the camera and clears pending photos

**Editor**
- [ ] Rotate cw ×4 returns to the original orientation
- [ ] Flip H / V are independent and stack with rotation
- [ ] Crop 1:1 / 4:5 / 16:9 / 9:16 re-bakes and the preview aspect follows
- [ ] Sliders change the preview live; Reset returns to the preset baseline
- [ ] Reset (toolbar) restores the original file, not just the uniforms

**Strip**
- [ ] Layout switch changes slot count and reflows the cells
- [ ] Fewer captures than slots repeats the last photo instead of leaving a hole
- [ ] "I-render ang strip" produces a file; render twice → second file is fresh
- [ ] Free plan shows the watermark in the composed PNG (not only in the preview)
- [ ] Strip > 10 MB is refused with a readable message

**Save**
- [ ] First save shows the OS permission dialog (undetermined state)
- [ ] Denied → button turns into "Buksan ang Settings" and opens app settings
- [ ] Saved file appears in the `Photobooth` album
- [ ] Saving from the gallery (remote url) downloads first, then saves

**Upload**
- [ ] Progress bar advances monotonically; the credits counter drops by 1 per AI photo
- [ ] Airplane mode mid-upload → job goes to `error`, then auto-retries when network returns
- [ ] Cancel mid-upload → status `canceled` and the credit balance is unchanged
- [ ] Sixth free upload in a day → clear "naubos ang daily credits" message, no silent failure
- [ ] Pull-to-refresh on the gallery shows the new photo

**Gallery**
- [ ] Grid loads from Firestore with `limit 24` and loads more on scroll
- [ ] Fresh install offline → cached page paints, then "Offline ka" state is shown
- [ ] Visual filters narrow the grid without a network round trip
- [ ] Long-press enters selection mode; bulk delete confirms the count
- [ ] Failed delete rolls the tile back into the grid and explains why
- [ ] Empty account shows "Wala pa kang litrato" with a working CTA
- [ ] Force a query error → "Hindi na-load ang gallery" with a working Retry

**Share**
- [ ] Native sheet shares the full-resolution file (not a thumbnail)
- [ ] Link share returns a `/s/{token}` url that opens in a browser
- [ ] "I-revoke" immediately invalidates the link
- [ ] Link TTL toggle changes `expiresAt` (3 days vs 14 days)

---

## 13. Known limitations (stated, not hidden)

1. **Live preview cannot show AI filters.** They are rendered server-side; the UI
   says so instead of faking a result. A future optimisation is a downscaled
   server-side preview render.
2. **The GPU preview degrades on very old devices.** Detectable at runtime; the
   fallback message keeps the flow usable and the file still gets graded on save.
3. **Strip capture size is fixed by the on-screen view width** (`captureRef` renders
   at view resolution). For print-quality strips, raise `width` on `StripCanvas`
   beyond the visible area — the canvas is width-driven, so nothing else changes.
4. **Favorites are device-local** (AsyncStorage-level state inside `useGallery`).
   Sync them to `users/{uid}/favorites` when cross-device favourites are wanted.
5. **Visual gallery filters are client-side** over the loaded page (see §9 for the
   migration path).
6. **No offline upload queue.** Jobs live in memory; closing the app loses a pending
   upload (the file itself is untouched on the device). Persisting the queue to
   AsyncStorage is the next step if background upload is needed.