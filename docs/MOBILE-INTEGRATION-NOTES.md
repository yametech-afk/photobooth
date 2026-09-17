# 📱 Mobile Integration Notes — v4

**Petsa:** 17 Setyembre 2026
**Scope ng pagbabago:** mobile subtree LANG (`mobile/**` + isang cross-region bridge sa `functions/`).
**Base package:** `photobooth-monorepo-final-v3.zip` (198 file).
**Trigger:** QA pack (`docs/qa/06-STATIC-FINDINGS.md`, F-1…F-12) + Final Readiness Audit (W1–W15).

Nakaayos ang dokumentong ito ayon sa mga ibinigay na blocker. Ang bawat item ay may
**file na hinawakan → ano ang binago → paano na-verify**.

---

## 1. Ano ang NA-AYOS (may ebidensya)

### F-1 · P0 · Forbidden client write sa signup (auth rules mismatch)

| | |
|---|---|
| **File** | `mobile/src/services/auth.ts` · `mobile/src/contexts/AuthContext.tsx` |
| **Dati** | `signUpWithEmail` ay tumatawag ng `setDoc(doc(db,'users',uid), profile)` — direktang client write sa `/users`, na `allow create: if false` sa `firestore.rules`. Sa production = `PERMISSION_DENIED`; gumagana ang Auth pero gumuguho ang profile creation. Nag-assume pa ng `creditsRemaining: 5` sa client. |
| **Ngayon** | Pagkatapos ng `createUserWithEmailAndPassword` + `updateProfile`, tinatawag ang **`bootstrapSession`** callable (nagagawa ng `users/{uid}` + `quotas/{uid}`, nag-sync ng custom claims, isang round trip). Sinusundan ng `user.getIdToken(true)` para sariwa ang claims bago ang unang rule-guarded read. Ginawa rin ito sa **sign-in** para self-heal ang kulang na profile. |
| **Verification** | `grep -rn "setDoc\|addDoc\|updateDoc" mobile/src` → **0 aktwal na tawag** (komento lang ang natitira). `npx tsc --noEmit` → **0 error**. |

### F-2 · P0 · Functions region hindi naka-pin

| | |
|---|---|
| **File** | `mobile/src/services/firebase.ts` · `mobile/src/services/functions.ts` · `mobile/src/modules/monetization/src/services/firebase.js` · `.../screens/EventBookingScreen.jsx` |
| **Dati** | `getFunctions(firebaseApp)` sa mobile core (walang region → `us-central1`), at `getFunctions()` (mas malala) sa monetization. Ang backend ay `asia-southeast1` (`functions/src/config/constants.ts:9`). Sa totoong project → `functions/not-found` sa LAHAT ng tawag. |
| **Ngayon** | Isang region-pinned instance sa bootstrap: `getFunctions(app, 'asia-southeast1')`, ini-export bilang `functions` + `FUNCTIONS_REGION`. Ang lahat ng module ay umiimport ng instance na iyon — hindi na nagko-construct ng sariling `getFunctions`. |
| **Verification** | `grep -rn "getFunctions(firebaseApp)\|getFunctions()" mobile/src` → **0 aktwal na tawag** (komento lang sa 4 file). |

### F-3 · P0 · Callable name mismatch (mobile ↔ backend)

| | |
|---|---|
| **File** | `mobile/src/services/functions.ts` · `mobile/src/modules/monetization/src/monetization/services/subscriptionService.js` |
| **Dati** | Mobile core: `uploadPhoto` + `activatePremium`. Monetization: `validateReceipt`. **Wala ni isa** sa assembled backend (`functions/src/index.ts`). Hindi ito mahuhuli ng typecheck dahil plain string ang function names. |
| **Ngayon** | Ang `mobile/src/services/functions.ts` ay typed wrappers na tumutugma sa aktwal na exports: `bootstrapSession`, `getQuota`, `verifyPremiumPurchase`, `getMySubscription`, `cancelMySubscription`, `requestPhotoUpload`, `finalizePhotoUpload`, `reportUploadFailed`, `getMyPhotos`, `deleteMyPhoto`. Ang monetization ay `verifyPremiumPurchase` na (ang `validateReceipt` ay deprecated alias na nag-forward lang). |
| **Verification** | Script na nag-e-extract ng lahat ng `httpsCallable(functions, 'NAME')` string at nag-diff laban sa `functions/src/index.ts` → **lahat ng 11 pangalan ay existing exports**; `validateReceipt` → 0 hits. |

