# 🔗 Integration Test Matrix — Photobooth Monorepo

Bawat row = isang totoong hand-off sa pagitan ng modules. Ang "Contract" ay ang eksaktong
tawag/shape na sinusuri. ✅ = tugma sa pagkakabasa ko ng dalawang files; ❌ = napatunayang
mali ang tugma (patunay sa `06-STATIC-FINDINGS.md`); ⚠️ = kailangan ng tao/desisyon.

## A. Mobile ↔ Backend (Cloud Functions, rehiyon `asia-southeast1`)

| # | Hand-off | Contract | Kalagayan | Ebidensya |
|---|----------|----------|-----------|-----------|
| A1 | Camera → upload | `requestPhotoUpload` → signed-URL PUT → `finalizePhotoUpload`; fail → `reportUploadFailed` | ✅ | `mobile/src/modules/camera/services/uploadHandoff.ts` ↔ `functions/src/callables/photos.ts` |
| A2 | Mobile-core legacy upload | `uploadPhoto(photoBase64, …)` callable | ❌ **Wala sa backend** | `mobile/src/services/functions.ts:33` vs export list ng `functions/src/callables/*` |
| A3 | Premium activation | `activatePremium(subscriptionId, platform)` | ❌ **Backend ay `verifyPremiumPurchase`** | `mobile/src/services/functions.ts:42` vs `functions/src/callables/subscriptions.ts` |
| A4 | Functions region | Client naka-pin sa `asia-southeast1` | ❌ sa `mobile/src/services/functions.ts` (`getFunctions(firebaseApp)` — walang region → `us-central1`) | `functions.json` runtime + `REGION` sa `functions/src/config/constants.ts` |
| A5 | Preview-editor upload queue | 3-step protocol, region-pinned, idempotencyKey | ✅ (ngunit tingnan A6) | `preview-editor/.../services/cloudFunctions.ts` |
| A6 | Preview-editor import ng firebaseApp | `'../../../services/firebase'` | ❌ **Sira ang path** dahil double-nesting | `mobile/src/modules/preview-editor/src/modules/preview-editor/services/cloudFunctions.ts:15` |
| A7 | Analytics events | `logAnalyticsEvents` allowlist + max 25 batch | ✅ | `constants.ts` `ANALYTICS_EVENT_ALLOWLIST` + smoke-test step 8 |
| A8 | Bootstrap/profile | `bootstrapSession` gumagawa ng users doc + quota + claims | ⚠️ Hindi pa ginagamit ng mobile core | `mobile/src/services/auth.ts` ay direkta `setDoc` — P0-3 |

## B. Mobile modules ↔ Monetization

| # | Hand-off | Contract | Kalagayan | Ebidensya |
|---|----------|----------|-----------|-----------|
| B1 | Filter catalog ↔ premium IDs | `isPremium:true` ids ≡ `PREMIUM_FILTER_IDS` (8) | ✅ | `filterCatalog.ts` vs `plans.js` (natetest sa `plans.test.js`) |
| B2 | Camera premium gate | `createMonetizationGate({ canUseFilter, user, onLocked })` fail-closed | ✅ kung nasa loob ng `<SubscriptionProvider>` | `mobile/src/modules/camera/monetizationBridge.ts` |
| B3 | Provider mounting | `<SubscriptionProvider>` sa App root | ❌ **Hindi naka-mount** sa `mobile/App.tsx` (Theme → Auth → Photo lang) | `mobile/App.tsx:13-21` |
| B4 | Paywall mount | `<PaywallModal>` sa screen stack + `onLocked` hookup | ❌ hindi pa naka-wire | `INTEGRATION_CHECKLIST.md` §4 |
| B5 | Quota UX mirror | Client `photosPerDay` ≡ backend `maxPhotosPerDay` (free=5 ✅) | ⚠️ Premium: client `Infinity` vs backend 500/day | `plans.js` vs `functions/src/config/constants.ts` |

## C. Mobile ↔ Firebase Security (runtime behavior)

