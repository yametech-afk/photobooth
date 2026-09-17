# 🧾 V4 PATCH NOTES — Mobile Focus

**Petsa:** 17 Setyembre 2026
**Base:** `photobooth-monorepo-final-v3.zip` (ginamit bilang canonical v3)
**Output:** `photobooth-monorepo-final-v4.zip` (buo, ready to merge) + `photobooth-mobile-patch-v4.zip` (mobile files lang)
**Scope:** mobile subtree. Isang bagong file sa `functions/` (hindi naka-wire). **Walang binago sa structure ng monorepo.**

Naka-base ang trabaho sa enumerated blockers ng QA pack (`docs/qa/06-STATIC-FINDINGS.md`, F-1…F-12)
at ng Final Readiness Audit (W1–W15) — hindi sa bagong listahan.

---

## ✅ PER-BLOCKER TABLE — file → binago → ebidensya

| ID | Blocker (galing sa QA/audit) | File na hinawakan | Ano ang binago | Verification evidence |
|---|---|---|---|---|
| **F-1** | Client signup laban sa `allow create: if false` sa /users | `mobile/src/services/auth.ts`, `mobile/src/contexts/AuthContext.tsx` | Inalis ang `setDoc('users/{uid}')`; gumagamit na ng `bootstrapSession` callable + `getIdToken(true)`; idinagdag sa sign-in path (self-heal) | `grep -rn "setDoc\|addDoc\|updateDoc\|deleteDoc" mobile/src` → **0 aktwal na tawag** (komento lang) · `tsc --noEmit` → 0 error |
| **F-2** | Functions region hindi naka-pin (`us-central1` vs `asia-southeast1`) | `mobile/src/services/firebase.ts`, `mobile/src/services/functions.ts`, `.../monetization/src/services/firebase.js`, `.../EventBookingScreen.jsx` | Isang region-pinned instance: `getFunctions(app,'asia-southeast1')`, ini-export bilang `functions` + `FUNCTIONS_REGION`; lahat ng module umi-import nito | `grep -rn "getFunctions(firebaseApp)\|getFunctions()" mobile/src` → **0 aktwal na tawag** · 4 na `getFunctions(` hits, lahat may region o komento |
| **F-3** | Callable name mismatch (`uploadPhoto`/`activatePremium`/`validateReceipt`) | `mobile/src/services/functions.ts`, `.../monetization/services/subscriptionService.js` | Rewire sa aktwal na exports ng backend; typed wrappers para sa 10 callables; `validateReceipt` → deprecated alias ng `verifyPremiumPurchase` | Scripted diff ng lahat ng `httpsCallable(_,'NAME')` string laban sa `functions/src/index.ts` → **lahat existing**; `'validateReceipt'` → 0 hits |
| **F-4** | Double-nesting ng preview-editor | — | **Wala nang double-nesting sa v3.** Na-verify, hindi na kailangan ng aksyon | `find mobile/src/modules -path "*src/modules*"` → `monetization` lang; `preview-editor` ay flat |
| **F-7** | `<SubscriptionProvider>` order + `PaywallModal` hindi naka-mount sa buong flow | `mobile/App.tsx`, `mobile/src/navigation/RootNavigator.tsx` | Order → `Theme → Auth → Subscription → Photo`; idinagdag ang quota-source `PaywallModal` sa `MainFlow` (nananatili ang filter-source sa camera) | Basahin ang 2 file · `tsc` → 0 error |
| **W1** | Navigator naka-mount sa PLACEHOLDER (Premium) | `mobile/src/navigation/RootNavigator.tsx`, `mobile/src/navigation/types.ts` | `Premium` → totoong `PremiumScreen`; **bagong** `EventBooking` route → totoong `EventBookingScreen` (dati dead-end ang `navigate('EventBooking')`); 0 placeholder registration | `grep -n "PremiumScreen\|EventBookingScreen\|PhotoPreviewScreen\|PhotoEditorScreen\|StripLayoutScreen" RootNavigator.tsx` → 10 hits · `grep -rn "ModulePlaceholderScreen" src/navigation/` → **0** |
| **W2** | Kulang na runtime dependency | — | **CLOSED na sa v3** — `@react-native-community/slider`, `expo-asset`, `expo-clipboard`, `expo-gl`, `expo-linking`, `react-native-view-shot` ay nasa `package.json` | `cat mobile/package.json` (binasa lahat ng 6) |
| **W11** | Replicate API key sa mobile bundle | `mobile/.env.example` | Inalis ang `EXPO_PUBLIC_REPLICATE_API_KEY` (naka-comment + paliwanag na na-i-inline ito sa bundle). Idinagdag ang IAP env vars | `cat mobile/.env.example` |
| **— (bagong)** | `modules/monetization` ay **types-only** — walang `index.js`, kaya babagsak ang Metro sa directory import | `mobile/src/modules/monetization/index.js` **(bagong)**, `index.d.ts` | Nilikha ang runtime barrel (`export * from './src/monetization'`); dinagdagan ang `.d.ts` ng `isPremium`, `PremiumScreen`, `EventBookingScreen` | `ls mobile/src/modules/monetization/index.js` → existing · `tsc` → 0 error |
| **—** | `subscriptionService` mirror write sa server-owned `subscriptions` | `.../monetization/services/subscriptionService.js` | **Inalis** ang `writeSubscriptionRecord()` (`allow write: if false`) | `grep` → 0 aktwal na tawag |
| **—** | `res?.success` vs server's `{ verified }` — hindi kailanman nag-unlock ang Premium | `.../context/SubscriptionContext.jsx` | `res?.verified` sa purchase + restore; `restore()` → `{ok, receipts}`; platform mula sa adapter | Basahin ang file · `tsc` → 0 error |
| **—** | `isPremium` wala sa context value (laging `false` ang CTA) | `.../context/SubscriptionContext.jsx`, `.../index.d.ts` | Idinagdag ang derived `isPremium` sa context + deps | Basahin ang file |
| **—** | `onPress={restore}` nagpapasa ng press event bilang `platform` | `PremiumScreen.jsx`, `PaywallModal.jsx` | `onPress={() => restore()}` | Basahin ang 2 file |
| **—** | `createEventBooking` payload ay hindi tumutugma sa backend (kulang `eventId`+`slotId`) | `.../screens/EventBookingScreen.jsx` | Payload → `{ eventId, slotId, packageId, guestName, attendees, notes }`; tumatawag lang kapag may event+slot id; kung wala → mailto enquiry; `res.data?.success` | Backend: `callables/events.ts:102-121` (requiredString sa eventId/slotId) · `tsc` → 0 error |
| **—** | Walang test/typecheck gate sa mobile scripts | `mobile/package.json` | Idinagdag: `test`, `test:contract`, `expo:doctor` (`typecheck` ay umiiral na) | `cat mobile/package.json` |
| **—** (hindi mobile) | Webhook sa `us-central1` ay hindi nag-refresh ng claims ng client | `functions/src/syncClaims.ts` **(bagong, HINDI NAKA-WIRE)** | Cross-region bridge (`syncUserClaims` + `crossRegionClaimSync` HTTP) na may `REPLACE_*` placeholders | Nasa file ang lahat ng placeholder; **hindi** idinagdag sa `index.ts` para hindi aksidenteng ma-deploy |

