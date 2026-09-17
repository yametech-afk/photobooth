# 📐 CONTRACTS.md — Master Shared Contracts C1–C7 + Drift Register + Merge Guidance

**Ito ang tanging mapagkukunan ng katotohanan** para sa mga contract na binabanggit ng
`docs/photobooth-master-assembly-plan.md` §3. Ang bawat value na nakasulat dito ay galing
sa aktwal na assembled code ng monorepo v3 (may nakalistang source file) — walang imbensyon.

| Contract | Sakop | File sa `shared/` |
|---|---|---|
| **C1** | Firebase config + env vars (lahat ng app) | [`env-contract.md`](./env-contract.md) |
| **C2** | Firestore schema (20 collections + indexes) | [`firestore-schema.md`](./firestore-schema.md) §1 |
| **C3** | Security rules contract (Firestore + Storage) | [`firestore-schema.md`](./firestore-schema.md) §2–§3 |
| **C4** | AI Filter Service contract + filter catalog | §C4 sa doc na ito + [`plan-constants.ts`](./plan-constants.ts) |
| **C5** | Analytics event catalog (canonical + legacy map) | [`analytics-events.ts`](./analytics-events.ts) |
| **C6** | Monetization (plans, prices, quotas, IAP products) | [`plan-constants.ts`](./plan-constants.ts) |
| **C7** | Design system tokens | §C7 sa doc na ito (canonical: `mobile/src/theme/tokens.ts`) |
| Routes | Navigation param lists (mobile) + admin route paths | [`routes.ts`](./routes.ts) |
| Data | Cloud Functions callable registry + upload protocol | [`callables.ts`](./callables.ts) |

---

## C4 — AI Filter Service contract

**Signature (mula sa master plan C4 at camera module):**
`processPhoto(photoUri, filterId) → Promise<string /* fileUri */>`

- **Catalog (canonical):** `mobile/src/modules/camera/filters/filterCatalog.ts` — 12 entries
  (`none`, `vintage`, `sketch`, `anime` libre; `cyberpunk`, `oil-painting`, `pop-art`,
  `watercolor`, `pixel-art`, `anime-pro`, `neon-glow`, `film-noir` premium). Nakasalamin sa
  `shared/plan-constants.ts → FILTER_CATALOG` at sa 10 seeded filters ng
  `scripts/seed.mjs` (dagdag ng backend: seasonal `christmas`).
- **Cloud path:** Replicate (Stable Diffusion img2img) — kailangan ng
  `EXPO_PUBLIC_REPLICATE_API_KEY` (mobile) / `REPLICATE_API_KEY` (functions). ⚠️ Bago ang
  public launch, ilipat sa likod ng Cloud Functions ang Replicate calls (tala mismo sa
  `mobile/.env.example`) para hindi ma-expose ang API key sa bundle.
- **Local fallback:** kapag walang key, GPU colour-grade presets ang tumatakbo
  (`renderer: 'gpu'` sa preview-editor `FILTER_PRESETS`) — instant, walang network. Ang
  `renderer: 'cloud'` presets ay AI filters na nagkakastatos ng credits at rine-render ng
  backend pipeline (`finalizePhotoUpload`).
- **Cost guard (Blocker B4):** i-cache ang result per (photo, filter); libreng tier limit
  5 captures/day; may progress UI; iwas per-image cost leak.

## C7 — Design system contract

**Canonical implementation:** `mobile/src/theme/tokens.ts`. Bawal ang hard-coded colors sa
kahit anong screen (mobile O admin). Mga value (bit-for-bit mula sa tokens.ts):

- **COLORS:** primary `#FF4DA6` · primaryDark `#E91E63` · secondary `#00BCD4` ·
  background `#0A0A1F` · surface `#1A1A2E` · card `#252544` · text `#FFFFFF` ·
  textSecondary `#B8B8D0` · success `#00E676` · warning `#FFD600` · error `#FF5252`
- **GRADIENT:** `['#FF4DA6', '#7B61FF', '#00BCD4']`
- **SPACING:** xs 4 · sm 8 · md 16 · lg 24 · xl 32 · xxl 48 — **RADIUS:** sm 8 · md 12 · lg 20 · xl 28 · round 9999
- **Fonts:** Poppins family — heading 28/Bold · subheading 20/SemiBold · body 16/Regular · caption 12/Regular
- **Shared components:** GradientButton, FilterPicker, PhotoStrip (mobile `components/ui/`)

Hindi ginawang hiwalay na file ang C7 dito dahil ang `mobile/src/theme/tokens.ts` na ang
canonical — ang pagdu-doble dito ay maglikha ng bagong drift. Ang admin panel (CSS) at
marketing assets ay dapat mag-mirror ng mga value sa itaas.

