# 📸 Photobooth Backend — Firebase (Cloud Functions v2 + Firestore + Storage)

Production-ready backend para sa photobooth platform (premium mobile app + admin panel).

**Stack:** Cloud Functions v2 · Node 20 · TypeScript (strict) · firebase-admin v12 · Firestore · Cloud Storage · Cloud Scheduler · FCM · App Store Server API / Google Play Developer API / Stripe webhooks

---

## 1. Ano ang nasa loob

```
photobooth-backend/
├── firebase.json                 Firebase config (functions, firestore, storage, hosting, emulators)
├── .firebaserc                   Project aliases: prod / staging / dev
├── firestore.rules               DENY-BY-DEFAULT security rules
├── firestore.indexes.json        Composite indexes + TTL policies
├── storage.rules                 Storage rules (path scoping, size + MIME limits)
├── scripts/seed.mjs              Idempotent bootstrap: config, filters, packages, first superadmin
├── functions/
│   ├── package.json              deps: firebase-admin@12, firebase-functions@6
│   ├── tsconfig.json             strict, target ES2022, CommonJS
│   ├── .env.example              Lahat ng environment variables na kailangan
│   └── src/
│       ├── index.ts              Entry point — lahat ng exports
│       ├── config/
│       │   ├── constants.ts       Plans, credit costs, limits, roles, analytics allowlist
│       │   └── admin.ts           Isang Admin SDK init para sa buong codebase
│       ├── lib/
│       │   ├── errors.ts          Stable HttpsError codes
│       │   ├── validation.ts      Dependency-free input validation + sanitization
│       │   ├── dates.ts           Asia/Manila timezone-aware periods (DST-safe)
│       │   ├── logger.ts          Structured JSON logs + PII hashing/masking
│       │   ├── audit.ts           Immutable audit trail
│       │   ├── idempotency.ts     Idempotency keys + reservation
│       │   ├── rateLimit.ts       Firestore fixed-window rate limiter
│       │   └── context.ts         Auth context + permission enforcement
│       ├── models/types.ts       Lahat ng document shapes
│       ├── services/             Business logic (walang HTTP concerns)
│       │   ├── userService.ts        Profile, claims, admin roles, deletion
│       │   ├── quotaService.ts       ⭐ Atomic credit spend/refund/grant
│       │   ├── photoService.ts       Upload reservations, finalize, share, moderate
│       │   ├── subscriptionService.ts ⭐ Premium activation + store verification
│       │   ├── eventService.ts       Events, slots, packages
│       │   ├── bookingService.ts     ⭐ Slot capacity sa loob ng transaction
│       │   ├── analyticsService.ts   Batched event writes + rollups
│       │   ├── filterService.ts      AI filter catalogue
│       │   └── configService.ts      Remote config (pricing, policies)
│       ├── callables/            Client-facing + admin callable functions
│       │   ├── auth.ts   photos.ts   subscriptions.ts   events.ts   admin.ts
│       ├── triggers/
│       │   ├── auth.ts           onCreate / onDelete / blocking sign-in
│       │   └── firestore.ts      Denormalization + storage cleanup
│       ├── scheduled/jobs.ts     Quota reset, subscription sweep, rollups, housekeeping
│       └── http/endpoints.ts     /healthz, /s/{token} share page, CSV export
```

---

## 2. Firestore schema

### `users/{uid}` — profile + plan (server-owned)
| Field | Type | Notes |
|---|---|---|
| `uid`, `email`, `displayName`, `photoURL`, `phoneNumber` | string | mula sa Auth token |
| `plan` | `free` \| `premium` \| `studio` | **hindi pwedeng baguhin ng client** |
| `premiumSince`, `premiumUntil` | timestamp | NULL kapag free |
| `subscriptionId` | string | link sa `subscriptions` |
| `status` | `active` \| `suspended` \| `deleted` | sinusuri ng blocking sign-in |
| `role` | `superadmin` \| `admin` \| `support` \| `moderator` \| null | mirror ng `adminRoles` |
| `deviceTokens[]` | array | FCM push |
| `preferences{}` | map | notifications, theme, defaultFilterId … |
| `onboarding{}` | map | completed, lastStep, version |
| `counters{}` | map | totalPhotosTaken, totalShares, totalExports, totalBookings, lifetimeCreditsSpent |
| `referralCode`, `referredBy` | string | referral system |
| `lastActiveAt`, `createdAt`, `updatedAt` | timestamp | |