### W1 · BLOCKER · Navigator naka-mount sa PLACEHOLDER

| | |
|---|---|
| **File** | `mobile/src/navigation/RootNavigator.tsx` · `mobile/src/navigation/types.ts` |
| **Dati** | `Premium` route = `ModulePlaceholderScreen`. Ang widget na `Premium` lang ang placeholder; Camera/Preview/Editor/Strip ay totoo na (kaya W1 ay bahagyang naayos noong v3, hindi ganap). |
| **Ngayon** | `Premium` → totoong `PremiumScreen`; **bagong** `EventBooking` route → totoong `EventBookingScreen` (dati hindi naka-register kaya `navigation.navigate('EventBooking')` mula sa PremiumScreen ay isang dead end). Walang `ModulePlaceholderScreen` registration na natitira sa navigator. |
| **Verification** | `grep -n "PremiumScreen\|EventBookingScreen\|PhotoPreviewScreen\|PhotoEditorScreen\|StripLayoutScreen" mobile/src/navigation/RootNavigator.tsx` → 10 hits, 5 route registrations. `grep -rn "ModulePlaceholderScreen" mobile/src/navigation/` → **0**, komento lang. |

### F-7 · P1 · Provider nesting (SubscriptionProvider / PaywallModal)

| | |
|---|---|
| **File** | `mobile/App.tsx` · `mobile/src/navigation/RootNavigator.tsx` |
| **Dati** | `App.tsx` = `Theme → Auth → Photo → Subscription`. Nasa loob ang `SubscriptionProvider` ng `PhotoProvider`. Ang `PaywallModal` ay naka-mount LANG sa loob ng `CameraRoute` (`source="filter"`), kaya ang quota-triggered paywall sa preview/gallery ay hindi lumalabas. |
| **Ngayon** | Inayos ang order: `Theme → Auth → Subscription → Photo`. Idinagdag ang **pangalawang** `PaywallModal` (`source="quota"`) sa `MainFlow`, kaya available ang paywall sa buong authenticated flow; nananatili ang filter-source modal sa camera. |
| **Verification** | Basahin ang `App.tsx` at `RootNavigator.tsx`; `npx tsc --noEmit` → 0 error. (Ang aktwal na pag-pop ng modal ay device test — §4.) |

### BAGO (natuklasan sa v3, hindi nasa audit) · Runtime barrel ng monetization

| | |
|---|---|
| **File** | `mobile/src/modules/monetization/index.js` **(created)** · `index.d.ts` |
| **Problema** | Ang `App.tsx` at `RootNavigator.tsx` ay umi-import ng `../modules/monetization`, pero ang folder na iyon ay may **`index.d.ts` lamang** — walang `index.js`. Ang types-only file ay wala sa runtime, kaya ang Metro ay hindi ma-resolve ang directory import → **babagsak ang bundler** sa `npx expo start`. Hindi ito makikita ng `tsc` (para sa TypeScript, balido ang `index.d.ts`). |
| **Ngayon** | Nilikha ang `index.js` na nag-`export * from './src/monetization'` — ang tunay na runtime entry point. Idinagdag din sa `index.d.ts` ang `isPremium`, `PremiumScreen`, `EventBookingScreen` (mga ginagamit na ngayon ng navigator). |
| **Verification** | `ls mobile/src/modules/monetization/index.js` → existing; `tsc` → 0 error. |

### Iba pang inayos sa mobile

