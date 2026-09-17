# 📸 Photobooth Camera Module (`src/modules/camera`)

React Native (Expo 50) + Firebase camera module, handa nang i-merge sa final monorepo. Self-contained: hooks, components, services, types, at barrel export — walang hard-wired Firebase o monetization calls (injectable lahat).

## ✅ Sakop nito (8 capabilities)

| # | Capability | Nasaan |
|---|---|---|
| 1 | **Camera permissions** (request + denied state) | `hooks/useCameraPermission.ts` |
| 2 | **Front/back switching** | `hooks/useCameraDirection.ts` |
| 3 | **Single capture** | `hooks/usePhotoCapture.ts` → `captureSingle()` |
| 4 | **Burst mode** (interval + cancel + memory cleanup sa unmount/fail) | `hooks/usePhotoCapture.ts` → `captureBurst()`, `cancelBurst()` |
| 5 | **Filter selection hooks** | `hooks/useFilterSelection.ts` + `filters/filterCatalog.ts` + `components/FilterPicker.tsx` |
| 6 | **Premium filter locks** (fail-closed gate + paywall routing) | `monetizationBridge.ts` + gate sa `useFilterSelection` |
| 7 | **Upload handoff readiness** (backend 3-step protocol) | `services/uploadHandoff.ts` — `requestPhotoUpload` → signed-URL PUT → `finalizePhotoUpload`, may `reportUploadFailed` rollback |
| 8 | **AR / face-detection readiness** | `components/CameraView.tsx` (onFacesDetected) + `services/faceDetection.ts` (TODO seam para sa AR sticker module) |

## 📁 File tree

```
src/modules/camera/
├── index.ts                      # Barrel export — import lahat dito
├── types.ts                      # Contracts (gate, handoff, capture, faces)
├── constants.ts                  # Tunables (burst count/interval, upload limits)
├── monetizationBridge.ts         # Monetization module → PremiumFilterGate adapter
├── components/
│   ├── CameraView.tsx            # expo-camera wrapper (typed handle, face events)
│   └── FilterPicker.tsx          # Filter rail na may 🔒 premium lock chips
├── screens/
│   └── CameraScreen.tsx          # Reference screen — pumapalit sa 'Camera' placeholder
├── hooks/
│   ├── useCameraPermission.ts
│   ├── useCameraDirection.ts
│   ├── useFilterSelection.ts
│   └── usePhotoCapture.ts        # Single + burst, ref buffer, cancel, cleanup
├── services/
│   ├── uploadHandoff.ts          # 3-step upload protocol (injectable Functions)
│   ├── imageProcessing.ts        # expo-image-manipulator compress/resize
│   └── faceDetection.ts          # AR seam + face mapping
└── filters/
    └── filterCatalog.ts          # Filter IDs — tugma sa monetization PREMIUM_FILTER_IDS
```

## 🔌 Integration (3 hakbang)

### 1. Sa screen na nasa loob ng `<SubscriptionProvider>`

```tsx
import { createMonetizationGate } from './modules/camera';
import { useFilterGate } from './modules/monetization'; // existing module
import { getFunctions } from 'firebase/functions';

const gate = createMonetizationGate({
  canUseFilter,                       // mula sa monetization module
  user,                               // user doc mula sa AuthContext
  onLocked: (filterId) => paywallRef.current?.open(filterId), // PaywallModal
});
```

### 2. Palitan ang `Camera` placeholder sa `RootNavigator`

```tsx
<Stack.Screen name="Camera">
  {() => (
    <CameraScreen
      premiumGate={gate}
      onCaptureComplete={(mode, photos) =>
        navigation.navigate('PhotoPreview', { mode, photos })
      }
      onCancel={() => navigation.goBack()}
    />
  )}
</Stack.Screen>
```

### 3. Upload sa PhotoPreview (handoff — hindi sa camera screen)

```tsx
import { createUploadHandoff } from './modules/camera';
import { getFunctions } from 'firebase/functions';

const handoff = createUploadHandoff(getFunctions(app));
const reservation = await handoff.requestPhotoUpload({ filterId, mode });
await handoff.uploadFile(reservation, photo.uri);
await handoff.finalizePhotoUpload(reservation, { filterId, mode, width, height });
// Kung nabigo:  await handoff.reportUploadFailed(reservation, reason);
```

Tugma ito sa backend Cloud Functions na `requestPhotoUpload` / `finalizePhotoUpload` / `reportUploadFailed` (quota pre-check + signed URL + credit debit sa server). Para sa emulator testing: `connectFunctionsEmulator` bago pumasa sa `getFunctions(app)`.

## 📱 Permission strings (iOS Info.plist + Android manifest)

- **iOS** (`app.json` → `ios.infoPlist` — nasa mobile core na):
  - `NSCameraUsageDescription` — "Kailangan ang camera para kumuha ng litrato."
  - `NSPhotoLibraryUsageDescription` — "Kailangan ang photo library para mag-save ng litrato."
- **Android** (`app.json` → `android.permissions`):
  - `CAMERA` (+ `READ_MEDIA_IMAGES` sa targetSdk 33+)

⚠️ Huwag i-remove ang `expo-camera` at `expo-image-manipulator` sa `app.json` plugins.

## 🧪 Paano i-test

```bash
# sa mobile/
npx tsc --noEmit        # typecheck (module ay strict-TS)
npx expo start          # buksan ang Camera route sa Expo Go / dev client
```

Manual: single capture → preview; 4-burst → progress badge → stop sa gitna → walang crash; locked filter → paywall bubukas, hindi nagiging aktibo; airplane mode sa upload → reservation rollback via TTL (30 min).

## ⚠️ Mga limitation (honest)

1. **AI filter rendering** ay nasa PhotoPreview/AI module — ang camera module ay nag-iingat lang ng `filterId` sa bawat shot.
2. **AR stickers** — seam lang ang `faceDetection.ts` (`detectFacesForStickers` ay TODO); live detection events ay dumadaloy na sa `CameraView.onFacesDetected`.
3. **Receipt verification** — nasa Cloud Functions (backend module), hindi dito.
4. **Video/GIF mode** — hindi pa kasama; `CaptureMode` ay extensible kung kailangan.
