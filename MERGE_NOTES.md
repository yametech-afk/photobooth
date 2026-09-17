# 📝 MERGE NOTES — Photobooth v4 FINAL (consolidated)

**Petsa:** 17 Setyembre 2026
**Output:** `photobooth-v4-final.zip` → `photobooth-monorepo/`
**Base:** mobile-fixed monorepo v4 · **Overlay:** devops-fixed monorepo v4, shared-contracts v4, QA pack, audit
**Prinsipyo:** walang naimbentong code. Bawat file ay galing sa isang source artifact; ang tanging
orihinal na isinulat dito ay ang `README.md`, `MERGE_NOTES.md`, at `docs/MERGE-VERIFY-REPORT.txt`.

---

## 1) Pinagmulan ng bawat bahagi (diff-based, hindi hula)

| Artifact | Files | Naging papel sa merge |
|---|---|---|
| mobile-fixed monorepo v4 (`QysXHkM3`) | 203 | **BASE buong tree.** Nagbigay ng mobile subtree (RootNavigator na naka-wire sa totoong modules, `services/functions.ts` na tumutugma sa backend exports, `AuthContext` na walang client `setDoc`, monetization runtime barrel `index.js`, `syncClaims.ts`, `V4-PATCH-NOTES.md`), root `package-lock.json` |
| devops-fixed monorepo v4 (`H3yknnSC`) | 207 | **Overlay ng DevOps/CI:** root `.github/workflows/*` (5), `functions/test/**` (rules suites + `tsconfig.rules.json`), `functions/package.json` (test/test:rules + devDeps), `mobile/jest.config.js`, buong `devops/` (validate.py v4, MERGE-READY, RULES-PARITY, CI-CHANGELOG), `.firebaserc` + `firebase.json` na may `hosting target: admin`, `DEVOPS-PATCH-v4-README.md` |
| shared-contracts monorepo v4 (`M5VazzbC`) | 206 | **`shared/` (8 file)** — sa M at D ay walang laman ang `shared/` (verified: 0 file) |
| QA pack (`4DD70vf9`) | 17 | **`qa/`** — test plan, integration matrix, regression checklist, release gates, emulator strategy, static findings (F-1…F-12) + mobile/functions tests |
| Readiness audit (`YENgITpb`) | docx | **`docs/Photobooth-Final-Readiness-Audit.docx`** (reference) |
| Admin panel artifact (`vB7pQBS2`) | 38 | **Walang divergence:** `diff -rq` laban sa monorepo copy → **rc=0 (byte-identical)**. Nanatili ang monorepo copy |
| Backend artifact (`yLDqdMGX`) | 46 | **Walang divergence sa code:** `functions/src` → rc=0; root `firestore.rules`, `storage.rules`, `firestore.indexes.json` → identical. Ang `firebase.json`/`.firebaserc` lang ang nagkaiba (hosting target) → nanalo ang devops v4 |

---

## 2) Mga desisyon sa conflict (per file)

**Alituntunin:** bagong patch lang ang nanalo kung naglalaman ito ng fix ng isa. **Hindi** basta-basta
sinusunod ang mtime — may file na mas bago ang timestamp pero mas luma ang logic.