| Ano | File | Detalye |
|---|---|---|
| `restore`/`purchase` result shape | `SubscriptionContext.jsx` | Ang context ay nagbabasa ng `res?.success` pero ang server ay `{ verified }`. Ngayon `res?.verified` — kung hindi, **hindi kailanman** nag-u-unlock ang Premium pagkatapos ng wastong bayad. |
| `isPremium` wala sa context | `SubscriptionContext.jsx` | Ang `PremiumScreen`/`PaywallModal` ay nagbabasa ng `isPremium` mula sa context pero hindi ito ine-export ng provider → laging `false` → **laging lumalabas ang "Mag-Subscribe" CTA kahit Premium na**. Idinagdag sa context value + deps. |
| `restore` signature | `PremiumScreen.jsx` · `PaywallModal.jsx` | `onPress={restore}` ay nagpapasa ng **press event** bilang `platform` argument. Ginawang `onPress={() => restore()}`. Nagbabalik na ng `{ ok, receipts }` ang adapter. |
| Forbidden write #2 (mirror) | `subscriptionService.js` | Ang `writeSubscriptionRecord()` ay `setDoc('subscriptions/{uid}')` — `allow write: if false` sa rules. **Inalis**, hindi lang ginwardiyahan. |
| Event booking contract | `EventBookingScreen.jsx` | Dati: `{ packageId, packageName, contact, eventDate, uid }` + `res.data.success`. Pero ang backend ay nangangailangan ng **`eventId` + `slotId`** (required) at `guestName`/`attendees`; at ang wrapper ay nagbabalik na ng `data`. Ngayon: tumatawag lamang kapag may event+slot id (may input fields), tamang payload, `res.data?.success`. Kapag wala, **mailto enquiry** (hindi nag-iimbento ng id). |
| Replicate key sa bundle | `mobile/.env.example` | Inalis ang `EXPO_PUBLIC_REPLICATE_API_KEY` (naka-comment na may paliwanag). Lahat ng `EXPO_PUBLIC_*` ay na-i-inline sa JS bundle at nakukuha sa binary — ang AI token ay dapat server-side (W11). Idinagdag din ang kulang na IAP env vars. |
| `package.json` scripts | `mobile/package.json` | Wala noon ang `test`, `test:contract`, `typecheck` sa CI gate. Idinagdag ang `typecheck` (umiiral na), `test`, `test:contract`, `expo:doctor`. |

---

## 2. Verified na TAMA na (para hindi ka na mag-isip)

Ang mga ito ay na-check sa aktwal na file, hindi hula:

- **W2 (kulang na deps)** — **CLOSED na sa v3.** `@react-native-community/slider`, `expo-asset`, `expo-clipboard`, `expo-gl`, `expo-linking`, `react-native-view-shot` ay **nasa** `mobile/package.json` na.
- **F-4 (double-nesting ng preview-editor)** — **CLOSED na sa v3.** `find mobile/src/modules -path "*src/modules*"` ay `monetization` lang ang lumalabas; ang `preview-editor` ay flat na (`mobile/src/modules/preview-editor/screens/...`). Ang `services/cloudFunctions.ts` → `'../../../services/firebase'` ay tama (3 antas).
- **Preview/Editor/Strip mount** — naka-register na bilang totoong screens sa `MainFlow` (hindi placeholder).
- **Camera module** — totoo na ang `CameraScreen` na naka-mount (may `premiumGate` mula sa monetization + capture handoff).

---

## 3. Contract map — mobile tawag → backend export → region

| Mobile call site | Callable name | Backend source | Region |
|---|---|---|---|
| `services/functions.ts` → `bootstrapSession` | `bootstrapSession` | `callables/auth.ts:39` | `asia-southeast1` |
| `services/functions.ts` → `getQuota` | `getQuota` | `callables/photos.ts:51` | `asia-southeast1` |
| `services/functions.ts` → `verifyPremiumPurchase` | `verifyPremiumPurchase` | `callables/subscriptions.ts:68` | `asia-southeast1` |
| `monetization/.../subscriptionService.js` | `verifyPremiumPurchase` | pareho | `asia-southeast1` |
| `monetization/.../EventBookingScreen.jsx` | `createEventBooking` | `callables/events.ts:102` | `asia-southeast1` |
| `preview-editor/services/cloudFunctions.ts` | `requestPhotoUpload` · `finalizePhotoUpload` · `reportUploadFailed` · `getMyPhotos` · `deleteMyPhoto` · `getQuota` · `getMySubscription` · `createPhotoShare` · `revokePhotoShare` · `getSharedPhoto` | `callables/photos.ts` · `subscriptions.ts` | `asia-southeast1` (`constants.ts:18`) |
| `camera/services/uploadHandoff.ts` | `requestPhotoUpload` · `finalizePhotoUpload` · `reportUploadFailed` | pareho | tinatanggap bilang **injected** `FunctionsLike` — ang caller ang dapat magbigay ng region-pinned instance |