---

## 🧪 TOTOONG OUTPUT NG VERIFICATION SA SANDBOX

Hindi pahayag — aktwal na tumakbo:

```
$ cd mobile && npm install --no-audit --no-fund --legacy-peer-deps
npm exit=0
added 1199 packages in 29s

$ npx tsc --noEmit
tsc exit=0
grep -c "error TS" tsc.log  →  0
```

```
$ grep -rn "setDoc\|addDoc\|writeBatch\|updateDoc\|deleteDoc" mobile/src
  (4 hits — lahat nasa komento/paliwanag, 0 aktwal na tawag)

$ grep -rn "getFunctions(firebaseApp)\|getFunctions()" mobile/src
  (4 hits — lahat nasa komento, 0 aktwal na tawag)

$ grep -hoE "'(bootstrapSession|getQuota|getMyPhotos|deleteMyPhoto|requestPhotoUpload|
     finalizePhotoUpload|reportUploadFailed|verifyPremiumPurchase|getMySubscription|
     cancelMySubscription|createEventBooking|validateReceipt)'" mobile/src | sort | uniq -c
   4 'requestPhotoUpload'      3 'getQuota'        2 'verifyPremiumPurchase'
   4 'reportUploadFailed'      3 'getMySubscription' 1 'createEventBooking'
   4 'finalizePhotoUpload'     3 'getMyPhotos'     1 'bootstrapSession'
   4 'deleteMyPhoto'           1 'cancelMySubscription'
   → 0 'validateReceipt'  ← walang ghost callable na natitira

$ grep -rn "ModulePlaceholderScreen" mobile/src/navigation/
  (1 hit — komento lang; 0 registration)
```