| File | Nanalo | Bakit (ebidensya ng diff) |
|---|---|---|
| `mobile/src/navigation/RootNavigator.tsx` | **mobile-fixed** bagaman mas bago ang mtime ng devops copy (01:07 vs 01:05) | Ang devops copy ay naka-mount pa rin sa `ModulePlaceholderScreen` para sa Premium at hindi nag-i-import ng `PremiumScreen`/`EventBookingScreen`; ang mobile-fixed ay may 0 placeholder registration at totoong wiring (`PhotoPreviewScreen`, `PhotoEditorScreen`, `StripLayoutScreen`, `PremiumScreen`, `EventBookingScreen`) |
| `mobile/src/services/functions.ts` | **mobile-fixed** (221 linya ng diff) | Ang devops copy ay tumatawag pa sa `uploadPhoto`/`activatePremium` na **wala** sa backend exports at gumagawa ng `getFunctions(app)` na walang region — ito mismo ang P0 defects F-2/F-3 |
| `mobile/src/contexts/AuthContext.tsx`, `mobile/src/services/auth.ts`, `mobile/src/services/firebase.ts`, `mobile/src/navigation/types.ts` | mobile-fixed | Bootstrap sa server (`bootstrapSession`) + region-pinned `functions`; ang lumang bersyon ay may client `setDoc` (F-1) |
| `mobile/src/modules/monetization/**` (index.js, index.d.ts, SubscriptionContext, PremiumScreen, EventBookingScreen, PaywallModal, iapAdapter, subscriptionService, firebase bridge) | mobile-fixed | Runtime barrel `index.js` na **kailangan** ng Metro (`export * from './src/monetization'`); ang devops copy ay types-only (`index.d.ts`) → babagsak ang bundler |
| `mobile/package.json` | **pinagsama (union)** | Base = devops (jest/jest-expo devDeps + `test`, `test:ci`) + idinagdag ang scripts ng mobile-fixed (`test:contract`, `expo:doctor`, `typecheck`, `lint`). Ang `dependencies` block ay magkapareho sa dalawa, kaya walang nadagdag/nawala |
| `mobile/.env.example` | mobile-fixed | Inalis ang `EXPO_PUBLIC_REPLICATE_API_KEY` (naka-inline ito sa bundle kapag naka-set) at idinagdag ang IAP vars; ang devops copy ay mayroon pa ng Replicate key |
| `functions/package.json` | devops-fixed | Nagdaragdag ng `lint` (kailangan ng `firebase.json` predeploy), `test`, `test:unit`, `test:rules`, `test:rules:ci` + rules-test devDeps |
| `functions/test/**` | devops-fixed | Kabilang ang `tsconfig.rules.json` (self-contained); pinanatili rin ang QA pack na bersyon sa `qa/functions/test/` bilang reference |
| `.firebaserc`, `firebase.json` | devops-fixed | `hosting target: admin` + hosting aliases para sa dev/staging/prod — kung wala ito, **mabibigo** ang `firebase deploy --only hosting:admin` |
| `devops/**` | devops-fixed | validate.py v4 (12 bagong cross-file checks), MERGE-READY.md, RULES-PARITY.md, CI-CHANGELOG-v4.md; **inialis** ang `devops/.github` (superseded ng root workflows, ayon sa DEVOPS-PATCH-v4-README) |
| `devops/admin-panel/.env.example` | devops-fixed | `REACT_APP_*` → `VITE_*` (fix ng W3 env-prefix mismatch) |
| `shared/**` | shared-contracts v4 | Ang M at D ay blangko ang `shared/` — ito lang ang may shared contracts |
| `admin-panel/**` | monorepo (mobile-fixed base) | Byte-identical sa "current admin panel artifact" (diff rc=0) — walang kalabang bersyon |
| `functions/src/**` | mobile-fixed base | Kapareho ng backend artifact + `syncClaims.ts` (cross-region claim bridge, **hindi naka-wire**) |
| `qa/` (bago sa tree) | QA pack | Inilagay bilang `qa/` para hindi makabangga sa `functions/test/` at `mobile/__tests__/` |
| Root `package-lock.json` | mobile-fixed | Nasa M lang (name=`photobooth-monorepo`, lockfileVersion 3, 1437 packages) |
| Root `README.md`, `MERGE_NOTES.md` | **isinulat dito** | Konsolidasyon/summary — hindi galing sa artifact |

**Walang naganap:** walang blind `cp -r` ng isang buong tree sa ibabaw ng iba. Per-path ang overlay,
may `diff -rq` bago ang bawat desisyon. Walang node_modules sa zip.

---

## 3) ✅ Naayos na blocker (may landas ng file)

