# 🧪 QA Test Plan — Photobooth Platform (P0–P2)

Base: `photobooth-monorepo-final-v2` (Sep 17, 2026 assembly). Bawat test item ay naka-link sa
totoong file path sa monorepo. Prioridad: **P0** = hindi puwedeng mag-release kapag pumalpak,
**P1** = bago ang public launch, **P2** = health/robustness.

---

## P0 — Release Blockers (bayad/pera, auth, data integrity)

| # | Area | Test | Totoong file na tinatest | Uri | Paano |
|---|------|------|--------------------------|-----|-------|
| P0-1 | Quota integrity | Hindi ma-o-overdraw ang credits sa parallel capture (2 sabay na `finalizePhotoUpload` sa 1 natitirang credit) | `functions/src/services/quotaService.ts` (transactional spend) + `functions/src/callables/photos.ts` | Backend / emulator | Rules+callable tests sa Emulator Suite; 50-parallel race script |
| P0-2 | Idempotency | Retried upload na may parehong `idempotencyKey` ay singilin **isang beses** lang | `functions/src/callables/photos.ts` → `requestPhotoUpload` | Backend / emulator | `scripts/smoke-test.sh` step 5 (nasa repo na) |
| P0-3 | Auth rules | `users/{uid}` doc ay **client-created denied** (`allow create: if false`) — ang client signup ay dapat dumaan sa `bootstrapSession` | `firestore.rules` §users vs `mobile/src/services/auth.ts` `signUpWithEmail` (may client-side `setDoc`) | ⚠️ **Mismong conflict** — tingnan `06-STATIC-FINDINGS.md` F-1 | Rules test R-01 + integration test |
| P0-4 | Anti self-grant | Client write sa `plan`, `entitlements`, `creditsRemaining`, `adminRoles` ay laging `PERMISSION_DENIED` | `firestore.rules` (quotas/subscriptions/adminRoles write:false) | Rules test | `functions/test/rules/firestore.rules.test.ts` |
| P0-5 | Premium gating | Free user, 5/5 photos → ika-6 ay `resource-exhausted` + paywall; clock-rollback ay hindi nagre-reset ng quota | `functions/src/callables/photos.ts`, `mobile/src/modules/monetization/.../usageLimits.js` (UTC keys) | Unit + emulator | `usageLimits.test.js` + smoke test |
| P0-6 | Upload protocol | 3-step: `requestPhotoUpload` → signed-URL PUT → `finalizePhotoUpload`; pagkabigo → `reportUploadFailed` rollback | `mobile/src/modules/camera/services/uploadHandoff.ts`, `mobile/src/modules/preview-editor/.../uploadService.ts` | Integration | `uploadHandoff.test.ts` (mocked) + emulator E2E |
| P0-7 | Functions region | Lahat ng client `getFunctions()` ay naka-pin sa `asia-southeast1` — kapag hindi, `functions/not-found` sa totoong project | `mobile/src/services/functions.ts` (kulang ang region!) vs `mobile/src/modules/preview-editor/.../cloudFunctions.ts` (tama) | ⚠️ **Finding F-2** | Contract unit test |
| P0-8 | Callable names | Client wrappers ay tawagin ang mga callable na **umiral** sa backend | `mobile/src/services/functions.ts` (`uploadPhoto`, `activatePremium`) vs `functions/src/callables/*` (`requestPhotoUpload`, `verifyPremiumPurchase`, …) | ⚠️ **Finding F-3** | Contract unit test |
| P0-9 | Receipt verification | Walang placeholder na dev-shortcut sa production build bago ang store release | `docs/source-artifacts/monetization-cloud/index.js` (Blocker B5) | Manual review gate | Release Gate 3 blocker |
| P0-10 | Security rules parity | Ang `devops/firestore.rules` (custom-claim hardened) at root `firestore.rules` ay iisa lang ang dapat i-deploy — magkaiba sila | `devops/firestore.rules` vs `firestore.rules` | ⚠️ Decision needed (MERGE_NOTES §2.2) | Diff check sa CI |

## P1 — Bago ang Public Launch

