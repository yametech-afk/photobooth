# 📋 CI/CD Changelog — v4 (DevOps-side fixes only)

Ang changelog na ito ay sumasagot sa bawat DevOps-side finding ng readiness
audit. Walang app/feature code na binago.

---

## Root cause na sinasagot: W5 (BLOCKER) — "CI hindi naka-merge sa root + maling scan path"

| # | Pagbabago | File | Ano ang naayos |
|---|---|---|---|
| 1 | **5 workflows sa root** `.github/workflows/` | `pr-checks.yml`, `admin-preview.yml`, `deploy-staging.yml`, `release-production.yml`, `mobile-eas-build.yml` | Dating nasa `devops/.github/workflows/` lang — hindi tumatakbo sa repo. Ngayon root-level na at ready to merge. |
| 2 | **Lahat ng path root-relative** | lahat ng workflow | `working-directory: functions`, `mobile`, `admin-panel` (dati `../functions` dahil nasa devops/ ang file). `devops/scripts/validate.py` sa root. |
| 3 | **Vite build path** sa secret scan | `pr-checks.yml` | `build/static/js` (CRA) → **`admin-panel/build/assets`** (tunay na Vite output). May hiwalay na step na nagve-verify na tugma ang `firebase.json hosting.public` sa Vite `build.outDir`. |
| 4 | **Point-of-no-return check** | `release-production.yml` | Dati `grep admin-panel/build/static/js/` (laging walang mahanap → palaging fail o false-pass). Ngayon `build/assets/`, at may **dagdag na negative check**: kung may `photobooth-app-staging` sa prod bundle, hihinto ang deploy. |
| 5 | **Health endpoint** | `deploy-staging.yml`, `release-production.yml` | `/health` → **`/healthz`** (ang tunay na export sa `functions/src/http/endpoints.ts:31`). Dating 404 ang smoke test kahit matagumpay ang deploy. |
| 6 | **Functions codebase** | `deploy-staging.yml`, `release-production.yml` | `functions:default` → **`functions:photobooth-core`**, tugma sa root `firebase.json`. |
| 7 | **`ci-summary` job** | `pr-checks.yml` | Isang tingin lang ang resulta ng 5 jobs, nasa Step Summary. |

## Env naming consistency (W3 - BLOCKER)

| # | Pagbabago | File |
|---|---|---|
| 8 | `REACT_APP_*` → **`VITE_*`** sa buong admin build env (staging, prod, preview) | `pr-checks.yml`, `admin-preview.yml`, `deploy-staging.yml`, `release-production.yml` |
| 9 | Bagong **env-prefix guard**: binabasa ang prefix mula mismo sa `src/services/firebase.js`, tapos fail kung may `REACT_APP_` sa `src/` o `.env.example` | `pr-checks.yml` |
| 10 | Ang devops env template ay naayos na rin (dati `REACT_APP_*` → **demo mode** sa production) | `devops/admin-panel/.env.example` |
| 11 | Ang env-prefix drift ay static check na sa validator | `devops/scripts/validate.py` |

## Test script expectations (W8 - BLOCKER, DevOps side)

| # | Pagbabago | File |
|---|---|---|
| 12 | **Firestore rules suite** — 18 assertions (default-deny, users create/cosmetic/plan/credits, quota+ledger, subscriptions, adminRoles, auditLogs/analytics, photos public/owner, **stale claim → deny**, **revoked role → deny**, active claim+doc → allow) | `functions/test/rules/firestore.rules.test.ts` |
| 13 | **Storage rules suite** — 6 assertions (200KB OK, 11MB deny, MIME deny, other-user path deny, anon read deny, `public/photos/*` client write deny) | `functions/test/rules/storage.rules.test.ts` |
| 14 | Jest config (ts-jest) + **self-contained** `tsconfig.rules.json` (hindi hina-hawakan ang production `functions/tsconfig.json`) | `functions/test/jest.config.rules.js`, `functions/test/tsconfig.rules.json` |
| 15 | **`test:rules`** na naka-wrap sa `firebase emulators:exec --only firestore,storage,auth` + `test` / `test:unit` (rules excluded) | `functions/package.json` |
| 16 | **`lint`** script na idinagdag sa functions — kailangan ito ng `firebase.json` `predeploy` (`npm run lint`), kung wala ay **mabibigo ang `firebase deploy --only functions`** | `functions/package.json` |
| 17 | **`test` / `test:ci`** scripts + jest devDeps sa mobile (`jest-expo`) | `mobile/package.json`, `mobile/jest.config.js` |
| 18 | Java 17 setup step sa rules job — kung wala, hindi umiiral ang Firestore emulator at lahat ng rules test ay timeout | `pr-checks.yml` |
| 19 | Harness-presence guard: fail agad kung kulang ang `functions/test/**` imbes na magbigay ng malabo na "no tests found" | `pr-checks.yml` |
| 20 | Emulator log artifact (`firebase-debug.log`, `firestore-debug.log`) kapag fail | `pr-checks.yml` |

## Lockfile / robustness