| ID | Blocker | Status | Ebidensya sa merged tree |
|---|---|---|---|
| W1 | Navigator naka-mount sa PLACEHOLDER | **FIXED (code)** | `mobile/src/navigation/RootNavigator.tsx` — totoong `PhotoPreviewScreen`/`PhotoEditorScreen`/`StripLayoutScreen`/`PremiumScreen`/`EventBookingScreen`; 0 `ModulePlaceholderScreen` registration (tingnan ang verify report) |
| F-1 | Client signup laban sa `allow create: if false` | **FIXED (code)** | `mobile/src/services/auth.ts` + `mobile/src/contexts/AuthContext.tsx` → `bootstrapSession` callable; walang client write sa `users/{uid}` |
| F-2 | Functions region hindi naka-pin | **FIXED (code)** | `mobile/src/services/firebase.ts` + `functions.ts` → `getFunctions(app,'asia-southeast1')`, isang instance |
| F-3 | Callable name mismatch (`uploadPhoto`/`activatePremium`/`validateReceipt`) | **FIXED (code)** | `mobile/src/services/functions.ts` na-rewire sa tunay na exports (`requestPhotoUpload`, `finalizePhotoUpload`, `reportUploadFailed`, `verifyPremiumPurchase`, `getMySubscription`, `cancelMySubscription`, `bootstrapSession`, `getQuota`, `getMyPhotos`, `deleteMyPhoto`, `createEventBooking`) |
| F-4 | Double-nesting ng `preview-editor` | **FIXED** | Isang `preview-editor` dir lang; walang `src/modules/src/modules` path sa tree |
| F-5 | Kulang na `react-native-view-shot` | **FIXED (dep)** | Nasa `mobile/package.json` dependencies: `react-native-view-shot@3.8.0` (+ `@react-native-community/slider`, `expo-asset`, `expo-clipboard`, `expo-gl`, `expo-linking`) |
| F-6 | CI `npm run test:rules` walang script | **FIXED** | `functions/package.json` (devops v4) ay may `test`, `test:unit`, `test:rules`, `test:rules:ci`; `functions/test/rules/*` nasa tree |
| F-7 | `<SubscriptionProvider>`/`PaywallModal` hindi naka-mount | **FIXED (code)** | `mobile/App.tsx` order: `Theme → Auth → Photo → Subscription → RootNavigator`; `PaywallModal` naka-mount sa nav flow |
| W3 | Admin env prefix (`REACT_APP_` vs `VITE_`) | **FIXED** | `devops/admin-panel/.env.example` = `VITE_*`; lahat ng workflow ay `VITE_*`; `admin-panel` source ay `VITE_*` |
| W5 | CI hindi naka-merge sa root | **FIXED** | Root `.github/workflows/` — 5 workflow; inalis ang `devops/.github` |
| — | `modules/monetization` types-only → babagsak ang Metro | **FIXED** | Bagong `mobile/src/modules/monetization/index.js` (runtime barrel) |
| — | Mirror write sa server-owned `subscriptions` | **FIXED** | Inalis sa `monetization/services/subscriptionService.js` |
| — | `res.success` vs `{verified}` (hindi nag-unlock ang Premium) | **FIXED** | `monetization/context/SubscriptionContext.jsx` → `res?.verified` |
| — | Shared contracts (bagong) | **PRESENT** | `shared/` 8 file: `CONTRACTS.md`, `callables.ts`, `routes.ts`, `plan-constants.ts`, `analytics-events.ts`, `firestore-schema.md`, `env-contract.md`, `README.md` |

---

## 4) ⛔ BUKAS PA (hindi ko sasabihing tapos kung hindi pa)

### Admin / backend blocker (hindi kayang isara ng merge)

| # | Blocker | Detalye | Kailangan |
|---|---|---|---|
| B-1 | **Admin identity model mismatch** (F-8) | `admin-panel/src/pages/Login.jsx` ay may demo fallback (`signIn({uid:'demo-admin', role:'superadmin'})` kapag hindi naka-set ang `VITE_*`), at ang dokumentadong real path ay `admins/{uid}` — ngunit ang root rules + backend ay **`adminRoles/{uid}` + custom claim `admin: true`**. Ang `admins` collection ay walang match block sa rules → **default-deny**. Kapag na-set ang `VITE_*` at totoong login ang gamit, **hindi makakapasok ang admin** hangga't hindi na-rewire sa `adminRoles`/claim at hindi na-provision ang admin | I-rewire ang Login (`adminRoles/{uid}` + `getIdTokenResult()` claim check), i-provision via CLI/`adminGrantRole`, i-rebuild ang `admin-panel/build/` |
| B-2 | **Backend hindi pa deployed** | Walang live Firebase project, walang deployed rules/functions/indexes, walang `adminRoles` doc, walang secrets (`REPLICATE_API_TOKEN`, `STRIPE_*`) | Gumawa ng dev/staging/prod Firebase project sa `asia-southeast1`; i-deploy ang rules+indexes+functions; i-set ang secrets; patakbuhin ang `scripts/seed.mjs` |
| B-3 | **IAP / bayad (W7) — BLOCKER para sa store** | `monetization/services/iapAdapter.js` ay puno ng `TODO(integration)` at `{ ok:false, error:'iap_not_configured' }`; ang server-side receipt verification ay may dev placeholder (hindi puwedeng i-ship as-is) | I-install ang `react-native-iap` (o RevenueCat), i-configure ang product `photobooth_premium_monthly`, at i-implement ang totoong App Store Server API / Google Play Developer API verification sa `functions` |
| B-4 | **`makePublic()` security hole (W6/F-9) — bukas pa** | `functions/src/services/photoService.ts:263` at `:430` ay gumagamit pa ng `makePublic()` (na-scope sa `public/photos/**` mirror, Admin-SDK lang — hindi na ang dating buong user library, ngunit hindi pa ganap na naalis) | Palitan ng signed URL / token share path |
| B-5 | Premium limit mismatch (F-10) | Client `plans.js` premium `photosPerDay: Infinity` vs backend `constants.ts` `maxPhotosPerDay: 500` | I-align ang bilang o i-letra ang "unlimited*" |
| B-6 | Duplicate `allow read` sa `firestore.rules` §photos (F-11) | Dalawang magkasunod na `allow read` (linya ~139 at ~144) — valid syntax, magulo lang | Pagsamahin; i-redeploy |
| B-7 | Replicate key sa mobile bundle (W11, partial) | Inalis na sa `mobile/.env.example`, pero `mobile/src/config/env.ts` ay nagbabasa pa ng `EXPO_PUBLIC_REPLICATE_API_KEY` — kung may mag-set nito, naka-inline sa bundle | Alisin ang reader (o gawing server-only ang AI filter path) |
| B-8 | Privacy policy / store assets / accounts (C13) | Wala pang live privacy policy, data-safety form, store listing, Apple/Google accounts | Legal + store ops |
| B-9 | Blaze + budget alerts + Firestore backup/restore (B3/W10) | Wala pang billing guardrail at na-test na restore | Firebase console + quarterly restore drill |
| B-10 | Expo/RN upgrade desisyon (B2) | Expo ~50 / RN 0.73 — nakatakda pa | Mag-upgrade o dokumentadong pagtanggap ng risk |
| B-11 | **Residual legacy callable sa preview-editor** (bahagi ng F-3) | Ang `mobile/src/modules/preview-editor/services/cloudFunctions.ts:229` ay tumatawag pa ng `'uploadPhoto'` (legacy) — nabanggit mismo sa `scripts/check-module.mjs:148` bilang legacy. Ang CORE path (`mobile/src/services/functions.ts`) ay naayos na, ngunit ang preview-editor upload path ay dapat i-rewire sa `requestPhotoUpload` → `finalizePhotoUpload` | I-rewire ang 3-step upload protocol sa preview-editor |
| B-12 | **EAS config hindi pa naka-adopt sa `mobile/`** | Ang `eas.json` at `app.config.js` ay nasa `devops/mobile/` pa (verified: `mobile/eas.json` = wala). Ayon sa DEVOPS-PATCH-v4-README, overlay lang ito — kailangan pang i-adopt sa `mobile/` bago ang `eas build` | `cp devops/mobile/eas.json devops/mobile/app.config.js mobile/` at i-set ang tunay na `projectId`/`ascAppId`/`appleTeamId` |

