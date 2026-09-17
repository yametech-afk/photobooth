# 🔀 DevOps Merge-Ready Guide (v4)

Ang dokumentong ito ang **tanging** kailangan mong basahin bago i-merge ang
DevOps patch na ito sa `photobooth-monorepo`. Sinasabi nito ang eksaktong
ilalagay, ano ang **ready to merge**, at ano ang **hindi pa** (kailangan ng
secrets o live environment).

---

## 1. Ano ang nasa patch

Ang patch ay isang **path-preserving overlay**. I-overlay sa repo root:

```bash
unzip -o photobooth-devops-patch-v4.zip -d /path/to/photobooth-monorepo
cd /path/to/photobooth-monorepo
rm -rf devops/.github            # superseded — see §3 step 1
python3 devops/scripts/validate.py
```

| Landas | Aksyon | Bakit |
|---|---|---|
| `.github/workflows/*.yml` (5 files) | **BAGO** — ilagay sa root | Ang CI ay tumatakbo lang mula sa root; dati walang `.github/` sa repo kaya walang pipeline |
| `functions/package.json` | **PALITAN** (full file) | Nagdagdag ng `lint` (kailangan ng firebase.json predeploy), `test`, `test:unit`, `test:rules`, at test devDeps |
| `functions/test/**` (4 files) | **BAGO** | Ang rules-test harness na hinahanap ng `pr-checks.yml` |
| `mobile/package.json` | **PALITAN** (full file) | Nagdagdag ng `test` / `test:ci` scripts + jest devDeps (Gate 0 expectation) |
| `mobile/jest.config.js` | **BAGO** | Jest preset para sa `npm test` |
| `devops/scripts/validate.py` | **PALITAN** (full file) | Dinagdag ang workflow-location, npm-script, Vite-path, env-prefix, codebase, at health-path checks |
| `devops/admin-panel/.env.example` | **PALITAN** | `REACT_APP_*` → `VITE_*` (ito ang sanhi ng "demo mode sa production") |
| `devops/README.md` | **PALITAN** (idinagdag ang v4 section) | Dokumentasyon |
| `devops/docs/MERGE-READY.md` · `RULES-PARITY.md` · `CI-CHANGELOG-v4.md` | **BAGO** | Merge steps, rules decision record, per-file changelog |
| `DEVOPS-PATCH-v4-README.md` | **BAGO** (zip root) | Buod ng patch |

Hindi kasama sa patch ang `devops/.github/workflows/` — sadya ito. Inalis ang
dobleng pipeline tree; ang root `.github/workflows/` na ang tanging totoong CI.

---

## 2. ✅ READY TO MERGE (walang kailangang secret o live na project)

Ang mga ito ay tapos na at pwedeng i-merge agad:

1. **Root CI tree** — `.github/workflows/pr-checks.yml`, `admin-preview.yml`,
   `deploy-staging.yml`, `release-production.yml`, `mobile-eas-build.yml`.
   Lahat ng path ay root-relative na (`mobile/`, `admin-panel/`, `functions/`,
   `devops/`), hindi na relative sa `devops/`.
2. **Vite-aligned build scanning** — ang lahat ng scan at prod-identity check ay
   tumitingin na sa `admin-panel/build/assets/` (ang tunay na Vite output na
   naka-declare sa `vite.config.js` `build.outDir`), hindi na sa
   `build/static/js` ng Create-React-App na wala sa repo na ito.
3. **Env naming consistency** — CI, `devops/admin-panel/.env.example`, at ang
   source (`import.meta.env.VITE_*`) ay pare-pareho nang `VITE_*`.
4. **Rules testing bilang Gate 0 job** — `functions/test/` harness +
   `npm run test:rules` na naka-wrap sa `firebase emulators:exec`
   (`--only firestore,storage,auth`), may Java setup step at harness-presence
   guard. Ang `pr-checks.yml` ay may `ci-summary` job para isang tingin lang.
5. **Script/harness existence guards** — lahat ng `npm run <script>` na
   tinatawag ng workflow ay may tugmang script sa tamang `package.json`
   (`lint` sa functions ay idinagdag para tumugma sa `predeploy`).
6. **Health path** — ang smoke tests ay tumatawag na sa tunay na
   `/healthz` (`functions/src/http/endpoints.ts`), hindi sa `/health`.
7. **Functions codebase** — ang deploy ay `functions:photobooth-core`, tugma sa
   root `firebase.json`.
8. **`validate.py` v4** — pwedeng patakbuhin locally at sa CI;
   `python3 devops/scripts/validate.py` → `ALL CHECKS PASSED (with warnings)`.
9. **Preserved docs** — lahat ng orihinal na `devops/docs/*.md`
   (ENVIRONMENTS, SECRETS, MONITORING, ROLLBACK, RELEASE-RUNBOOK,
   PRODUCTION-CHECKLIST) ay **hindi binago**.

---