### `quotas/{uid}` — ⭐ authoritative spendable balance
`creditsRemaining` · `creditsGranted` · `creditsSpent` · `dailyCount` · `dailyLimit` · `dayKey` (`YYYY-MM-DD`, Asia/Manila) · `monthKey` (`YYYY-MM`) · `periodStart` · `periodEnd` · `lastResetAt` · `updatedAt`

> Binabago lang sa loob ng Firestore transaction. Automated reset: `dayKey`/`monthKey` na pagbabago ay nag-trigger ng daily + monthly rollover (lazy sa read **at** sa scheduled job).

### `quotaLedger/{entryId}` — append-only audit ng bawat credit movement
`uid` · `delta` (+/-) · `balanceAfter` · `action` · `reason` · `refType` (`photo`\|`export`\|`booking`\|`purchase`\|`admin`\|`reset`\|`signup`) · `refId` · `monthKey` · `dayKey` · `createdAt`

### `photos/{photoId}`
`uid` · `eventId` · `bookingId` · `storagePath` (private) · `thumbnailPath` · `publicUrl` · `filterId` · `filterApplied` · `mode` (`single`\|`burst`\|`gif`\|`strip`) · `status` (`reserved`\|`processing`\|`ready`\|`failed`\|`deleted`) · `visibility` (`private`\|`event`\|`public`) · `caption` · `hashtags[]` · `width`/`height` · `sizeBytes` · `contentType` · `creditsSpent` · `likes` · `shares` · `views` · `isFlagged` · `flagReason` · timestamps

### `uploadReservations/{reservationId}` — TTL
`uid` · `photoId` · `storagePath` · `filterId` · `mode` · `visibility` · `eventId` · `creditsToSpend` · `status` (`pending`\|`consumed`\|`expired`) · `expiresAt` (**TTL index**, 30 min)

### `photoShares/{shareId}` — revocable share links
`photoId` · `uid` · `token` · `url` · `channel` · `expiresAt` (1–336h) · `revoked` · `viewCount` · `createdAt`

### `events/{eventId}`
`organizerId` · `title` · `slug` (unique) · `description` · `coverPath`/`coverUrl` · `venue` · `city` · `status` (`draft`\|`published`\|`ongoing`\|`completed`\|`cancelled`) · `eventDate` · `startTime`/`endTime` · `timezone` · `packageIds[]` · `basePriceMinorUnits` · `currency` · `capacity` · `bookedCount` · `photoCount` · `tags[]` · `isFeatured`

### `eventSlots/{slotId}`
`eventId` · `organizerId` · `label` · `startTime`/`endTime` · `capacity` · `bookedCount` · `priceMinorUnits` · `currency` · `status` (`draft`\|`open`\|`closed`\|`cancelled`)

### `bookings/{bookingId}`
`code` (`PB-XXXXXXXX`) · `uid` · `eventId` · `slotId` · `organizerId` · `packageId` · `guestName`/`guestEmail`/`guestPhone` · `attendees` · `addOns[]` · `notes` · `status` (`pending`\|`confirmed`\|`checked_in`\|`completed`\|`cancelled`\|`no_show`\|`refunded`) · `amountMinorUnits` · `currency` · `paymentStatus` (`unpaid`\|`paid`\|`refunded`\|`waived`) · `paymentRef` · `photoCount` · `checkedInAt` · `cancelledAt` · `cancelReason`

### `subscriptions/{platform}_{transactionId}` — server-owned
`uid` · `plan` · `platform` (`ios`\|`android`\|`web`\|`manual`) · `productId` · `transactionId` · `originalTransactionId` · `status` (`pending`\|`active`\|`in_grace_period`\|`cancelled`\|`expired`\|`refunded`) · `autoRenew` · `amountMinorUnits` · `currency` · `receiptHash` · `verifiedAt` · `startedAt` · `currentPeriodEnd` · `expiresAt` · `cancelledAt` · `refundedAt`

> Ang deterministic doc id (`ios_<transactionId>`) ay garantiyang **hindi nadodoble ang premium** kapag inulit ng store ang webhook.

### `analytics_events/{eventId}` — TTL (180 araw)
`uid` · `name` (allowlist lang) · `params{}` (sanitized) · `sessionId` · `platform` · `appVersion` · `deviceModel` · `osVersion` · `dayKey` · `timestamp` · `expiresAt` (**TTL**)

### `analytics_daily/{YYYY-MM-DD}`
`counts.{eventName}` · `activeUsers` · `newUsers` · `photos` · `uploads` · `revenueMinorUnits` · `bookings` · `subscriptionsStarted` · `subscriptionsCancelled`