---

# ⚠️ Drift Register — mga natukoy na pagkakaiba (ayusin bago mag-prod)

Natukoy mula sa QA pack (`02-INTEGRATION-MATRIX.md`, `06-STATIC-FINDINGS.md`) at sariling
grep. **Hindi ko binago ang mga source file** (limitasyon ng gawaing ito: shared/docs lang) —
nakalista dito ang eksaktong aayahin.

| ID | Drift | Ebidensya | Aayusin paano |
|---|---|---|---|
| **D1** | `mobile/src/services/functions.ts` ay tumatawag ng callable **`uploadPhoto`** na **WALA sa backend** (legacy base64 upload) | `mobile/src/services/functions.ts:33` vs export list ng `functions/src/callables/*`; QA matrix A2 ❌ | Palitan ang caller ng 3-step protocol: `requestPhotoUpload` → HTTP PUT → `finalizePhotoUpload` (tingnan `shared/callables.ts`); o gamitin ang `legacyUploadPhoto()` shim ng preview-editor bilang pansamantalang tulay |
| **D2** | Mobile core ay tumatawag ng **`activatePremium`** — ang backend ay **`verifyPremiumPurchase`** | `mobile/src/services/functions.ts:42` vs `functions/src/callables/subscriptions.ts`; QA matrix A3 ❌ | I-re-point ang wrapper sa `verifyPremiumPurchase` (shape sa `shared/callables.ts`) |
| **D3** | Mobile core `getFunctions(firebaseApp)` — **walang region pin** → default `us-central1`, pero ang backend ay naka-deploy sa `asia-southeast1` → "function not found" sa runtime | `mobile/src/services/functions.ts:9`; QA matrix A4 ❌ at `functionsContract.test.js` | `getFunctions(firebaseApp, FUNCTIONS_REGION)` gamit ang `shared/plan-constants.ts → FUNCTIONS_REGION` |
| **D4** | Mobile `USAGE_LIMITS.premium.maxFileSizeMB: 20` vs backend `LIMITS.maxUploadBytes` = **10 MB sa lahat** | `mobile/.../config/plans.js` vs `functions/src/config/constants.ts` | Sundin ang backend (10 MB) — na-sync na ang `shared/plan-constants.ts → USAGE_LIMITS` sa 10 |
| **D5** | Dalawang magkaibang B2B package set: mobile hardcoded `EVENT_PACKAGES` (₱8K/₱15K/₱30K, peso units) vs backend seeded `packages/` (₱4,990/₱12,990/₱24,990, centavos, may photosIncluded/printsIncluded) | `mobile/.../config/plans.js` vs `scripts/seed.mjs` | Ang `packages/` collection + `getPackages` callable ang canonical runtime. Ang mobile `EVENT_PACKAGES_MOBILE_LEGACY` ay ipinangalang "legacy" sa `shared/plan-constants.ts` — i-re-point ang `EventBookingScreen` sa `getPackages()` |
| **D-doc** | Root `README.md` at master plan ay nakasulat pang `REACT_APP_*` para sa admin panel, pero ang aktwal na admin code ay **Vite** → `VITE_*` ang tama | `admin-panel/src/services/firebase.js` (`import.meta.env.VITE_*`) vs `README.md` env table | Sundan ang matrix sa `shared/env-contract.md`; i-update ang README sa susunod na commit |
| **D-ver** | Mobile core ay **Expo 50 / RN 0.73** — lumang SDK; ang master plan (Blocker B2) ay nagsasara ng **Expo SDK 57 / RN 0.86** bago mag-launch | `mobile/package.json`; master plan §6 B2 | I-upgrade bago ang M8 (store submission) — hindi posibleng gawin docs-only sa pack na ito |
| **D-b7** | `makePublic()` ay may **2 sadyang** tawag sa `photoService.ts` — sa `public/photos/` mirror lang (share-page flow), hindi sa private paths | `functions/src/services/photoService.ts:263, 430` | Dokumentado sa `shared/firestore-schema.md` §makePublic audit. Desisyon ng tao: panatilihin (may share-page flow) o palitan ng signed URLs/download tokens bago mag-prod |

---

# 🔀 Merge Guidance — paano ito gamitin ng bawat workspace

## 1) Mobile (`mobile/`)

- **Re-point (D1–D3):** palitan ang laman ng `mobile/src/services/functions.ts` ng mga wrapper
  na sumusunod sa `shared/callables.ts` (region-pinned, tamang callable names). Ito ang
  pinakamataas na priority — broken contract sa runtime ang tatlong ito.