**Tandaan:** ang `uploadHandoff.ts` ay **hindi pa natawag kahit saan** (`grep -rn "createUploadHandoff" mobile/src` → 0 hits sa labas ng camera module). Ang aktwal na upload path ay ang `preview-editor/services/uploadService.ts` (may progress + cancel). Huwag i-mount ang camera handoff habang nandiyan ang uploadService — dalawang parehong upload path = doble ang pwedeng mag-debit.

---

## 4. Ano pa ang KAILANGAN NG TOTOONG ENVIRONMENT (hindi na-verify dito)

Ang mga ito ay **hindi** mapapatunayan sa static analysis. Huwag ideklarang "tapos" hangga't hindi tumakbo:

| # | Check | Paano patunayan | Inaasahang resulta |
|---|---|---|---|
| 1 | Dep resolution + typecheck | `cd mobile && npm install && npx tsc --noEmit` | 0 error. **Na-run dito: 0 error** (1199 packages). Ang `npm install` sa CI/device ang huling salita. |
| 2 | Metro bundling (ang tunay na panganib ng F-4/barrel) | `npx expo start` o `npx expo export` | Walang "Unable to resolve module" — lalo na para sa `modules/monetization` at `preview-editor`. |
| 3 | Signup laban sa PRODUCTION rules | Deploy ng rules, gumawa ng account sa device | Nagagawa ang `users/{uid}` + `quotas/{uid}`; **walang** `PERMISSION_DENIED`. Ito ang direktang test ng F-1. |
| 4 | Region correctness | Device → camera → upload | Walang `functions/not-found` (dati laging ganito). |
| 5 | Quota enforcement | Free user, 5 shots, ika-6 | Blocked + quota paywall (server `resource-exhausted`). Ito ang test ng bagong `PaywallModal` sa `MainFlow`. |
| 6 | Premium activation | Test receipt → `verifyPremiumPurchase`; fake receipt | Totoo = `verified:true`; fake = `verified:false`, nananatiling free. |
| 7 | Camera capture (single + 4-burst) | Physical device | Walang crash; naihatid sa PhotoPreview. |
| 8 | Preview → upload → gallery | Device, may network | `requestPhotoUpload` → signed PUT → `finalizePhotoUpload`; nabawasan ang credits; lumitaw sa gallery. |
| 9 | Premium screen render | Device, free user | Lumalabas ang plan table + CTA; **walang** crash. |
| 10 | EventBooking render | Device | `navigation.navigate('EventBooking')` → totoong screen (dati dead end). |
| 11 | `react-native-view-shot` sa Strip | Device, lumikha ng strip | Hindi "native module not found". |
| 12 | Emulator rules tests | `firebase emulators:exec --only firestore` | Ang QA pack `R-01` (signup) ay dapat green na ngayon. |

---

## 5. Alam na HINDI pa ayos (honest list)