| # | Area | Test | Totoong file | Uri |
|---|------|------|--------------|-----|
| P1-1 | Camera | Permission denied/retry, front/back flip, single capture, 4-burst na may cancel sa gitna (walang memory leak sa unmount) | `mobile/src/modules/camera/hooks/usePhotoCapture.ts`, `screens/CameraScreen.tsx` | RNTL + device |
| P1-2 | Filter parity | Bawat `isPremium: true` sa camera catalog ay nasa `PREMIUM_FILTER_IDS` ng monetization (at kabaliktaran) | `mobile/src/modules/camera/filters/filterCatalog.ts` vs `mobile/src/modules/monetization/.../plans.js` | Unit (`plans.test.js`, **tumatakbo na**) |
| P1-3 | Premium UI gating | 🔒 chip sa 8 premium filters, paywall bubukas, hindi nagiging aktibo ang locked filter | `mobile/src/modules/camera/components/FilterPicker.tsx`, `monetizationBridge.ts` | RNTL |
| P1-4 | Preview/Editor | Apply filter, edit (rotate/crop/grade), strip layout, save-to-device (lazy permission), share sheet | `mobile/src/modules/preview-editor/.../screens/*.tsx` | RNTL + device |
| P1-5 | Gallery | Cursor pagination, optimistic delete na may rollback, offline empty state | `mobile/src/modules/preview-editor/.../hooks/useGallery.ts` | RNTL |
| P1-6 | Admin panel | Login + role check, Users toggle plan, Filters CRUD, Revenue figures tugma sa `subscriptions` (walang random placeholder) | `admin-panel/src/pages/*.jsx` (Blocker B8: `Dashboard.jsx` revenue placeholder) | Vitest + manual |
| P1-7 | Bookings | Slot capacity race — 2 sabay na booking sa 1 natitirang upuan; isa lang ang pumapasok | `functions/src/services/bookingService.ts` | Emulator |
| P1-8 | Share links | TTL expiry (1–336h), revoke, `viewCount`, at ang side-effect na ang pag-share ng private photo ay ginagawang `public` | `functions/src/services/photoService.ts` `createShare()` | Emulator + manual |
| P1-9 | Notifications | Booking status change → push; suspended user → blocked sa `beforeSignIn` | `functions/src/triggers/auth.ts`, `firestore.ts` | Emulator |
| P1-10 | Storage rules | >10MB photo denied, maling MIME denied, ibang user na path denied, `public/photos/*` write denied | `storage.rules` | Rules test (storage) |

## P2 — Health & Robustness

| # | Area | Test | Totoong file | Uri |
|---|------|------|--------------|-----|
| P2-1 | Crash safety | ErrorBoundary nagre-render ng "Subukan Ulit", hindi white-screen | `mobile/src/components/ErrorBoundary.tsx` | RNTL |
| P2-2 | Perf | Cold start p95 < 3s; capture→preview p95 < 2.5s (mid-range Android); AI filter p95 < 20s, failure < 3% | `mobile/src/modules/preview-editor/.../filterRenderer.ts` (GL shader) | Device profiling |
| P2-3 | Offline | Airplane mode sa upload → queue + auto-retry; reservation TTL 30min | `preview-editor/.../uploadService.ts`, `functions` TTL policy | Device |
| P2-4 | Analytics | Allowlist lang — `steal_my_data` tinatanggihan, batch > 25 tinatanggihan | `functions/src/config/constants.ts` `ANALYTICS_EVENT_ALLOWLIST` | Smoke test step 8 |
| P2-5 | Scheduled jobs | `dailyQuotaReset`, `sweepSubscriptions` — rollover sa Asia/Manila, walang stranded user | `functions/src/scheduled/jobs.ts` | Emulator (pubsub) |
| P2-6 | CI green | `pr-checks.yml` ay tumatakbo — kasalukuyang tumatawag ng `npm run test:rules` na **wala pa** sa `functions/package.json` | `devops/.github/workflows/pr-checks.yml` | ⚠️ Finding F-6 — aayusin ng QA pack na ito |
| P2-7 | Config validation | `python3 devops/scripts/validate.py` = ALL CHECKS PASSED bago ang bawat release | `devops/scripts/validate.py` | CI + local |

---

## Coverage targets (unang 30 araw)

| Package | Statement | Branch | Uraan |
|---|---|---|---|
| `mobile/src/modules/monetization` (pure logic) | 90% | 85% | `usageLimits`, `entitlements`, `plans` |
| `mobile/src/modules/camera` (hooks) | 60% | 50% | capture/burst/cancel paths |
| `functions/src/services/quotaService` | 80% | 75% | spend/refund/rollover/race |
| Rules (firestore + storage) | 100% ng `match` blocks | — | bawat rule ay may allow + deny test |