| # | Pagbabago | File |
|---|---|---|
| 21 | `npm ci` → **conditional**: `npm ci` kung may `package-lock.json`, kung wala `npm install`. Ang `mobile/` ay **walang lockfile** sa assembled tree, kaya `npm ci` ay hard-fail noon. | lahat ng workflow |
| 22 | Step-level guards para sa `lint`/`test`/`typecheck` — hindi na kailangang umasa sa `--if-present` | lahat ng workflow |
| 23 | `fetch-depth: 0` + ancestry check bago ang production release (tag dapat ancestor ng `main`) | `release-production.yml` |
| 24 | **`REPLACE_WITH_*` / `REPLACE_ME` placeholder scan** bago ang prod deploy | `release-production.yml` |
| 25 | Ang mobile release ay **nag-a-assert** (hindi na nagmu-mutate ng `package.json` mid-CI) na tugma ang `app.json` `expo.version` sa tag, dahil `appVersionSource: remote` na ang EAS | `release-production.yml` |

## Validator (v3 → v4)

| # | Bagong check sa `devops/scripts/validate.py` |
|---|---|
| 26 | Workflow location: root `.github/workflows` dapat umiiral; warning kung nariyan pa ang `devops/.github/workflows` |
| 27 | Bawat `npm run <script>` na tinatawag ng workflow ay dapat umiiral sa `package.json` ng tamang `working-directory` (kasama ang job-level `defaults`) |
| 28 | `npm test` na walang test script sa target package → error |
| 29 | `firebase.json hosting.public` == Vite `build.outDir` |
| 30 | Walang `build/static/js` reference sa workflows |
| 31 | Walang `REACT_APP_` sa workflows; env prefix ng source == env template |
| 32 | `functions:<codebase>` sa workflows vs `firebase.json` |
| 33 | Ang bawat `predeploy` script ng functions ay may tugmang script sa `functions/package.json` |
| 34 | `/healthz` (hindi `/health`) ang tinatawag ng smoke tests |
| 35 | Kapag may `test:rules` sa workflow, dapat kumpleto ang harness files |
| 36 | Warning kapag walang `targets` sa `.firebaserc` (kailangan ng `--only hosting:<target>`) |
| 37 | Warning kapag walang `target` sa `firebase.json` hosting |


## Root Firebase config

| # | Pagbabago | File |
|---|---|---|
| 39 | Ang root `firebase.json` hosting block ay may `"target": "admin"` na (tugma sa `.firebaserc` targets at sa `--only hosting:$HOSTING_TARGET` ng lahat ng workflow). Kung wala ang target sa `firebase.json`, **mabibigo** ang `firebase deploy --only hosting:admin`. | `firebase.json` |
| 38 | Ang root `.firebaserc` ay nakuha na ang hosting `targets` (`admin` -> `photobooth-admin-dev/staging/prod`) at `default` = `photobooth-app-dev`. Kapag `{}` ang `targets`, ang `firebase deploy --only hosting:admin` sa lahat ng workflow ay **mabibigo**. Ginamit ang DevOps pack na `.firebaserc` (may tatlong alias + targets) imbes na ang root na may `targets: {}`. | `.firebaserc` |

## Sinadyang HINDI binago

- Ang lahat ng `devops/docs/*.md` (ENVIRONMENTS, SECRETS, MONITORING, ROLLBACK, RELEASE-RUNBOOK, PRODUCTION-CHECKLIST) — **preserved**.
- Ang nilalaman ng `firestore.rules` / `storage.rules` (root man o devops copy) — desisyon ng backend, tingnan `RULES-PARITY.md`.
- Ang `admin-panel/**` source, `functions/src/**`, `mobile/src/**` — walang binago.
- Ang `devops/.github/workflows/` — hindi kasama sa patch (superseded).
- Ang QA pack's mobile jest suites (`plans.test.js`, `functionsContract.test.js`, `cameraHooks.test.js`) at Detox E2E — hindi kinopya, **QA-owned**. Bago maidagdag sa CI kailangan ayusin ang import path: ang `plans.test.js` ay umi-import ng `../src/modules/monetization/...` pero mula sa `mobile/__tests__/monetization/` ang tama ay `../../src/modules/monetization/src/monetization/...` (dalawang antas pataas). Kung hindi, `npm test` ay fail sa path na wala.

## Ano ang napatunayan at ano ang hindi

**Napatunayan dito (static, walang cloud project):**
- Pumapasa ang `devops/scripts/validate.py` v4 (JSON + YAML parse, cross-file
  references, walang leaked secret, walang `REACT_APP_*`, walang
  `build/static/js`, walang `functions:default`, walang `/health` probe).
- Bawat `npm run <script>` na tinatawag ng 5 workflow ay may tugmang script.
- Umiiral ang bawat path na binabanggit ng workflows at ng validator sa
  assembled repo tree.

**Hindi napatunayan dito (kailangan ng live environment):**
- Ang 18 Firestore + 6 Storage rules assertions ay **hindi pa naipatakbo** —
  kailangan ng Java 17 + `firebase-tools` emulator suite.
- Ang `npm install` ng Expo/RN dependency tree, `tsc --noEmit` ng mobile,
  at anumang `eas build` — hindi tumakbo dito.
- Ang tunay na `firebase deploy`, approval gate, at store submission.