| # | Scenario | Inaasahan | Kalagayan |
|---|----------|-----------|-----------|
| C1 | Signup (`signUpWithEmail`) | Gumawa ng `users/{uid}` | ❌ Sa root rules: `users` `allow create: if false` (identity trigger / `bootstrapSession` lang) — **magfa-fail sa production** |
| C2 | Profile cosmetic update | `displayName`, `photoURL`, `preferences`… | ✅ nasa whitelist ng rules |
| C3 | Plan write mula client | Dapat denied | ✅ `plan` wala sa whitelist |
| C4 | Photo doc write mula client | Dapat denied (functions lang) | ✅ `photos` `write: if false` |
| C5 | Storage upload (sarili, ≤10MB, image/*) | Allowed | ✅ `storage.rules` §users/{uid}/photos |
| C6 | Storage >10MB o .exe | Denied | ✅ size + MIME checks |

## D. Admin panel ↔ Backend

| # | Hand-off | Contract | Kalagayan |
|---|----------|----------|-----------|
| D1 | Admin login | Firebase Auth + `admins/{uid}` role check | ⚠️ **Root rules ay walang `admins` collection** — ang backend model ay `adminRoles/{uid}` + custom claim (`isAdmin()` = claim **AT** active doc). I-update ang `admin-panel/src/pages/Login.jsx` na sumunod dito |
| D2 | Users/plans/credits | `adminListUsers`, `adminSetUserPlan`, `adminAdjustCredits` | ✅ umiiral sa `functions/src/callables/admin.ts` |
| D3 | Filters CRUD | `adminUpsertFilter`, `adminDeleteFilter` | ✅ |
| D4 | Revenue source | `adminGetRevenue` / `adminGetDashboard` | ⚠️ `Dashboard.jsx` may random placeholder pa (Blocker B8) |
| D5 | Rules deployment | Root `firebase.json` → root rules | ⚠️ `admin-panel/` ay may **sariling** rules copies — iwasang i-deploy mula sa maling folder |

## E. DevOps ↔ Lahat

| # | Hand-off | Kalagayan |
|---|----------|-----------|
| E1 | `pr-checks.yml` → `npm run test:rules` | ❌ Script wala pa sa `functions/package.json` — idinadagdag ng QA pack (`.0-functions-package-additions.json`) |
| E2 | EAS profiles (dev/staging/production) | ✅ `devops/mobile/eas.json` — pero nasa `devops/` pa (reference tree), kailangang i-adopt sa root bago ang unang build |
| E3 | Emulator ports (auth 9099, functions 5001, firestore 8080, storage 9199, hosting 5000, UI 4000) | ✅ tugma sa root `firebase.json` |
| E4 | Seed + smoke | ✅ `scripts/seed.mjs` + `scripts/smoke-test.sh` nasa repo root |

## F. IAP / Monetization ↔ Stores

| # | Hand-off | Kalagayan |
|---|----------|-----------|
| F1 | `react-native-iap` o RevenueCat adapter | ⚠️ `services/iapAdapter.js` — TODO-marked, kailangang piliin ang vendor |
| F2 | Server-side receipt verify | ⚠️ Placeholder lang (Blocker B5) — **hindi puwedeng i-ship** |
| F3 | Product IDs | `com.yourbrand.photobooth.premium.monthly` (Apple) / `photobooth_premium_monthly` (Google) — palitan ng totoong brand |

---

## Happy-path E2E (isang patakbuhin, emulator + device)

```
Signup (bootstrapSession) → Onboarding → Home (5 credits) → Camera (permission → single)
→ PhotoPreview (filter=none, upload queue) → finalize → Home recent + Gallery may bagong photo
→ Quota 4/5 → burst x4 → 0/5 → ika-6 blocked + Paywall → cancel → Settings → Premium screen
→ (sandbox purchase) → verifyPremiumPurchase → plan=premium → unlimited burst
→ Share (link) → open /s/{token} sa browser → revoke → 404
Admin: login → dashboard counts tugma → users list may bagong user → revenue may subscriptions row
```
