# 🚦 Release Gates — Photobooth Platform

Lima ang gates. **Hindi pinupwit ang gate.** Ang bawat gate ay may owner at ebidensyang
kailangang naka-link sa release PR/tag.

---

## Gate 0 — Merge Gate (bawat PR → `develop`)
**Owner:** anumang dev · **Tumatakbo sa:** GitHub Actions `pr-checks.yml`

- [ ] JSON/YAML validity (firebase.json, indexes, .firebaserc, eas.json)
- [ ] Rules compile (`firebase deploy --only firestore:rules --dry-run`)
- [ ] **Rules unit tests green** sa emulator (`functions/test/rules/*` — kasama na sa QA pack)
- [ ] Mobile: `tsc --noEmit` 0 errors + jest unit green (monetization logic ≥ 90% statements)
- [ ] Admin: `npm run build` matagumpay + secret-scan sa bundle
- [ ] Functions: `tsc` build + rules tests

## Gate 1 — Emulator Gate (bawat merge sa `develop`)
**Owner:** QA · **Tumatakbo sa:** CI o lokal (`npm run emulators` + scripts sa `05-EMULATOR-STRATEGY.md`)

- [ ] `scripts/smoke-test.sh` 15/15 ✓ (bootstrap, quota=5 free, idempotency, rate limit, admin gating, analytics allowlist, ledger)
- [ ] Rules tests: lahat ng allow/deny pairs green (firestore + storage)
- [ ] Quota race: 50-parallel `finalizePhotoUpload` sa 10 credits → eksaktong 10 ang naka-debit, ledger balanse
- [ ] Booking race: walang overbook sa slot
- [ ] Seed → `getAppBootstrap` nagbabalik ng version gate + filter catalogue
- [ ] Scheduled: `dailyQuotaReset` dry run sa emulator → rollover tama sa Asia/Manila

## Gate 2 — Device Gate (bawat `staging` build)
**Owner:** QA + 1 tagasubok na iba sa dev · **Laman:** `eas build --profile staging` APK/TestFlight

- [ ] Buong happy-path E2E (tingnan Integration Matrix §"Happy-path") sa **mid-range Android + pisikal na iPhone**
- [ ] Camera: capture p95 < 2.5s mula tap hanggang preview; burst walang OOM sa 2GB device
- [ ] Crash-free sessions ≥ 99.5% sa 48h dogfooding (Crashlytics)
- [ ] Upload success ≥ 97% (analytics `photo_upload_completed` / `photo_upload_requested`)
- [ ] IAP sandbox: purchase + restore 100% pumasa — **at** walang placeholder sa receipt verification (Blocker B5 **dapat** tapos na)
- [ ] Offline → online recovery: walang doble, walang nawalang credit
- [ ] Permissions strings tugma sa `app.json` (verified: NSCamera/NSPhotoLibrary/NSPhotoLibraryAdd + Android CAMERA)

## Gate 3 — Staging → Production (tag `v*.*.*` + approval)
**Owner:** releaser (GitHub Environment `production` required reviewers)

- [ ] Gate 0–2 lahat berde sa **eksaktong commit na tina-tag**
- [ ] `devops/scripts/validate.py` ALL CHECKS PASSED; walang `REPLACE*` placeholder
- [ ] Rules parity decision tapos na (root vs devops — P0-10) at ang na-deploy ay ang na-test
- [ ] Firestore backup (daily export) berde + **isang na-test na restore** sa nakaraang buwan
- [ ] App Check: monitor mode ≥ 48h sa prod traffic, unverified ≈ 0 bago i-enforce
- [ ] Rollback rehearsal: `eas update:rollback` at `firebase hosting:rollback` nasubukan sa staging
- [ ] Monitoring: alerts naka-configure (function error >1%/15min, rules denials >50/min, storage >70% budget, billing 50/80/100%)
- [ ] Store assets: screenshots, data-safety form, privacy policy URL live, support email

## Gate 4 — Store Release + First 48h
**Owner:** PM/on-call

- [ ] Android **staged rollout sa 10%** (hindi 100%); iOS phased release
- [ ] 48h thresholds bago i-promote sa 50%→100%:
  | Metric | Threshold |
  |---|---|
  | Crash-free sessions | ≥ 99.5% |
  | Upload success | ≥ 97% |
  | AI filter failure | < 3% |
  | Function error rate | < 1% / 15min |
  | Rules denials | walang spike > 50/min |
  | Auth p95 | < 800ms |
  | Revenue figures | tugma sa Firestore aggregate |
- [ ] Hotfix path ready: OTA channel `production` + `eas update` na na-test sa staging binary
- [ ] On-call: P1 (hindi makakuha/makapag-save/makabayad ang user) → ack 15min, mitigation 1h, **rollback muna bago diagnose**

---

## Ano ang napatunayan na (verified) vs. kailangan pa ng totoong environment

**Na-verify na ngayon (static, sa sandbox):** file/path ng lahat ng sanggunian sa docs na ito;
callable-name/region mismong (F-2, F-3); sira ng import sa preview-editor (F-4); rules-vs-signup
conflict (F-1); filter catalog ↔ premium IDs parity (tumatakbong unit test); JSON validity ng
config; `bash -n` ng scripts.

**Kailangan pa ng totoong environment:** anumang bagay na nangangailangan ng Firebase project,
npm install ng Expo/RN tree, emulator suite, o pisikal na device — lahat ng `[E]`, `[D]`, `[W]`
items sa itaas. Ang QA pack ay nagbibigay ng commands at tests, ngunit hindi ko pinapangako na
pumasa ang mga ito nang hindi pa tumatakbo sa inyong makina.