- **Constants:** gawing thin re-export ang
  `mobile/src/modules/monetization/src/monetization/config/plans.js` at ang
  `PREMIUM_FILTER_IDS` sa `preview-editor/constants.ts` papunta sa
  `shared/plan-constants.ts` (panatilihin ang mga lumang deep-import paths para hindi mabali
  ang `plans.test.js` ng QA pack).
- **Routes:** ang `shared/routes.ts` ay superset ng `mobile/src/navigation/types.ts` —
  pareho ang laman; gamitin ang `mobile/` file bilang import source sa app, ang `shared/`
  bilang reference sa code review.
- **Paano mag-import:** kopyahin ang `shared/*.ts` papunta sa
  `mobile/src/shared/` (o tsconfig path alias `@shared/*`) — walang runtime dependency sa
  Firebase, puro types + constants, kaya walang bagong package na kailangan.

## 2) Admin panel (`admin-panel/`)

- **Env:** gamitin ang `VITE_*` names (hindi `REACT_APP_*`) — tingnan `shared/env-contract.md`.
- **Collections:** ang dataAdapter ay gumagamit ng `users`, `photos`, `filters`, `events`,
  `bookings`, `subscriptions`, `notifications` — tugma sa `shared/firestore-schema.md` §1.
  ⚠️ Huwag gumawa ng client-side plan toggle na sumusulat sa `users.plan` — **bawal sa rules**
  (C3 §1); dapat `adminSetUserPlan` callable ang gamitin.
- **Revenue:** i-source sa `subscriptions` collection gamit ang `REVENUE_STATUSES`
  (`active`, `in_grace_period`, `cancelled`) — huwag random placeholders (Blocker B8).
- **Port ng shared constants:** TS types ay tanggalin lang (JS) o gamitin ang JSDoc — puro
  primitive values ang laman, walang framework dependency.

## 3) Backend (`functions/`)

- Ang `functions/src/config/constants.ts` ay **nananatiling authoritative runtime** — ang
  `shared/plan-constants.ts` ay mirror nito para kita ng mobile/admin ang parehong numbers
  sa iisang diff. Magdagdag ng parity test (ihambing ang dalawang file) sa `pr-checks.yml`
  para hindi sila magkalayo.
- Bago i-deploy: i-verify ang mga D-item sa itaas, lalo na D1/D2 (walang legacy callable na
  tinatawag na wala sa backend).

## 4) Mga file na ide-delete / ise-adopt pagkatapos ng migration

| File/Folder | Aksyon | Dahilan |
|---|---|---|
| `docs/source-artifacts/monetization-cloud/` | I-delete pagkatapos i-port ang kailangan (quota assert, receipt validation) sa `functions/` | Duplicate functionality ng main backend — desisyon sa `MERGE_NOTES.md` §3.3 |
| `admin-panel/build/` | I-delete, i-rebuild (`npm run build`) | Prebuilt artifact mula sa source zip — luma agad kapag may code change |
| `admin-panel/firestore.rules`, `admin-panel/storage.rules` | I-delete (root copies ang canonical) | Duplicate ng root rules — risk ng magkaibang security sa deploy |
| `devops/` (workflows, docs, eas config) | **I-adopt**: kopyahin ang `.github/workflows/` papunta sa root `.github/`, i-review ang 3-environment setup ng `devops/firebase.json` laban sa root | Reference tree lamang ngayon — `MERGE_NOTES.md` §3.1 |
| `devops/firestore.rules` vs root `firestore.rules` | I-compare bago i-deploy (mas may custom-claim hardening ang DevOps variant; mas maraming collection coverage ang backend) | `MERGE_NOTES.md` §2.2 — kailangan ng tao ang pagsasama |

## 5) Mga order ng merge (M0 context)

Ang `shared/` na ito ang **M0 milestone** ng merge order ng master plan (§4): shared
contracts muna bago ang core flow (M1–M3), admin (M4), premium (M5), analytics (M6),
QA regression (M7), release (M8).

## 6) Verification commands (kasama ang QA pack)

```bash
# typecheck ng mobile pagkatapos ng re-pointing
npm run mobile:typecheck

# QA pack tests (i-copy ang mobile/__tests__ sa loob ng mobile/)
#  - contract/functionsContract.test.js → naghahatid ng D1/D2/D3
#  - monetization/plans.test.js         → naghahatid ng filter parity (P1-2) + UTC quota
npx jest contract plans

# backend build + rules/indexes validation
npm run functions:build
python3 devops/scripts/validate.py

# preflight: walang natitirang placeholder bago mag-deploy
grep -rn "REPLACE" . --include="*.*" -l | grep -v node_modules
```
