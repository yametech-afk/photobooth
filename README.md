# 📸 Photobooth Platform — v4 FINAL (consolidated monorepo)

**Petsa ng konsolidasyon:** 17 Setyembre 2026
**Pinagmulan:** 7 artifact (3 v4 monorepo patch, QA pack, readiness audit, admin panel, backend)
**Detalye ng merge at status ng blocker:** tingnan ang `MERGE_NOTES.md`
**Aktwal na output ng verification:** `docs/MERGE-VERIFY-REPORT.txt`

> ⚠️ **HINDI PA FINAL-FINAL para sa public store launch.** Ang codebase ay buo at malaki,
> ngunit may natitirang blocker (IAP live receipt verification, admin identity model,
> `makePublic` hardening, at mga environment/account na gawain mo). Ang package na ito ay
> **GO para sa internal/beta build**, **NO-GO pa para sa store** — basahin ang §4 ng MERGE_NOTES.

---

## Ano ang nasa loob

| Path | Ano ito |
|---|---|
| `mobile/` | React Native (Expo 50) app — camera, AI filters, preview/editor, gallery, monetization, premium/booking |
| `admin-panel/` | React + Vite admin dashboard (users, photos, filters, events, bookings, revenue, notifications, settings) |
| `functions/` | Firebase Cloud Functions backend (TypeScript, asia-southeast1) + security-rules tests |
| `firestore.rules` · `storage.rules` · `firestore.indexes.json` | Deny-by-default security rules at composite indexes |
| `shared/` | **Shared contracts** (v4): `CONTRACTS.md`, `callables.ts`, `routes.ts`, `plan-constants.ts`, `analytics-events.ts`, `firestore-schema.md`, `env-contract.md` |
| `.github/workflows/` | **5 root CI/CD workflow** (pr-checks, admin-preview, deploy-staging, release-production, mobile-eas-build) |
| `devops/` | Environments/secrets/monitoring/rollback docs, `eas.json`, `app.config.js`, `validate.py` |
| `qa/` | **QA pack** — test plan, integration matrix, regression checklist, release gates, emulator strategy, static findings + mobile/functions tests |
| `docs/` | Readiness audit (docx), verify report, backend README, master assembly plan, mobile integration notes |
| `scripts/` | `seed.mjs`, `smoke-test.sh` (emulator end-to-end) |
| `V4-PATCH-NOTES.md` · `DEVOPS-PATCH-v4-README.md` | Provenance ng dalawang v4 patch |

---

## Quick start

```bash
# 0) dependencies
npm install                       # root (workspaces glue)
npm --prefix mobile install
npm --prefix functions install
npm --prefix admin-panel install

# 1) local backend
firebase emulators:start --project photobooth-app-dev
npm run seed                      # config + filters + packages + unang superadmin
npm run smoke-test                # 15-hakbang end-to-end

# 2) mobile
cd mobile && cp .env.example .env # punan ang EXPO_PUBLIC_FIREBASE_* (hindi kasama ang keys)
npx tsc --noEmit && npx expo start --dev-client

# 3) admin panel
cd admin-panel && cp .env.example .env   # VITE_FIREBASE_* (Vite prefix, hindi REACT_APP_)
npm run dev

# 4) preflight bago mag-deploy
python3 devops/scripts/validate.py       # 16 JSON + 5 YAML ok; 1 kilalang false-positive (tingnan ang report)
```

## Environment (3 hiwalay na mundo)

| | dev | staging | production |
|---|---|---|---|
| Firebase | `photobooth-app-dev` | `photobooth-app-staging` | `photobooth-app-prod` |
| Hosting target `admin` | `photobooth-admin-dev` | `photobooth-admin-staging` | `photobooth-admin-prod` |
| CI trigger | lokal/emulator | push sa `develop` | tag `v*.*.*` + approval |

Naka-pin ang Functions region sa `asia-southeast1` (mobile at backend — ayos na ang dating F-2 mismatch).

## Mga babasahin bago mag-release

1. `MERGE_NOTES.md` — kung ano ang naayos, kung ano ang bukas, at bakit.
2. `qa/docs/qa/04-RELEASE-GATES.md` — 5 release gates (merge → emulator → device → staging → store).
3. `devops/docs/PRODUCTION-CHECKLIST.md` at `ROLLBACK.md`.
4. `docs/Photobooth-Final-Readiness-Audit.docx` — ang audit na pinagbasehan ng status sa ibaba.
