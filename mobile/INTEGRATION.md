# INTEGRATION.md — Photobooth Mobile Core

Paano ikabit ang ibang modules (camera, preview/editor, gallery, premium, backend) sa mobile core na ito.

## 1. Current state

Mobile core ay **complete at production-ready**:
- Firebase bootstrap (`src/services/firebase.ts`) — auth persistence via AsyncStorage, Firestore, Storage
- Auth flow (`src/contexts/AuthContext.tsx`) — email/password sign up + sign in, live Firestore profile subscription (`users/{uid}`: plan, creditsRemaining, totalPhotosTaken)
- Navigation (`src/navigation/RootNavigator.tsx`) — auth gating (AuthFlow vs MainFlow), bottom tabs (Home / Gallery / Settings)
- Onboarding, Login, SignUp, Home, Gallery, Settings screens
- Theme system (`src/theme/`) — tokens + ThemeContext (colors, gradient, spacing, radius, Poppins fonts)
- UI primitives (`src/components/ui/`) — GradientButton, Input, Screen, Card
- App state (`src/contexts/PhotoContext.tsx`) — pendingPhotos (current booth session), selectedFilterId, recentPhotos

## 2. Navigation mount points (dapat i-register ng modules)

Sa `src/navigation/RootNavigator.tsx`, i-dagdag sa `MainStack.Navigator`:

```tsx
import CameraScreen from '../modules/camera/CameraScreen';
import PhotoPreviewScreen from '../modules/editor/PhotoPreviewScreen';
import PremiumScreen from '../modules/premium/PremiumScreen';

<MainStack.Screen name="Camera" component={CameraScreen} />
<MainStack.Screen name="PhotoPreview" component={PhotoPreviewScreen} />
<MainStack.Screen name="Premium" component={PremiumScreen} />
```

Ang route params ay naka-declare na sa `src/navigation/types.ts`:
- `Camera: undefined`
- `PhotoPreview: { photos: { uri; width?; height? }[]; filter: string }`
- `Premium: undefined`

## 3. Camera module contract

**Expected props/behavior:**
- Full-screen camera; gamitin ang `useTheme()` para sa colors at `usePhotos()` para sa filter state.
- Sa capture, kailangan lang tawagin:
  ```tsx
  const { addPendingPhoto, setSelectedFilterId } = usePhotos();
  navigation.navigate('PhotoPreview', { photos, filter: selectedFilterId });
  ```
- Hindi na kailangang mag-manage ng sariling filter state — gamitin ang `PhotoContext.selectedFilterId`.

## 4. Preview / Editor module contract

- Basahin ang `route.params.photos` at `route.params.filter`.
- Pagkatapos mag-upload sa Firebase Storage + `photos` collection (via Cloud Function `uploadPhoto` — tingnan ang Backend section), tawagin:
  ```tsx
  const { refreshRecentPhotos, clearPendingPhotos } = usePhotos();
  await refreshRecentPhotos(); // para mag-update ang Home + Gallery agad
  clearPendingPhotos();
  navigation.popToTop();
  ```

## 5. Gallery module

Ang `src/screens/gallery/GalleryScreen.tsx` ay 100% wired na sa `PhotoContext.recentPhotos` (Firestore `photos` where `uid == user`, orderBy createdAt desc, limit 20). Kung palalawakin (albums, sharing, delete), gamitin pa rin ang `refreshRecentPhotos()` pagkatapos ng mutation.

## 6. Premium module contract

- I-navigate mula sa kahit saan: `navigation.navigate('Premium')` (naka-declare na sa `MainStackParamList`).
- Sa successful purchase, i-update ang profile via Cloud Function `activatePremium` (tingnan ang functions module) — ang AuthContext subscription ay auto-ma-update ang UI (Home badge, Settings plan, credits).
- Free-tier gating: gamitin ang `profile?.plan` at `profile?.creditsRemaining` mula sa `useAuth()`.

## 7. Backend (Cloud Functions) contract

Ang core ay nag-a-assume ng mga sumusunod na callable functions (nasa `functions/` workstream):
- `uploadPhoto(photoBase64, filterId, eventId?, metadata?)` → `{ success, photoId, url, remainingCredits }`
- `activatePremium(subscriptionId, platform)` → `{ success, plan }`
- Auth trigger `onUserCreate` na gumagawa ng `users/{uid}` doc (signUpWithEmail ay gumagawa na rin ng doc bilang fallback).

Firestore schema: `users`, `photos`, `filters`, `subscriptions`, `events` — tignan ang database workstream para sa full schema at security rules.

## 8. Env / secrets

- Kopyahin ang `.env.example` → `.env`, punan ng Firebase config values mula sa console.
- Basahin lang via `src/config/env.ts` — huwag mag-hardcode ng keys.
- `isFirebaseConfigured` ay nagwa-warn sa console kapag kulang ang env vars.

## 9. Verification checklist bago i-merge

- [ ] `npm install` at `npx expo start` — gumagana ang app sa Expo Go
- [ ] Sign up → automatic punta sa MainFlow (Home tab)
- [ ] Sign out → balik sa Onboarding/Login
- [ ] Home "Start Booth" → nagre-resolve ang `Camera` route kapag naka-register na ang camera module
- [ ] Gallery naglo-load pag may docs sa `photos` collection
