# 🔍 Static Findings — Na-verify sa aktwal na monorepo (Sep 17, 2026)

Lahat ng nasa ibaba ay binasa ko mismo mula sa `photobooth-monorepo-final-v2.zip` — hindi hula.
Format: **F-#** · severity · file paths · ebidensya · suhestiyong ayos.

---

## F-1 · P0 · Client signup laban sa security rules
- **Saan:** `mobile/src/services/auth.ts` (`signUpWithEmail` → `setDoc(doc(db,'users',uid), profile)`) laban sa `firestore.rules` §users: `allow create: if false;`
- **Epekto:** Sa production rules, ang `setDoc` ay `PERMISSION_DENIED` → signup gagana sa Auth pero **magiguho sa profile creation**. Ang backend ay may `bootstrapSession` callable na gumagawa nang tama (profile + quota + claims, isang round trip).
- **Ayos:** Sa `AuthContext.signUp`, tawagin ang `bootstrapSession({ timezone })` pagkatapos ng `createUserWithEmailAndPassword`, at burahin ang client-side `setDoc`. Tumatakbo na ang test case R-01 dito.

## F-2 · P0 · Functions region hindi naka-pin sa mobile core
- **Saan:** `mobile/src/services/functions.ts:13` — `getFunctions(firebaseApp)` (walang region → `us-central1`), samantalang ang backend ay naka-deploy sa `asia-southeast1` (`functions/src/config/constants.ts` `REGION`).
- **Epekto:** Lahat ng tawag mula sa mobile core ay `functions/not-found` sa totoong project. (Tama ang preview-editor module: `getFunctions(firebaseApp, FUNCTIONS_REGION)`.)
- **Ayos:** `getFunctions(firebaseApp, 'asia-southeast1')` sa `mobile/src/services/functions.ts`.

## F-3 · P0 · Callable name mismong
- **Saan:** `mobile/src/services/functions.ts` ay tumatawag ng `uploadPhoto` at `activatePremium`; ang backend exports (`functions/src/callables/*`) ay `requestPhotoUpload` / `finalizePhotoUpload` / `reportUploadFailed` at `verifyPremiumPurchase` / `cancelMySubscription`. **Walang** `uploadPhoto` o `activatePremium` sa assembled backend.
- **Ayos:** I-rewire ang wrappers sa mga totoong callable names (3-step upload para sa photos; `verifyPremiumPurchase` para sa premium), o burahin ang legacy wrappers. Hinding-hindi ito mahuhuli ng typecheck dahil string ang function names — kaya may contract test tayo (`authQuota.test.tsx` + smoke test).

## F-4 · P0 · Double-nesting ng preview-editor → sira ang import
- **Saan:** `mobile/src/modules/preview-editor/src/modules/preview-editor/**` (double-nested). Mismo: `services/cloudFunctions.ts:15` ay nag-import ng `'../../../services/firebase'` na nag-resolve sa `src/modules/preview-editor/src/services/firebase` — **wala doon** (dapat `mobile/src/services/firebase`, apat na antas pataas). Ang MERGE_NOTES §2.1 ay nagsasabing inalis ang double-nesting, pero sa final zip nandiyan pa ito.
- **Ayos:** `git mv mobile/src/modules/preview-editor/src/modules/preview-editor mobile/src/modules/preview-editor` + i-fix ang import sa `'../../../services/firebase'` (3 antas mula sa `services/`).

## F-5 · P1 · Kulang na dependency: `react-native-view-shot`
- **Saan:** `mobile/src/modules/preview-editor/.../components/StripCanvas.tsx` (view-shot capture) — wala sa `mobile/package.json` dependencies.
- **Epekto:** Import error sa Strip/Save flows (runtime sa dev client; typecheck depende sa path).
- **Ayos:** `npx expo install react-native-view-shot` sa `mobile/` (Expo 50 compatible version).

## F-6 · P1 · CI `test:rules` script ay wala
- **Saan:** `devops/.github/workflows/pr-checks.yml` → `npm run test:rules` sa `functions/`; ang `functions/package.json` ay walang ganitong script (build/typecheck/serve/deploy lang).
- **Ayos:** Idagdag ang script mula sa `05-EMULATOR-STRATEGY.md` §2 (+ devDeps: jest, ts-jest, @firebase/rules-unit-testing). Kasama ang snippet na `.0-functions-package-additions.json` sa pack na ito.