| # | Item | Bakit hindi pa | Nasaan |
|---|---|---|---|
| 1 | **IAP hindi aktibo** | Stub ang store adapter. **Totoo** ang server verifier (`subscriptionService.ts`: Apple/Google/Stripe), ngunit hindi makakabenta hangga't hindi naka-install ang `react-native-iap`/RevenueCat at walang store credentials. **W7 pa ring bukas** at ito ang #1 blocker sa kita. | `.../monetization/services/iapAdapter.js` |
| 2 | **Expo 50 / RN 0.73** | Hindi in-upgrade (malaking trabaho, hindi kasama sa scope). Support risk (B2/W-luma). | `mobile/package.json` |
| 3 | **`expo-notifications` wala** | May FCM trigger ang backend pero walang push receiver ang app → dead feature (W14). | `mobile/package.json` |
| 4 | **Nested na inner tree ng monetization** | Hinding-hindi na-flatten: `modules/monetization/src/monetization/**` (+ `src/services/firebase.js` bridge na umaakyat ng 4 antas). **Sinadyang hindi inayos** — 16 file + import graph ang madadamay habang tumatakbo ang `tsc`; inayos ang tunay na sira (runtime barrel) sa halip. May paliwanag sa `index.js`. |
| 5 | **Wala pang analytics/crash SDK** | Walang Sentry/Crashlytics sa mobile (W15). | — |
| 6 | **`MediaLibrary.requestPermissionsAsync()` API** | Ang `preview-editor/hooks/useMediaPermission.ts` ay tumatawag ng `Permissions.MediaLibrary` na nasa `expo-media-library`, hindi `Permissions` mula `expo-camera`. Hindi sinuri (hindi kasama sa enumeration). | i-verify sa device |
| 7 | **Metrics sa admin Dashboard** | Random placeholder pa rin (B8). Labas ng mobile scope — hindi hinawakan. | `admin-panel/src/pages/Dashboard.jsx` |
| 8 | **`makePublic()`** | v3 rules na mismo ang `allow write: false` sa `public/photos` (Admin SDK lang), kaya na-scope na (F-9). Hindi ginalaw ang backend. | `functions/src/services/photoService.ts` |
| 9 | **Webhooks at `storeWebhookInUs`** | Idinagdag ang cross-region bridge (`functions/src/syncClaims.ts`) pero **hindi pa naka-wire** sa `storeWebhook`. May REPLACE_* placeholders. | `functions/src/syncClaims.ts` |

### Dalawang bagay na dapat mong malaman (natuklasan, hindi inayos)

- **Ang `firebase.json` hosting `public` ay `admin-panel/build`** at ang `admin-panel/build/` ay nakalagay bilang real na directory (hindi lang prebuilt bundle) — pareho pa rin itong dalawang bagay na pinagsama. Labas ng mobile scope.
- **Ang `admin-panel` ay may sariling `firestore.rules`** na iba ang admin model (`admins/{uid}`) kaysa root (`adminRoles/{uid}` + claim) — W4 pa ring bukas. Labas ng mobile scope.

---

## 6. Paano patakbuhin

```bash
cd mobile
cp .env.example .env          # punan ang Firebase + IAP values
npm install
npx tsc --noEmit              # release gate #1 → dapat 0 error
npx expo start                # release gate #2 → dapat walang Metro resolve error

# Backend (kapag handa nang mag-emulator)
cd ../functions && npm install && npm run build
cd .. && firebase emulators:start
```

---

## 7. Bakit ang mga file na ito ang binago (granularity check)

Walang file sa `camera/` o `preview-editor/` na `screens|components|hooks|services` ang ginalaw maliban sa `preview-editor` — at doon, **wala** (flat na at tama na). Ang pagbabago ay nasa **integration layer lang**:

```
mobile/src/services/{firebase,functions,auth}.ts        ← contract + region + bootstrap
mobile/src/contexts/AuthContext.tsx                     ← signup path
mobile/src/navigation/{RootNavigator.tsx,types.ts}      ← route mounting
mobile/src/modules/monetization/index.js (+.d.ts)       ← runtime entry point
mobile/src/modules/monetization/src/services/firebase.js← region-pinned functions
mobile/src/modules/monetization/src/monetization/
   services/{subscriptionService.js,iapAdapter.js}      ← callable names + platform
   context/SubscriptionContext.jsx                      ← isPremium, verified, deps
   screens/{PremiumScreen,EventBookingScreen}.jsx       ← restore(), booking contract
   components/PaywallModal.jsx                          ← restore()
mobile/{App.tsx,.env.example,package.json}              ← provider order, secrets, scripts
functions/src/syncClaims.ts                             ← bagong cross-region bridge
```

**Hindi binago ang monorepo structure.** Walang folder na inilipat o pinalitan ng pangalan.
