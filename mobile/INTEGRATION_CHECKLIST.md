# INTEGRATION_CHECKLIST.md — Photobooth Mobile Core

Checklist para i-konekta ang natitirang modules sa mobile core. Ang bawat item ay
may exact file/route na hinahawakan, para walang haka-haka pagdating ng integration.

---

## 1) Status ng mobile core — Tapos na ✅

| Bahagi | File | Status |
|---|---|---|
| App root (providers + error boundary) | `App.tsx` | ✅ |
| Firebase bootstrap (auth/firestore/storage) | `src/services/firebase.ts` | ✅ |
| Env config (walang hardcoded keys) | `src/config/env.ts`, `.env.example` | ✅ |
| Auth service (sign up/in/out + users doc) | `src/services/auth.ts` | ✅ |
| Cloud Functions client (uploadPhoto, activatePremium) | `src/services/functions.ts` | ✅ |
| Auth state + live profile subscription | `src/contexts/AuthContext.tsx` | ✅ |
| Photo state (pending, filter, recent) | `src/contexts/PhotoContext.tsx` | ✅ |
| Theme system (tokens + Poppins) | `src/theme/tokens.ts`, `ThemeContext.tsx` | ✅ |
| UI primitives (GradientButton, Input, Card, Screen) | `src/components/ui/` | ✅ |
| Error boundary | `src/components/ErrorBoundary.tsx` | ✅ |
| Navigation (auth gating + tabs + module routes) | `src/navigation/RootNavigator.tsx`, `types.ts` | ✅ |
| Screens: Onboarding, Login, SignUp, Home, Gallery, Settings | `src/screens/**` | ✅ |
| Module placeholder routes (Camera / PhotoPreview / Premium) | `src/screens/placeholders/ModulePlaceholderScreen.tsx` | ✅ crash-safe hangga't wala pa ang modules |

Verification: `npm install && npx tsc --noEmit` — walang TypeScript errors.

---

## 2) Camera module integration (Camera & AI Filters workstream)

- [ ] Gumawa ng `src/modules/camera/CameraScreen.tsx`
- [ ] Sa `src/navigation/RootNavigator.tsx`, palitan ang `name="Camera"` placeholder ng:
      `<MainStack.Screen name="Camera" component={CameraScreen} options={{ animation: 'slide_from_bottom' }} />`
- [ ] Sa capture, gamitin ang `usePhotos()` → `addPendingPhoto(photo)` at
      `navigation.navigate('PhotoPreview', { photos, filter: selectedFilterId })`
      (naka-declare na ang params sa `src/navigation/types.ts`)
- [ ] I-verify: Home → "Start Booth" → Camera → capture → PhotoPreview route

## 3) Preview / Editor module integration

- [ ] Gumawa ng `src/modules/editor/PhotoPreviewScreen.tsx`
- [ ] Palitan ang `name="PhotoPreview"` placeholder sa `RootNavigator.tsx`
- [ ] Basahin ang `route.params.photos` at `route.params.filter`
- [ ] I-upload via `uploadPhoto()` mula sa `src/services/functions.ts`
- [ ] Pagkatapos ng matagumpay na upload:
      `await refreshRecentPhotos(); clearPendingPhotos(); navigation.popToTop();`
- [ ] I-verify: lumalabas ang bagong photo sa Home "Recent photos" at Gallery

## 4) Premium module integration

- [ ] Gumawa ng `src/modules/premium/PremiumScreen.tsx`
- [ ] Palitan ang `name="Premium"` placeholder sa `RootNavigator.tsx`
- [ ] Sa matagumpay na purchase, tawagin ang `activatePremium({ subscriptionId, platform })`
- [ ] Auto-update ang UI (Home badge, Settings plan, credits) via AuthContext subscription
- [ ] Free-tier gating: `profile?.plan` at `profile?.creditsRemaining` mula sa `useAuth()`
- [ ] I-verify: Settings → "Upgrade to Premium" → Premium screen; walang crash ang upgrade flow

## 5) Backend / Firebase (functions workstream)

- [ ] I-deploy ang callable functions: `uploadPhoto`, `activatePremium` (region: asia-southeast1)
- [ ] I-deploy ang auth trigger `onUserCreate` (gumagawa ng `users/{uid}` doc)
- [ ] I-deploy ang `firestore.rules`, `storage.rules`, `firestore.indexes.json`
- [ ] Punan ang `mobile/.env` mula sa Firebase Console → `.env.example` ang gabay
- [ ] I-verify: sign up → may `users/{uid}` doc; upload → may `photos` doc + Storage file

## 6) Pre-release (DevOps workstream)

- [ ] `app.json`: palitan ang `bundleIdentifier` / `package` ng totoong brand
- [ ] `eas build:configure` at i-build ang production profiles
- [ ] Privacy policy URL + support email
- [ ] App Store / Play Console assets (screenshots, descriptions)
- [ ] I-scroll ang checklist sa itaas bago i-submit

---

## 7) Quick start

```bash
cd mobile
cp .env.example .env      # punan ng Firebase config values
npm install
npx tsc --noEmit          # typecheck
npx expo start
```