### `metrics/{docId}`
`overview` (dashboard snapshot) · `weekly` (7-day comparison) · `rollupState` (job cursors)

### `adminRoles/{uid}` — server-owned, pinagmumulan ng katotohanan
`uid` · `email` · `role` · `status` (`active`\|`revoked`) · `notes` · `grantedBy`/`grantedAt` · `revokedBy`/`revokedAt`

### Iba pa
`auditLogs/{id}` · `notifications/{id}` · `filters/{filterId}` · `packages/{packageId}` · `config/{app|creditCosts|bookingPolicy|subscriptionProducts}` · `idempotencyKeys/{key}` (TTL 24h) · `rateLimits/{uid_action_window}`

---

## 3. Storage paths

| Path | Read | Write | Limit |
|---|---|---|---|
| `users/{uid}/photos/{file}` | owner lang | owner | ≤ 10 MB, `image/jpeg\|png\|webp\|heic` |
| `users/{uid}/avatars/{file}` | signed-in | owner | ≤ 5 MB, image only |
| `users/{uid}/exports/{file}` | owner | owner | ≤ 25 MB, image/PDF |
| `events/{eventId}/cover/{file}` | signed-in | signed-in (function-authorized) | ≤ 5 MB |
| `public/photos/{file}` | **public** | **functions only** | — |

---

## 4. Authorization model

### Custom claims (mabilis na gate)
```
{ admin: boolean, role: "superadmin"|"admin"|"support"|"moderator"|null,
  plan: "free"|"premium"|"studio", onboardingComplete: boolean, status: "active"|"suspended" }
```

### Live document (authoritative)
Ang bawat admin callable ay sumusuri sa **`adminRoles/{uid}.status == "active"`** — hindi lang sa claim. Kaya ang na-revoke na admin ay agad na nawawalan ng access kahit may lumang token pa.

**Doble ang check:** rules require `token.admin == true` **AT** `adminRoles/{uid}.status == "active"`.

### Permission matrix
| Role | Permissions |
|---|---|
| `superadmin` | lahat: users, admins, photos, events, bookings, subscriptions, payments, filters, analytics, audit, config |
| `admin` | users (read/write/credits), photos (read/moderate), events, bookings, subscriptions (read), filters, analytics, notifications |
| `support` | read-only: users, photos, events, bookings, subscriptions, analytics, audit |
| `moderator` | photos (read/moderate), users (read), analytics (read) |

**Hindi kayang i-self-grant ng client:** `plan`, `creditsRemaining`, `role`, `admin`, `premiumUntil` — wala sa kahit anong client-writable field list sa `firestore.rules`.

---

## 5. Cloud Functions (buong listahan)

### Callables — mobile app
| Function | Ginagawa |
|---|---|
| `bootstrapSession` | Post-login bootstrap: gumagawa ng profile + quota kung nawawala, sync claims, balik ng flags + quota sa **isang** round trip |
| `updateUserProfile` | Whitelisted profile/preference updates |
| `finishOnboarding` | Tapusin ang onboarding — nagbibigay ng referral bonus nang isang beses lang |
| `refreshClaims` | Force claim refresh (pagkatapos ng premium/admin change) |
| `getAppBootstrap` | **Public** — version gate, feature flags, filter catalogue |
| `getQuota` | Balance + daily limit + credit costs |
| `getCreditHistory` | Credit ledger (account screen) |
| `requestPhotoUpload` | ⭐ Step 1 — quota pre-check, idempotency reservation, signed Storage PUT URL |
| `finalizePhotoUpload` | ⭐ Step 2 — verify na may file, saka i-debit ang credits, i-publish ang metadata |
| `reportUploadFailed` | Roll back ang reservation kung nabigo ang upload |
| `getMyPhotos` / `getPublicGallery` | Paginated gallery |
| `deleteMyPhoto` | Delete isa o marami (kasama ang Storage cleanup) |
| `createPhotoShare` / `revokePhotoShare` | Revocable share links + QR |
| `getSharedPhoto` | **Public** — resolve ng share token (walang private path na naba-back) |
| `getFilters` | Filter catalogue |
| `getMySubscription` | Subscription summary + config presence |
| `verifyPremiumPurchase` | ⭐ Verify ng iOS/Android receipt server-side, saka i-activate |
| `cancelMySubscription` | Cancel (immediate o sa period end) |
| `getPublicEvents` / `getPublicEventDetail` / `getPackages` | Event browsing |
| `createEventBooking` | ⭐ Slot capacity sa loob ng transaction |
| `getMyBookings` / `getBookingDetail` / `cancelEventBooking` | Booking management |

