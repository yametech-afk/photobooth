# 🧰 Photobooth DevOps Patch v4 — download, overlay, verify

**Scope:** DevOps / CI-CD only. No app, feature, or backend logic was modified.

**Base:** `photobooth-monorepo-final-v3.zip` (198 files)
**Inputs read:** the v3 monorepo, the QA pack (`photobooth-qa-pack.zip`), and
`Photobooth-Final-Readiness-Audit.docx`.
**Addresses:** audit **W5 (BLOCKER)** — CI not merged to root + wrong bundle scan path —
plus the DevOps halves of **W3** (env prefix) and **W8** (test scripts / rules testing).

---

## Apply

```bash
unzip -o photobooth-devops-patch-v4.zip -d /path/to/photobooth-monorepo
cd /path/to/photobooth-monorepo
rm -rf devops/.github                  # superseded by the root workflows
python3 devops/scripts/validate.py     # expect: ALL CHECKS PASSED (with warnings)
```

The archive is a **path-preserving overlay**: it drops files into the same relative
locations they occupy in the repo, so `unzip -o` is safe and nothing already in the
repo is silently relocated. Two `package.json` files are shipped in full (not diffed) —
they are the complete, patched versions.

## Contents

| Path | Action |
|---|---|
| `.github/workflows/pr-checks.yml` | NEW — root CI: config validation, rules tests on the emulator, mobile typecheck+test, admin build + env/bundle guards, functions build+test, summary |
| `.github/workflows/admin-preview.yml` | NEW — per-PR Hosting preview channel (staging project, 7-day expiry) |
| `.github/workflows/deploy-staging.yml` | NEW — push to `develop`: rules/indexes/storage → functions → `/healthz` smoke → panel → EAS internal build |
| `.github/workflows/release-production.yml` | NEW — tag → approval gate → prod backend → panel (prod-identity check) → EAS build + store submit |
| `.github/workflows/mobile-eas-build.yml` | NEW — manual EAS build / OTA update runner |
| `functions/package.json` | REPLACE — adds `lint` (required by firebase.json predeploy), `test`, `test:unit`, `test:rules`, `test:rules:ci`, and the rules-test devDependencies |
| `functions/test/jest.config.rules.js` | NEW — ts-jest config for the rules suites |
| `functions/test/tsconfig.rules.json` | NEW — self-contained; cannot disturb the production functions build |
| `functions/test/rules/firestore.rules.test.ts` | NEW — 18 assertions against the ROOT `firestore.rules` |
| `functions/test/rules/storage.rules.test.ts` | NEW — 6 assertions against the ROOT `storage.rules` |
| `mobile/package.json` | REPLACE — adds `test` / `test:ci` scripts + jest-expo devDependencies |
| `mobile/jest.config.js` | NEW — jest-expo preset, E2E excluded |
| `devops/scripts/validate.py` | REPLACE — v3 checks preserved and extended with 12 cross-file checks |
| `devops/admin-panel/.env.example` | REPLACE — `REACT_APP_*` → `VITE_*` |
| `.firebaserc` | REPLACE — adds the `hosting` targets (`admin` -> `photobooth-admin-{dev,staging,prod}`) and defaults to `photobooth-app-dev`. Without a target, `firebase deploy --only hosting:admin` fails. |
| `.firebase.json` | REPLACE — the `hosting` block gained `"target": "admin"`. Every workflow deploys with `--only hosting:admin` / `target: admin`; without the target declared in `firebase.json`, that deploy fails even though `.firebaserc` maps it. |
| `devops/README.md` | REPLACE — original content preserved, v4 section appended |
| `devops/docs/MERGE-READY.md` · `RULES-PARITY.md` · `CI-CHANGELOG-v4.md` | NEW — merge steps, rules decision record, per-file changelog |

**Deliberately excluded:** `devops/.github/workflows/**` (superseded — delete the folder).

## Verified here vs. not verified here

**Verified in the assembly sandbox (static, no cloud project needed):** every workflow and
config file parses; `devops/scripts/validate.py` v4 passes; every `npm run <script>` invoked by a
workflow resolves to a real script in the right `package.json`; the admin env prefix, Vite output
path, functions codebase name and `/healthz` path all line up across CI and the repo; no
`REACT_APP_*`, no `build/static/js`, no `functions:default`, no leaked secret.

**NOT verified here (needs a live environment):** the 24 rules assertions have never been
executed — they need Java 17 + `firebase-tools` and `cd functions && npm run test:rules`. The
Expo/RN dependency install, mobile `tsc --noEmit`, `eas build`, and any real `firebase deploy`
were not run. Treat the first local emulator run and first staging deploy as the proof.

## Still needs secrets / live environment (not a patch defect)

Deploy service accounts, `EXPO_TOKEN`, Firebase API keys, the three real Firebase projects,
hosting targets in `.firebaserc`, the `production` GitHub Environment with required reviewers,
store credentials, and the Cloud Functions secrets (`REPLICATE_API_TOKEN`, Stripe). Full list in
`devops/docs/MERGE-READY.md` §3.

## Out of scope (app / backend ownership, untouched)

W1 (module screens not mounted), W6 (`makePublic()` in `photoService.ts`), W7 (IAP adapter +
receipt verification), W4/W12 (admin identity model inside `admin-panel/**` and the callables),
W9 (which rules copy wins — recorded, not decided), W13 (`shared/` contracts), B2 (Expo SDK
upgrade). Details and owners in `devops/docs/MERGE-READY.md` §3 step 4.