### Hindi na-verify (kailangan ng totoong environment)

- **Walang `npm install`** ng Expo/npm tree sa sandbox na ito → ang `tsc --noEmit`, bundler, at Jest verdicts ay **hindi ko pinapatunayan dito**. Ang dating `tsc → 0 error` na claim sa `V4-PATCH-NOTES.md` ay mula sa run ng sub-agent sa ibang session, hindi sa assembly na ito.
- **Hindi tumakbo** ang `firebase emulators:exec` (kailangan ng Firebase CLI + emulator suite) → ang rules tests (24 assertion), `smoke-test.sh` 15/15, quota/booking race, at scheduled-job dry run ay **hindi pa naipasa**.
- **Walang EAS build, walang device test, walang store submission.**
- Ang mga file-timestamp sa dalawang v4 patch ay konstruktibo lang (nasa loob ng iisang araw) — kaya ang naging basehan ng desisyon ay ang **nilalaman** (diff), hindi oras.

---

## 5) Ano ang aktwal na tumakbo sa konsolidasyong ito

Lahat ng output ay nasa `docs/MERGE-VERIFY-REPORT.txt` (kasama sa zip):

- File/dir counts per component; **0** `node_modules`; **0** nested duplicate root (`src/modules/src/modules`).
- `python3 devops/scripts/validate.py` — JSON/YAML validity + leaked-secret preflight (**exit code at buong output sa report**).
- JSON validity ng `firebase.json`, `firestore.indexes.json`, `.firebaserc`, lahat ng `package.json`.
- Greps na nagpapatunay: walang `ModulePlaceholderScreen` registration sa navigation; walang legacy callable string; lahat ng `getFunctions(` may region; bilang ng client write calls (`setDoc`/`addDoc`/`deleteDoc`) sa `mobile/src`; `TODO(integration)` count sa iapAdapter; `makePublic` call sites; `allow read` duplicates.
- `zip -T`/`unzip -t` integrity ng final zip.

---

## 6) Inirerekomendang susunod (ayos ang pagkakasunod)

1. **Admin identity (B-1)** — isara bago ang unang admin login; i-rebuild ang `admin-panel/build/`.
2. **Backend deploy + seed (B-2)** — dev project muna, tapos patakbuhin ang `qa/docs/qa/05-EMULATOR-STRATEGY.md` + `scripts/smoke-test.sh`.
3. **Patakbuhin ang tests (Gate 0/1)** — `npm --prefix mobile run typecheck` + `test:ci`; `npm --prefix functions run test:rules` sa emulator; admin `npm run build`.
4. **IAP (B-3)** — habang wala ito, **walang public store launch**; internal/beta lang.
5. **`makePublic` + rules cleanup (B-4, B-6)** — maliit na change, i-redeploy ang rules.
6. **Ops (B-9)** — budget alerts 50/80/100%, daily Firestore export, isang na-test na restore.
