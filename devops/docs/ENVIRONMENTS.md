# Environment Plan — Photobooth Platform

Three fully separate Firebase projects, three EAS channels, one repository.
Nothing is shared between environments: separate databases, buckets, service
accounts, app IDs and signing credentials. A staging bug can never touch prod data.

| | Development | Staging | Production |
|---|---|---|---|
| Purpose | Day-to-day coding | QA, UAT, internal testers | Live users, real money |
| Firebase project | `photobooth-app-dev` | `photobooth-app-staging` | `photobooth-app-prod` |
| Firestore region | `asia-southeast1` | `asia-southeast1` | `asia-southeast1` |
| Hosting site | `photobooth-admin-dev` | `photobooth-admin-staging` | `photobooth-admin-prod` |
| Admin panel URL | `https://photobooth-admin-dev.web.app` | `https://photobooth-admin-staging.web.app` | `https://admin.photobooth.example` |
| EAS channel | `development` | `staging` | `production` |
| EAS profile | `development` | `staging` | `production` |
| Bundle / package id | `com.yourbrand.photobooth.dev` | `com.yourbrand.photobooth.staging` | `com.yourbrand.photobooth` |
| Distribution | dev client (`expo-dev-client`) | internal APK / TestFlight | Play Store + App Store |
| Backend source | Emulator Suite (local) | Deployed Cloud Functions | Deployed Cloud Functions |
| Data | Synthetic / seeded | Anonymised test data | Real user data |
| App Check | off | monitor-only | **enforced** |
| GitHub Environment | none | `staging` | `production` (required reviewers) |
| Who deploys | the developer, locally | CI on push to `develop` | CI on `v*.*.*` tag + human approval |

## Environment separation rules

1. **One Firebase project per environment.** Never reuse a project for staging and prod;
   the emulator suite (`firebase emulators:exec`) covers local work so no shared dev project is needed.
2. **Separate mobile app identities.** Different `package` / `bundleIdentifier` per environment
   lets testers install QA and production side by side on one phone, and keeps store listing
   analytics clean.
3. **Separate OTA channels.** `runtimeVersion.policy: appVersion` plus a per-profile channel
   guarantees a staging JS bundle can never be delivered to a production binary.
4. **Config, not code, switches environments.** Environment is resolved from
   `EXPO_PUBLIC_APP_ENV` (mobile) and CI env vars (admin panel). There is no
   `if (prod)` branching in application code.
5. **Promotion, never divergence.** Staging and production run identical code; staging is the
   rehearsal of the exact commit and tag that will be released.

## Local development loop

```bash
# Terminal 1 — backend on the emulators (no cloud project touched)
firebase emulators:start --project photobooth-app-dev

# Terminal 2 — mobile against emulators
cd mobile && npx expo start --dev-client

# Terminal 3 — admin panel against emulators
cd admin-panel && REACT_APP_APP_ENV=development npm start
```

Point local SDKs at the emulators with the standard connection helpers
(`connectFirestoreEmulator`, `connectStorageEmulator`, `connectAuthEmulator`) guarded by
`__DEV__ && process.env.EXPO_PUBLIC_USE_EMULATORS === 'true'`.

## Promotion path

```
feature/*  --PR-->  develop  --auto-->  staging (Firebase staging + EAS staging build)
                       |
                    main  --tag v1.2.0-->  production (approval gate -> Firebase prod + stores)
```

Hotfixes branch from `main`, get a patch tag, and are cherry-picked back to `develop`.