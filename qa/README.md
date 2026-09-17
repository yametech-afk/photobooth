# 🧪 Photobooth QA Pack

QA deliverables para sa **photobooth-monorepo-final-v2** (Sep 17, 2026 assembly — mobile
core + camera + preview-editor + monetization + backend + admin panel + devops).
Bawat dokumento ay tumutukoy sa totoong file paths sa monorepo — hindi template.

```
photobooth-qa/
├── docs/qa/
│   ├── 01-TEST-PLAN.md            # P0–P2 prioritized plan (bawat item may totoong file)
│   ├── 02-INTEGRATION-MATRIX.md   # module hand-offs: tugma/sira + ebidensya
│   ├── 03-REGRESSION-CHECKLIST.md # pre-release checklist [E]/[D]/[W]/[M]
│   ├── 04-RELEASE-GATES.md        # Gate 0–4 na may thresholds
│   ├── 05-EMULATOR-STRATEGY.md    # L1/L2/L3 + Firebase Emulator Suite setup
│   └── 06-STATIC-FINDINGS.md      # 12 verified findings (F-1…F-12) mula sa aktwal na code
├── functions/test/
│   ├── jest.config.rules.js       # jest config (ts-jest) para sa rules tests
│   ├── .0-functions-package-additions.json  # snippet: test:rules script + devDeps
│   └── rules/
│       ├── firestore.rules.test.ts  # 16 rules tests (R-01…R-16, kasama ang F-1 regression)
│       └── storage.rules.test.ts    # 6 storage tests (size/MIME/path scoping)
├── mobile/__tests__/
│   ├── monetization/plans.test.js        # quota logic + filter parity (P0-5, P1-2) ✅ synthetic-run
│   ├── camera/cameraHooks.test.js        # permission + burst-cancel (RNTL scaffold)
│   └── contract/functionsContract.test.js # callable name + region contract (static, node-only)
└── mobile/e2e/happyPath.e2e.js    # Detox E2E scaffold (untested — kailangan ng device)
```

## Pagtakbo (buod)

```bash
# L1 — pure logic + static contract (Node lang; ang contract test ay nagbabasa ng source)
cd mobile && npm i && npx jest __tests__/monetization __tests__/contract

# L2 — rules + backend (Emulator Suite; tingnan 05-EMULATOR-STRATEGY.md)
cd functions && npm i
#   1. Idagdag ang scripts/devDeps mula sa .0-functions-package-additions.json
#   2. I-copy ang test/ folder sa functions/
npm run test:rules            # 22 rules tests sa emulator
npm run smoke-test            # 15-hakbang E2E sa emulator (repo root: bash scripts/smoke-test.sh)

# L3 — device (Gate 2)
cd mobile && detox build -c android.emu.debug && detox test -c android.emu.debug
```

## Bilang ng test cases

| Suite | Bilang | Uri | Estado ngayon |
|---|---|---|---|
| firestore.rules.test.ts | 16 (R-01…R-16) | Rules (emulator) | scaffold — i-run sa emulator |
| storage.rules.test.ts | 6 (S-01…S-06) | Rules (emulator) | scaffold — i-run sa emulator |
| plans.test.js | 10 | Jest pure logic | ✅ na-synthetic-run sa sandbox (assertions tumatakbo) |
| functionsContract.test.js | 3 blocks | Static contract (node) | ✅ na-synthetic-run sa sandbox |
| cameraHooks.test.js | 3 | RNTL | scaffold — untested |
| happyPath.e2e.js | 6 | Detox E2E | scaffold — untested |
| scripts/smoke-test.sh (nasa repo) | 15 | Emulator E2E | nasa repo na, verified syntax (`bash -n`) |

## Verified vs. kailangan ng totoong environment

**Na-verify sa sandbox ngayon (walang Firebase project na kailangan):**
- Monorepo structure: 196 files, lahat ng path na tinutukoy ng docs ay naka-check
- `plans.test.js` logic assertions (quota UTC keys, entitlements, parity) — synthetic run ✅
- `functionsContract.test.js` — napatunayan: `mobile/src/services/functions.ts` kulang sa
  region pin + may `uploadPhoto`/`activatePremium` names na **wala** sa backend (F-2, F-3)
- `bash -n scripts/smoke-test.sh` — syntax OK
- `python3 devops/scripts/validate.py` — ALL CHECKS PASSED (naka-take ng repo validator)
- Storage/Firestore rules — binasa at na-map sa test cases

**Kailangan ng totoong environment (hindi ma-verify dito):**
- Emulator suite runs (Java + firebase-tools), device builds, Detox, IAP sandbox,
  anumang `[D]`/`[W]` item sa 03-REGRESSION-CHECKLIST.md
