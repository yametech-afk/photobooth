# 🧯 Emulator & Backend Test Strategy

Layunin: 90% ng P0/P1 backend tests ay tumatakbo **nang walang totoong Firebase project** —
sa Emulator Suite na naka-configure na sa root `firebase.json` (ports: auth 9099, functions 5001,
firestore 8080, storage 9199, hosting 5000, pubsub 8085, UI 4000).

---

## 1. Tatlong antas ng pagsubok

| Antas | Ano ang tumatakbo | Kailangan | Kailan |
|---|---|---|---|
| **L1 — Pure logic** | Jest unit sa monetization logic (`usageLimits`, `entitlements`, `plans`, catalog parity), quota math | Node lang | Bawat PR (Gate 0) |
| **L2 — Emulator suite** | Rules tests (firestore+storage), callable tests, smoke-test.sh, seed | `firebase-tools` + Java (emulators) | Gate 1 |
| **L3 — Device/E2E** | Detox + totoong camera/IAP/push, perf | Dev client build + device | Gate 2 |

## 2. Setup (isang beses)

```bash
# sa repo root
npm install                      # workspaces: mobile, admin-panel, functions
npm i -g firebase-tools          # emulator suite
cd functions && npm i -D jest ts-jest @types/jest @firebase/rules-unit-testing@^3 firebase@^10
```

Idagdag sa `functions/package.json` (scripts):
```json
"test:rules": "firebase emulators:exec --only firestore,storage,auth --project photobooth-app-dev -- jest -c test/jest.config.rules.js --runInBand"
```
> Ito ang hinahanap ng `devops/.github/workflows/pr-checks.yml` (`npm run test:rules`) — kasalukuyang wala, kaya magfe-fail ang CI nang walang QA pack na ito.

## 3. Pagtakbo

```bash
# Terminal 1 — emulators (walang totoong project na nahahawakan)
npm run emulators                # root script; UI sa http://localhost:4000

# Terminal 2 — seed + smoke (15 hakbang, nasa repo na)
npm run seed                     # scripts/seed.mjs — config, 10 filters, 3 packages, superadmin
npm run smoke-test               # scripts/smoke-test.sh — bootstrap/quota/idempotency/rate-limit/admin

# Rules + callable tests (isang command, pinapatay nito ang sariling emulators)
cd functions && npm run test:rules
```

## 4. Mobile laban sa emulators (Expo dev)

```ts
// mobile/src/dev/emulator.ts — tawagin mula sa App.tsx kapag __DEV__ && EXPO_PUBLIC_USE_EMULATORS
import { connectAuthEmulator } from 'firebase/auth';
import { connectFirestoreEmulator } from 'firebase/firestore';
import { connectStorageEmulator } from 'firebase/storage';
import { connectFunctionsEmulator } from 'firebase/functions';
import { auth, db, storage, firebaseApp } from '../services/firebase';

export function connectEmulators() {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  // ✅ Pinal ang region — tugma sa REGION sa functions/src/config/constants.ts
  connectFunctionsEmulator(getFunctions(firebaseApp, 'asia-southeast1'), '127.0.0.1', 5001);
}
```
`connectFunctionsEmulator` ay **bago** ang unang tawag — dumaan sa `uploadHandoff` na
injectable `getFunctions` (dinisenyo para dito, tingnan `mobile/src/modules/camera/services/uploadHandoff.ts`).

Android emulator: gamitin ang `10.0.2.2` imbes na `127.0.0.1`.

## 5. Rules tests (laman ng `functions/test/rules/`)

- **Firestore** (`firestore.rules.test.ts`): bawat `match` block sa root `firestore.rules` ay may
  allow + deny case — users create (deny sa client), cosmetic-only update, quotas/ledger write deny,
  photos public/owner read + write deny, subscriptions write deny, adminRoles write deny,
  admin = claim **AT** active `adminRoles` doc (stale claim → deny), default-deny catch-all.
- **Storage** (`storage.rules.test.ts`): ≤10MB image OK sa sariling path; 11MB deny; `application/pdf`
  sa photos deny; path ng ibang user deny; `public/photos/*` client write deny (functions only).
- Data isolation: bawat test project ay may sariling `projectId` (hindi shared state).

## 6. CI integration

- `pr-checks.yml` (devops) → `test:rules` + mobile jest — handa na kapag na-copy ang QA pack files.
- `firebase emulators:exec` ang wrapper (start → test → auto-shutdown), hindi `emulators:start`.
- Artifacts: `firebase-debug.log` upload sa bisita (ginawa na sa `deploy-staging.yml`).

## 7. Data lifecycle

```bash
firebase emulators:export --export-on-exit ./seed-data     # hulihin ang magandang state
firebase emulators:start --import=./seed-data              # i-replay sa susunod na session
```
Huwag i-commit ang `seed-data/` na may totoong user data (demo/fake accounts lang).
