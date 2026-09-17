# ✅ Regression Checklist — Photobooth Platform

Gawin bago ang **bawat** release (staging promotion at production tag).
Tandaan: `[E]` = emulator, `[D]` = totoong device, `[W]` = web/browser, `[M]` = manual.
I-check ang lahat ng P0 kahit hotfix lang — ang rules at quota ay hindi basta-basta.

---

## 1. Auth & Onboarding
- [ ] `[E][D]` Sign up (bagong email) → nalikha ang profile **via `bootstrapSession`** (hindi client `setDoc` — tingnan F-1) → may `users/{uid}` + `quotas/{uid}`
- [ ] `[D]` Login → Home nagpakita ng "5 photo credits left" (free) o "Premium member ★"
- [ ] `[D]` Logout → login ulit → napanatili ang session (AsyncStorage persistence)
- [ ] `[E]` Suspended account → `beforeSignIn` tumanggi
- [ ] `[D]` Onboarding 3 slides → tapos → Home

## 2. Camera & Capture
- [ ] `[D]` First open → camera permission prompt; deny → friendly screen na may "Bigyan ng pahintulot"; allow → preview
- [ ] `[D]` Front/back flip gumagana, hawak ang orientation
- [ ] `[D]` Single capture → haptic → PhotoPreview na may tamang photo
- [ ] `[D]` 4-Burst → progress badge "Burst 2/4" → stop sa gitna → walang crash, walang orphan timer (tingnan `usePhotoCapture` cleanup)
- [ ] `[D]` Burst sa free plan → naka-gate (`burst_mode` entitlement) o singilin ng 4 credits (`CREDIT_COSTS.burst_capture = 4`)
- [ ] `[D]` Filter rail: 4 free + 8 premium na may 🔒; tap sa locked → paywall, **hindi** nagiging aktibo ang filter
- [ ] `[D]` Backgrounding habang nagca-capture → walang crash

## 3. Quota & Credits (P0 — huwag laktawan)
- [ ] `[E]` Free user 5/5 → ika-6 capture → blocked + `quota_exhausted` analytics + paywall
- [ ] `[E]` Tampered client (force-write `creditsRemaining`) → `PERMISSION_DENIED` sa rules
- [ ] `[E]` 2 parallel `finalizePhotoUpload` sa 1 credit → tanging isa lang ang pumasa (transaction)
- [ ] `[E]` Retried upload na may parehong `idempotencyKey` → isang singil lang (smoke step 5)
- [ ] `[E]` Device clock binabalik ng isang araw → hindi nag-reset ang daily counter (UTC/Manila keys)
- [ ] `[E]` Month rollover → `creditsRemaining` = 150 ulit (free), ledger may `reset` entry

## 4. Upload Pipeline
- [ ] `[E][D]` Upload happy path: reservation → PUT sa signed URL → finalize → photo `status: ready` sa Gallery
- [ ] `[D]` Airplane mode → queue na may retry; resumption pagkatapos mawalan ng net
- [ ] `[E]` Upload failure → `reportUploadFailed` → walang nasayang na credit, reservation TTL 30min
- [ ] `[E]` >10MB file → tinanggihan bago pa sa Storage
- [ ] `[D]` Kill app sa gitna ng upload → walang doble na photo sa susunod na bukas (idempotency)

## 5. Preview / Editor / Gallery / Share
- [ ] `[D]` Apply each free GPU filter → preview totoo ang kulay (GL shader), bake → upload
- [ ] `[D]` Edit: rotate/flip/crop/grade sliders → bake → walang quality trap
- [ ] `[D]` Strip layout (5 variants × frames) → capture via view-shot → save sa "Photobooth" album (lazy permission)
- [ ] `[D]` Gallery: pagination (25/page), pull-refresh, multi-select bulk delete → optimistic + rollback
- [ ] `[D]` Share → native sheet + revocable link; buksan ang `/s/{token}` sa browser (`[W]`) → kita ang photo
- [ ] `[W]` Revoke → link 404 na
- [ ] `[D]` ⚠️ Alalahanan: ang pag-share ng private photo ay ginagawang `public` (`createShare`) — kumpirmahing sadya ito bago ang launch

## 6. Premium / IAP
- [ ] `[E]` `verifyPremiumPurchase` na may fake receipt → `permission-denied`, nanatiling free
- [ ] `[D]` Sandbox purchase (Android + iOS) → plan=premium sa loob ng 10s → UI auto-update (Home badge, Settings)
- [ ] `[D]` Restore purchases → nabawi ang entitlement
- [ ] `[E]` Expired subscription → cron sweep → downgrade sa free + claims refresh
- [ ] `[D]` Paywall → PlanComparison → purchase → paywall nag-sara nang mag-isa

## 7. Events & Bookings
- [ ] `[E]` Booking sa published event → `PB-XXXXXXXX` code → makikita sa admin Bookings
- [ ] `[E]` Slot capacity race (2 sabay sa 1 upuan) → tanging isa ang `confirmed`
- [ ] `[D]` Cancel → seats returned → push notification sa organizer

## 8. Admin Panel (`[W]` sa `photobooth-admin-*.web.app`)
- [ ] Login → non-admin denied (`adminRoles` + claim check)
- [ ] Dashboard counts tugma sa manual Firestore counts; **walang random revenue placeholder** (B8)
- [ ] Users: search, filter, plan toggle, credits adjust (may audit log entry)
- [ ] Filters: create premium filter → lumabas agad sa mobile catalog (`getAppBootstrap`/`getFilters`)
- [ ] Revenue: figures tugma sa `subscriptions` aggregate
- [ ] Deep-link refresh (F5 sa /users) → hindi 404 (SPA rewrite)
- [ ] Deploy **mula repo root** lang (hindi sa `admin-panel/` rules copies)

## 9. Backend / Infra
- [ ] `python3 devops/scripts/validate.py` → ALL CHECKS PASSED
- [ ] `bash scripts/smoke-test.sh` sa emulators → 15/15 ✓
- [ ] `/healthz` → 200; indexes nasa *Enabled* (hindi *Building*)
- [ ] Rules deployed mula sa iisang canonical file (root) — diff vs `devops/firestore.rules` ay sinuri na (P0-10)
- [ ] Secrets: walang bagong key sa bundle (`grep -rn "REPLACE" .` malinis; secret scan green)

## 10. Cross-device Smoke Matrix

| Device class | Halaga | dahil |
|---|---|---|
| Mid-range Android (hal. 4GB RAM, Android 12) | **Primary** | pinakakaraniwang user sa PH |
| Lumaing Android (Android 10, 2GB) | camera burst memory | `usePhotoCapture` ref buffer |
| Pisikal na iPhone (hindi sim lang) | camera + IAP + share sheet | iOS quirks |
| Tablet (iPad) | layout | `supportsTablet: true` |
