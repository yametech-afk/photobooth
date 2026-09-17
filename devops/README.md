# Photobooth Platform — DevOps / Release Pack

Everything needed to take the React Native app + React admin panel + Firebase backend from a
laptop to a controlled production release path.

```
photobooth-devops/
├── .firebaserc                     # 3-project alias map (dev / staging / production)
├── firebase.json                   # rules, indexes, functions, hosting target, emulators
├── firestore.rules                 # hardened, admin via custom claims
├── firestore.indexes.json          # composite indexes for the app's real queries
├── storage.rules                   # photo library, event gallery, public assets
├── mobile/
│   ├── eas.json                    # development / staging / production build + submit profiles
│   ├── app.config.js               # per-environment identity (bundle id, channel, project)
│   └── .env.example
├── admin-panel/.env.example
├── functions/.env.example
├── .github/workflows/              # ⚠️ v4: MERGED TO THE REPOSITORY ROOT — see below
│   ├── pr-checks.yml               # lint, tests, config validation, rules tests via emulators
│   ├── admin-preview.yml           # per-PR Hosting preview channel
│   ├── deploy-staging.yml          # push to develop -> staging backend + panel + EAS build
│   ├── release-production.yml      # tag -> approval gate -> prod backend, panel, stores
│   └── mobile-eas-build.yml        # manual build / OTA update runner
├── docs/
│   ├── ENVIRONMENTS.md             # environment matrix + local loop + promotion path
│   ├── SECRETS.md                  # secret inventory, least privilege, App Check rollout
│   ├── MONITORING.md               # alerts, SLOs, dashboards, cost guardrails
│   ├── ROLLBACK.md                 # per-surface rollback with RTOs and decision tree
│   ├── RELEASE-RUNBOOK.md          # branch model, standard release, hotfix, Fastlane fallback
│   ├── PRODUCTION-CHECKLIST.md     # 9-section launch checklist
│   ├── MERGE-READY.md              # 🆕 v4: exactly what to merge, what still needs secrets
│   ├── RULES-PARITY.md             # 🆕 v4: the 3-rules-copies decision (audit W9)
│   └── CI-CHANGELOG-v4.md          # 🆕 v4: per-file changelog of the DevOps fixes
└── scripts/validate.py             # JSON/YAML + leaked-secret preflight (runs in CI)
```

## Before the first deploy — replace these placeholders

```bash
grep -rn "REPLACE" . | grep -v node_modules
```

- `photobooth-app-*` / `photobooth-admin-*` → your real project ids and hosting site names
- `com.yourbrand.photobooth*` → your real bundle identifier / package name
- `REPLACE_WITH_EAS_PROJECT_ID`, `REPLACE_WITH_APP_STORE_CONNECT_APP_ID`, `REPLACE_WITH_APPLE_TEAM_ID`
- `https://admin.photobooth.example` → your custom domain
- Add `firestore.indexes.json` field overrides only if your real queries need them

## Quick start

```bash
# 1. validate config locally
python3 scripts/validate.py

# 2. local stack (emulators, no cloud project touched)
firebase emulators:start --project photobooth-app-dev

# 3. create the three projects + attach the deploy service accounts, then
firebase deploy --only firestore:rules,firestore:indexes,storage --project photobooth-app-staging
```

## Notes on action versions

Workflow action references (`actions/checkout@v4`, `expo/expo-github-action@v8`,
`FirebaseExtended/action-hosting-deploy@v0`, `actions/upload-artifact@v4`) follow current
published majors; for production, pin each one to a full commit SHA so a compromised tag cannot
run in your pipeline.

---

# 🔄 v4 — what changed (and where the workflows actually live now)

The readiness audit (W5) found that CI was never merged into the repository: the five workflows
existed only inside `devops/`, so no pipeline could run, and the two bundle-scanning paths were
hardcoded to the Create-React-App layout (`build/static/js`) while this admin panel is a **Vite**
build that emits `admin-panel/build/assets`.

The v4 patch fixes the DevOps side of that and nothing else:

1. **Workflows moved to the repository root** — `.github/workflows/`. From this version on, treat
   the `devops/.github/` copy as superseded and delete it (`rm -rf devops/.github`) so only one
   pipeline tree can run. `scripts/validate.py` warns for as long as it exists.
2. **Every path is root-relative** — `working-directory: functions` / `mobile` / `admin-panel`
   instead of the `../` forms that only made sense from inside `devops/`.
3. **Build output scanning aligned with Vite** — secret scan, staging-identity check and the
   production point-of-no-return check all read `admin-panel/build/assets/`, plus a new guard that
   `firebase.json` `hosting.public` equals Vite's `build.outDir`. The prod check now also fails if
   a prod bundle still contains the staging project id.
4. **Environment naming matches the admin app** — the panel source reads
   `import.meta.env.VITE_*`, so CI, the panel's own `.env.example` and
   `devops/admin-panel/.env.example` all use `VITE_*` now. The old `REACT_APP_*` names never
   reached `import.meta.env`, which is exactly how a production bundle silently shipped in
   demo/mock mode (`isConfigured = false`). `pr-checks.yml` fails the build if the two ever drift
   apart again, and the validator checks it statically.
5. **Test-script expectations, including rules testing** — `functions/test/` now carries the
   Firebase **Emulator Suite rules harness** (18 Firestore assertions, 6 Storage assertions), a
   ts-jest config with a self-contained `tsconfig.rules.json`, and the `test:rules` script wrapped
   in `firebase emulators:exec --only firestore,storage,auth`. `pr-checks.yml` runs it with Java 17
   installed, guards that the harness files exist, and uploads the emulator log on failure.
   `functions/package.json` also gained the `lint` script that `firebase.json` `predeploy` expects
   — without it `firebase deploy --only functions` fails outright. `mobile/package.json` gained
   `test` / `test:ci` plus a `jest-expo` config so Gate 0 has a real mobile target.
6. **Smaller correctness fixes** — smoke tests now call the exported `/healthz` (not `/health`),
   functions deploy targets the declared codebase `photobooth-core` (not `default`), installs use
   `npm ci` only when a lockfile exists (`mobile/` has none), and the production release refuses to
   run with `REPLACE_*` placeholders still in the tree.

**Merge steps, what is ready, and what still needs secrets or a live environment: see
`docs/MERGE-READY.md`.** Nothing in `docs/` (other than the three new files) was modified.