### Callables — admin panel
`adminGetDashboard` · `adminGetAnalytics` · `adminGetUserEvents` · `adminListUsers` · `adminGetUserDetail` · `adminSuspendUser` · `adminDeleteUser` · `adminSetUserPlan` · `adminAdjustCredits` · `adminListRoles` · `adminGrantRole` · `adminRevokeRole` · `adminListAuditLogs` · `adminGetConfig` · `adminUpdateConfig` · `adminSeedCatalog` · `adminSendNotification` · `adminListNotifications` · `adminGetRevenue` · `adminRefundSubscription` · `adminSyncUserClaims` · `adminGetSubscriptionMetrics` · `adminRecheckPurchase` · `adminUpsertFilter` · `adminDeleteFilter` · `adminListFlaggedPhotos` · `adminModeratePhoto` · `adminDeletePhoto` · `adminCreateEvent` · `adminUpdateEvent` · `adminSetEventStatus` · `adminDeleteEvent` · `adminListEvents` · `adminSetEventCover` · `adminCreateEventSlot` · `adminUpdateEventSlot` · `adminListBookings` · `adminUpdateBookingStatus` · `adminMarkBookingPaid` · `adminGetBookingMetrics` · `adminUpsertPackage`

### Auth triggers
- `beforeCreate` — blocking create hook
- `beforeSignIn` — tinatanggihan ang suspended na account
- `onUserCreated` — profile + quota + custom claims
- `onUserDeleted` — nililinis ang `users/{uid}/**` sa Storage

### Firestore triggers
- `onAnalyticsEventCreated` — daily counter increments
- `onPhotoDeleted` — Storage cleanup + event counter decrement
- `onBookingStatusChanged` — push notifications sa user
- `onSubscriptionWritten` — claims refresh + churn counter
- `onUserDocumentCreated` — quota safety net
- `onBookingDeleted` — ibalik ang na-release na seats

### Scheduled jobs (Asia/Manila)
| Job | Schedule | Ginagawa |
|---|---|---|
| `dailyQuotaReset` | `5 0 * * *` | Daily + monthly allowance reset (paged, cursor-based) |
| `sweepSubscriptions` | `0 2 * * *` | Expire na-lapse na subscription + 3-day reminder |
| `analyticsRollup` | `30 1 * * *` | Materialize kahapon + refresh dashboard snapshot |
| `housekeepingSweep` | `0 */6 * * *` | Stale reservations, expired shares, orphaned public mirrors |
| `weeklyMetrics` | `0 3 * * 1` | 7-day comparison metrics |
| `quotaRepair` | `15 * * * *` | Ayusin ang nawawalang quota documents |

### HTTP endpoints
| Route | Auth | Ginagawa |
|---|---|---|
| `GET /healthz` | public | Liveness + config presence (walang secrets) |
| `GET /s/{token}` | public | Share landing page na may Open Graph tags |
| `GET /admin/export/{kind}` | Bearer ID token + admin role | CSV export: `users`\|`bookings`\|`subscriptions`\|`photos`\|`ledger` |
| `POST /storeWebhook?platform=stripe\|apple\|google` | signature-verified | ⭐ Store notifications → premium activation |

---

## 6. Premium activation flow

```
Mobile app (StoreKit / Play Billing)
        │  purchase completes
        ▼
verifyPremiumPurchase(productId, transactionId | purchaseToken)
        │
        ├─ iOS  → App Store Server API  (ES256 JWT, /inApps/v1/subscriptions/{id})
        └─ Android → Google Play Developer API (subscriptionsv2/tokens/{token})
        │
        ├── VERIFIED ──► activateSubscription()
        │                   • upsert subscriptions/{platform}_{txnId}
        │                   • setPlan() → users.plan + quotas
        │                   • grantCredits()
        │                   • syncClaims() → bagong premium claim
        │
        └── FAILED ─────► subscriptions/{id} status = "pending"  (manual review)
                          ⚠️  HINDI kailanman nagbibigay ng premium
```

**Fail-closed:** kung walang store credentials (`APPLE_*`, `GOOGLE_PLAY_PACKAGE_NAME`), ang verification ay nabibigo at ang purchase ay naka-`pending` — hindi kailanman naga-activate ng premium base sa hindi ma-verify na receipt.

**Idempotent:** kung ang stored `expiresAt` ay ≥ sa incoming expiry, ang notification ay itinuturing na replay — walang dobleng credits. Kapag renewal (mas huling expiry), nagbibigay ulit ng credits.