## F-7 · P1 · `<SubscriptionProvider>` hindi naka-mount
- **Saan:** `mobile/App.tsx` (Theme → Auth → Photo lang). Ang camera `monetizationBridge.ts` at `useSubscription` ay nangangailangan nito; ang `PaywallModal` ay hindi pa naka-mount kahit saan.
- **Ayos:** I-wrap: `<AuthProvider><SubscriptionProvider><PhotoProvider>…` + i-mount ang `<PaywallModal>` sa MainFlow. (I-import mula sa `src/modules/monetization` pagkatapos maayos ang F-4-style nesting.)

## F-8 · P1 · Admin login model mismatch
- **Saan:** `admin-panel/src/pages/Login.jsx` ay naghahanap ng `admins/{uid}` collection; ang root rules + backend ay gumagamit ng `adminRoles/{uid}` + custom claim `admin: true` (pareho ang kailangan, `isAdmin()`).
- **Ayos:** I-update ang Login na basahin ang `adminRoles/{uid}` (read: self ay allowed sa rules) at i-provision ang mga admin via `adminGrantRole`/CLI. Tandaan: **walang `admins` match block sa root rules** — babagsak sa default-deny.

## F-9 · P2 · `makePublic()` usage — na-scope na, pero i-monitor
- **Saan:** `functions/src/services/photoService.ts:263,430` — tanging `public/photos/{id}.jpg` mirror lang (Admin SDK, para sa share links), HINDI ang lahat ng user uploads (wala na ang Blocker B7 na luma). Rules: `public/photos` write:false sa client.
- **Kailangang-kumpirmahin:** `createShare()` ay pinapalitan ang `visibility: private → public` (line ~449) — ibig sabihin, ang pag-share ay ginagawang publiko ang photo sa gallery. Kumpirmahin na sadya; kung hindi, gumawa ng `visibility: 'link'` na antas.

## F-10 · P2 · Premium limit mismatch (UX, hindi security)
- **Saan:** Client `plans.js`: premium `photosPerDay: Infinity`; backend `constants.ts`: premium `maxPhotosPerDay: 500`.
- **Ayos:** I-align (500, o iletak ang "unlimited*" na diskurso). Hindi ito bypass — ang server pa rin ang hatol.

## F-11 · P2 · Duplicate `allow read` sa photos rules
- **Saan:** `firestore.rules` §photos (dalawang `allow read` statement, linya ~139–144). Valid ang syntax pero magulo — pagsamahin.

## F-12 · P2 · DevOps tree ay reference pa rin
- **Saan:** `devops/.github/workflows/*`, `devops/mobile/eas.json`, `devops/firebase.json` — hindi pa naka-adopt sa root (MERGE_NOTES §3.1). Bago ang unang CI run, i-copy ang workflows sa root `/.github/workflows/` at i-adopt ang `eas.json`/`app.config.js` sa `mobile/`, pagkatapos i-diff ang rules (P0-10).

---

## Na-verify ring TAMA (para hindi ka na mag-isip)
- ✅ Emulator ports ng docs tugma sa root `firebase.json`
- ✅ `scripts/seed.mjs` + `scripts/smoke-test.sh` nasa repo root, tuma-tugma sa callable names ng backend
- ✅ Filter catalog (4 free + 8 premium) ≡ `PREMIUM_FILTER_IDS` — natetest at pumasa
- ✅ Storage rules: size/MIME/path scoping tugma sa `STORAGE_PATHS` sa `functions/src/config/constants.ts`
- ✅ `app.json` permissions strings nasa tamang lugar (iOS infoPlist + Android CAMERA)
- ✅ Camera module ay naka-merge sa tamang lalim (`mobile/src/modules/camera/`), deps nasa package.json
- ✅ Admin panel: may prebuilt `build/` (i-rebuild kung magbago), Vite SPA, walang test runner pa (P2: magdagdag ng Vitest)