**Na-verify ko mismo:** na-read ang lahat ng changed file pagkatapos i-edit, tumakbo ang `tsc` na may
**0 error** sa loob ng naka-install na dependency tree, at ang bawat grep sa itaas ay galing sa
kasalukuyang nilalaman ng file. Hindi ito "inayos" na pahayag — output ito.

---

## ⚠️ ANO ANG KAILANGAN NG TOTOONG ENVIRONMENT (hindi na-verify dito)

| # | Hindi na-verify | Bakit | Gate |
|---|---|---|---|
| 1 | **Metro bundling** (`expo start` / `expo export`) | Hindi tumakbo ang Metro sa sandbox. **Ito ang susunod na pinakamalaking panganib pagkatapos ng region/callable fix** — dito lalabas ang F-4-type at barrel-type na sirang import. | Gate 1 |
| 2 | Signup laban sa **production** rules | Walang buhay na Firebase project. | Gate 2 |
| 3 | Region correctness sa totoong project (walang `functions/not-found`) | Kailangan ng deployed backend. | Gate 2 |
| 4 | Quota enforcement (5 free → ika-6 blocked) | Kailangan ng emulator o device. | Gate 2 |
| 5 | Premium verify (totoong + fake receipt) | Kailangan ng store sandbox + Apple/Google credentials. | Gate 3 |
| 6 | Camera single + 4-burst sa physical device | Kailangan ng device. | Gate 2 |
| 7 | Buong upload chain (request → PUT → finalize → gallery) | Kailangan ng Storage + emulator. | Gate 2 |
| 8 | `react-native-view-shot` sa Strip flow | Native module, device lang. | Gate 2 |
| 9 | Emulator rules tests (QA pack R-01…R-16) | Kailangan ng Java + firebase-tools. | Gate 2 |
| 10 | IAP end-to-end | **Hindi pa aktibo** — stub pa ang store adapter. | Gate 4 |

---

## 🔓 PAANO I-MERGE SA V4

```bash
# Kung buo ang package ang kailangan mo:
unzip photobooth-monorepo-final-v4.zip     # kapalit ng v3, pareho ang structure

# Kung patch lang (mas maliit, mas madaling i-review):
unzip photobooth-mobile-patch-v4.zip -d /tmp/patch-v4
cd /path/to/photobooth-monorepo && cp -r /tmp/patch-v4/mobile /tmp/patch-v4/docs /tmp/patch-v4/functions .
```

Pagkatapos i-merge, patakbuhin ang dalawang gate bago ideklarang "tapos":

```bash
cd mobile && npm install && npx tsc --noEmit     # GATE 1 — dapat 0 error
npx expo start                                    # GATE 2 — dapat walang Metro resolve error
```

---

## 📋 STATUS NG 5 BLOCKER SA AUDIT (para sa sign-off)

| # | Blocker | Status pagkatapos ng v4 |
|---|---|---|
| 1 | Mobile Navigator naka-mount sa placeholder | ✅ **NA-AYOS** (Premium + EventBooking ay totoo na; 0 placeholder sa navigator) |
| 2 | Kulang na runtime dependency | ✅ **CLOSED na sa v3** (na-verify na kumpleto) |
| 3 | Admin panel `VITE_` vs CI `REACT_APP_` | ⛔ **HINDI HINAWAKAN** — labas ng mobile scope (W3) |
| 4 | Admin identity model (`admins` vs `adminRoles`) | ⛔ **HINDI HINAWAKAN** — labas ng mobile scope (W4) |
| 5 | Walang automated test file | ⚠️ **BAHAGYANG** — may script gates na ngayon; ang QA pack (`functions/test/rules/*`, `mobile/__tests__/*`) ay hiwalay pang artifact na hindi pa nasasama sa monorepo |

**Verdict:** ⚠️ Sabihin pa rin nating **hindi pa final-final**, pero ang mobile-side na 2 P0 blocker (region + callable contract) at ang signup-vs-rules blocker (F-1) ay sarado na at may ebidensya. Ang natitirang pumipigil sa public store launch ay **hindi mobile**: ang #1 blocker sa kita (IAP live) at ang admin-side na W3/W4.