**Webhook-only path:** ang `storeWebhook` ang **tanging** unauthenticated endpoint na makakapagbigay ng premium. Ang Stripe ay HMAC-verified (`Stripe-Signature`), ang Apple ay decoded saka muling hinihingi sa authenticated API, ang Google RTDN ay base64-decoded saka nire-verify.

---

## 7. Deployment

### Unang beses
```bash
# 1. Login at pumili ng project
firebase login
firebase use --add            # i-select ang photobooth-app-prod, pangalan: default

# 2. I-install ang dependencies
cd functions && npm install && npm run build && cd ..

# 3. I-deploy ang rules + indexes + storage (UNANG hakbang, palagi)
firebase deploy --only firestore:rules,firestore:indexes,storage

# 4. I-seed ang config, filters, packages (+ ang unang superadmin)
node scripts/seed.mjs --admin=owner@yourbrand.com

# 5. I-deploy ang functions
firebase deploy --only functions

# 6. I-set ang secrets (production)
firebase functions:secrets:set APPLE_PRIVATE_KEY
firebase functions:secrets:set APPLE_KEY_ID
firebase functions:secrets:set APPLE_ISSUER_ID
firebase functions:secrets:set GOOGLE_PLAY_PACKAGE_NAME
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
firebase deploy --only functions
```

### I-verify
```bash
curl https://asia-southeast1-<project>.cloudfunctions.net/healthz
# → { "ok": true, "checks": {...}, "integrations": {...} }
```

### Regular deploys
```bash
firebase deploy --only functions           # lahat
firebase deploy --only functions:adminGetDashboard,functions:getQuota   # pili lang
```

---

## 8. Local emulator

```bash
cd functions && npm run build && cd ..
firebase emulators:start --import=./seed-data --export-on-exit
# UI: http://localhost:4000
# Auth 9099 · Functions 5001 · Firestore 8080 · Storage 9199 · Hosting 5000
```

Sa client, i-point ang app sa emulator:
```javascript
if (__DEV__) { connectAuthEmulator(auth, "http://localhost:9099"); connectFirestoreEmulator(db, "localhost", 8080); connectFunctionsEmulator(functions, "localhost", 5001); connectStorageEmulator(storage, "localhost", 9199); }
```

**Pag-set up ng unang admin sa emulator:**
1. Gumawa ng user sa Auth emulator UI (`owner@test.local` / `password123`).
2. Kunin ang uid, tapos sa Firestore emulator UI: `adminRoles/{uid}` → `{ role: "superadmin", status: "active" }`.
3. I-refresh ang ID token (`refreshClaims`) para makuha ang bagong claims.

---

## 9. Design decisions (bakit ganito)

| Problema | Solusyon |
|---|---|
| Doble ang singil kapag nag-retry ang upload | `idempotencyKeys` + transactional ledger guard sa `spend()` |
| Nag-o-overdraw ang credits sa sabay na capture | Firestore transaction na muling nagbabasa ng balance bago magsulat |
| Naliligaw ang 5/day limit sa timezone | `dayKey`/`monthKey` sa Asia/Manila via `Intl`, hindi UTC |
| Dumodoble ang premium kapag inulit ang webhook | Deterministic doc id + expiry comparison |
| Nag-o-overbook ang slot | Capacity check + increment sa loob ng isang transaction |
| Naba-back ang private photo path | Private path lang ang nasa `photos`; hiwalay na `public/photos/` mirror |
| Sumasabog ang Firestore bill sa analytics | Batched writes (max 25) + allowlist + TTL (180 araw) |
| Nag-leak ng PII sa logs | `redact()` + `hashId()` + `maskEmail()` |
| Sinusubukan ng client na i-self-grant ng admin | Rules deny-by-default + claim **at** live doc na requirement |
| Lumang token ng na-revoke na admin | `revokeRefreshTokens()` + live role check sa bawat callable |

---

## 10. Mga susunod na hakbang

1. I-turn on ang **App Check** (`enforceAppCheck: true` sa `functions/src/index.ts`) pagkatapos i-integrate sa mobile app.
2. Magdagdag ng **log-based metrics** para sa `auth_blocked_suspended`, `purchase_verification_failed`, `quota_exhausted`.
3. I-schedule ang **Firestore backup** (daily, 7-day retention).
4. Magdagdag ng **budget alert** sa GCP para sa Cloud Functions + Firestore.
5. Kapag lumaki na: i-split ang `index.ts` sa codebases (`photos`, `admin`, `payments`) para parallel ang deploys.
