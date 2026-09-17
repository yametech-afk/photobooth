# Secrets & Configuration Management

Rule of thumb: **if it can be used to spend money, read other users' data, or impersonate the
project, it never ships to a client.** Everything below is stored in a managed secret store and
injected at deploy/runtime.

## Where each secret lives

| Secret | Store | Scope | Injected as | Rotation |
|---|---|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_DEV` | GitHub Environment `staging` secret (dev-only deploys) | project `photobooth-app-dev` | temp file + `GOOGLE_APPLICATION_CREDENTIALS` | 180 days |
| `FIREBASE_SERVICE_ACCOUNT_STAGING` | GitHub Environment `staging` secret | `photobooth-app-staging` | temp file + `GOOGLE_APPLICATION_CREDENTIALS` | 180 days |
| `FIREBASE_SERVICE_ACCOUNT_PROD` | GitHub Environment `production` secret (required reviewers) | `photobooth-app-prod` | temp file + `GOOGLE_APPLICATION_CREDENTIALS` | 90 days |
| `EXPO_TOKEN` | GitHub Environment secret | EAS account | env var for `eas-cli` | 90 days |
| `REPLICATE_API_TOKEN` | Cloud Functions secret (`firebase functions:secrets:set`) | functions runtime only | `defineSecret('REPLICATE_API_TOKEN')` | 90 days |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Cloud Functions secret | functions runtime only | `defineSecret()` | 180 days / 90 days |
| `INTERNAL_API_TOKEN` | Cloud Functions secret | service-to-service | `defineSecret()` | 90 days |
| Android keystore / iOS distribution cert | EAS servers (`credentialsSource: "remote"`) | EAS project | build-time, never on disk in CI | 3 years (keystore) |
| `REACT_APP_FIREBASE_*` (admin panel) | GitHub Environment secret/var | **public by design** | compiled into bundle | n/a |
| `EXPO_PUBLIC_FIREBASE_*` (mobile) | `eas.json` env + EAS env vars | **public by design** | compiled into bundle | n/a |

## Least-privilege for the deploy service accounts

Do not use Owner. Create one service account per environment with only:

- `roles/firebase.admin` (Firebase deployment across Hosting, Rules, Indexes, Extensions)
- `roles/cloudfunctions.admin` + `roles/iam.serviceAccountUser` (Functions deploy — `serviceAccountUser` is required or the deploy fails with `iam.serviceAccounts.ActAs`)
- `roles/firebaseappcheck.admin` (App Check enforcement toggles)
- `roles/serviceusage.serviceUsageViewer` (needed to enable/verify required APIs)

Generate the key once, paste the **entire JSON** into the GitHub Environment secret, and delete
the local key file. Prefer Workload Identity Federation where available so no long-lived key
exists at all.

## Non-negotiables

- `.gitignore` must contain `.env`, `.env.*`, `!*.env.example`, `google-services.json`,
  `GoogleService-Info.plist`, `*.keystore`, `*.jks`, `*serviceAccount*.json`.
- `requireCommit: true` in `eas.json` means EAS builds refuse to run from a dirty tree —
  no uncommitted secret can leak into a binary by accident.
- CI scans the admin bundle for long key-like strings before deploying (see `pr-checks.yml`).
- Firebase API keys are **not** secrets in the cryptographic sense; the protection layer is
  Firestore/Storage rules + App Check + authorization checks in Cloud Functions. Treat the key
  as an identifier, never as the security boundary.
- Every secret access in Functions is centralised: one `secrets.js` module exports the
  `defineSecret()` handles, so rotation means editing one file.
- Rotate immediately if a secret appears in a commit, a log, a screenshot, or an AI transcript.

## App Check rollout order

1. Register each app (iOS = App Attest, Android = Play Integrity, web = reCAPTCHA Enterprise);
   the Expo `expo-app-integrity` module covers the native clients.
2. Deploy with App Check in **monitor** mode in staging and collect metrics for 48h.
3. Flip to **enforced** for Firestore, Storage and Functions in staging, then production,
   only after unverified-request volume is ~0.
4. Keep the debug token out of production builds — allow it only in the `development` profile.