## 3. ⚠️ KAILANGAN NG TAO / SECRETS / LIVE ENVIRONMENT (hindi pa ready)

Gawin ang mga ito **bago** ang unang totoong deploy. Wala sa patch ang
mga ito dahil nangangailangan ng iyong account o ng tumatakbong environment.

### Step 1 — Alisin ang superseded workflow tree
```bash
rm -rf devops/.github/workflows
```
Kung hindi, dalawang pipeline tree ang nasa repo. Nagbibigay ng warning ang
`validate.py` hangga't nariyan ito.

### Step 2 — GitHub secrets at variables
| Pangalan | Uri | Para saan |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_STAGING` | secret | Backend + hosting deploy sa staging (least-privilege SA, hindi Owner) |
| `FIREBASE_SERVICE_ACCOUNT_PROD` | secret | Backend + hosting deploy sa production |
| `EXPO_TOKEN` | secret | `eas build` / `eas submit` / `eas update` |
| `STAGING_FIREBASE_API_KEY`, `PROD_FIREBASE_API_KEY` | secret | Admin panel build (public-safe API key) |
| `STAGING_AUTH_DOMAIN`, `STAGING_STORAGE_BUCKET`, `STAGING_MESSAGING_SENDER_ID`, `STAGING_APP_ID` | variable | Admin panel build |
| `PROD_*` (kaparehong set) | variable | Admin panel build |

Idagdag din ang GitHub Environment **`production`** na may **required reviewers**
— ito ang approval gate ng release.

### Step 3 — Live na environment (hindi ma-verify sa assembly sandbox)
- **Firebase projects**: `photobooth-app-dev`, `-staging`, `-prod` sa
  `asia-southeast1`; Blaze plan + budget alerts sa 50/80/100%.
- **Hosting sites**: `photobooth-admin-dev`, `-staging`, `-prod`, naka-link sa
  hosting target na `admin`. Punan ang `targets` sa root `.firebaserc`
  (kasalukuyang `{}`), kung hindi ay mabibigo ang `--only hosting:admin`.
- **Admin authority**: gumawa ng tunay na Auth user, ilagay ang `admin: true`
  custom claim + `adminRoles/{uid}` doc na `status: 'active'`.
- **Rules tests**: patakbuhin ang `cd functions && npm run test:rules` sa
  makinaryang may **Java 17 + firebase-tools**. Ang 18 Firestore at 6 Storage
  assertions sa harness ay **hindi pa naipatakbo** dito — ang berde nitong run
  ang siyang ebidensya.
- **IAP / payments**: `REPLICATE_API_TOKEN`, `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET` sa Cloud Functions secrets
  (`firebase functions:secrets:set <NAME>`), at live na store credentials.
- **Store accounts**: Play Console ($25 one-time) at Apple Developer ($99/taon);
  `REPLACE_WITH_EAS_PROJECT_ID`, `REPLACE_WITH_APP_STORE_CONNECT_APP_ID`,
  `REPLACE_WITH_APPLE_TEAM_ID` sa `devops/mobile/eas.json` at `app.config.js`;
  `com.yourbrand.photobooth*` bundle ids.

### Step 4 — Out of scope (hindi DevOps; wala sa patch na ito)
Ang mga ito ay **hindi** gi-nawa dito dahil labas ng DevOps/CI boundary, at
kabilang sa app/backend ownership ayon sa audit:

| Item | May-ari |
|---|---|
| W1 — actual na module screens na naka-mount sa `RootNavigator` | Integration owner |
| W6 — `makePublic()` security hole sa `photoService.ts` | Backend |
| W7 — IAP adapter stub / receipt verification | Monetization + Backend |
| W4/W12 — admin identity (`admins/{uid}` vs `adminRoles/{uid}` + claim) sa loob ng `admin-panel/**` at callables | Admin panel + Backend |
| W9 — tatlong kopya ng rules: alin ang i-deploy | Backend (tingnan `RULES-PARITY.md`) |
| W13 — `shared/` contracts C1–C7 | Shared contracts owner |
| B2 — Expo SDK 50 → 57 / RN 0.86 upgrade | Mobile |

Ang DevOps side ay **handa nang mag-run** ng pipeline: sa sandaling maresolba
ang mga row sa itaas at mapunan ang secrets, ang CI ay may totoong trabaho
(config validation, rules tests, mobile typecheck+test, admin bundle guards,
functions build) — hindi na empty o naka-hardcode sa `true`.

---

## 4. Unang dry run (recommended order)

```bash
# 1. Static validation, walang cloud project
python3 devops/scripts/validate.py

# 2. Rules tests, lokal na emulator (kailangan ng Java 17)
cd functions && npm install && npm run test:rules

# 3. Buong emulator stack + seed + smoke
cd .. && npm run emulators          # terminal 1
npm run seed && npm run smoke-test  # terminal 2

# 4. Unang tunay na deploy: staging muna
git checkout -b develop && git push origin develop   # → deploy-staging.yml
```
