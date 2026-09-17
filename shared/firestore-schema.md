# C2 — Firestore Schema & C3 — Security Rules Contract

Pinagmulan: root `firestore.rules`, `storage.rules`, `firestore.indexes.json`,
`functions/src/models/types.ts`, `functions/src/config/constants.ts` (`COLLECTIONS`,
`STORAGE_PATHS`), at `scripts/seed.mjs`. Ang root Firebase config (backend workstream) ang
canonical — hindi ang mga kopya sa `admin-panel/` o `devops/` (tingnan CONTRACTS.md §Merge).

---

## 1) Mga Collection (20, mula sa `COLLECTIONS`)

### `users/{uid}` — profile + plan *(plan ay server-owned)*
| Field | Tipo | Mga Tala |
|---|---|---|
| `uid`, `email`, `emailVerified`, `phoneNumber`, `displayName`, `photoURL` | identity | Galing sa Auth trigger |
| `plan` | `'free' \| 'premium' \| 'studio'` | **Hindi kayang baguhin ng client** — Cloud Function lang |
| `planSource` | `'signup' \| 'purchase' \| 'admin_grant' \| 'promo'` | Audit ng pinagmulan ng plan |
| `premiumSince`, `premiumUntil` | Timestamp \| null | `null` kapag free |
| `subscriptionId` | string \| null | Link sa `subscriptions` |
| `status` | `'active' \| 'suspended' \| 'deleted'` | Sine-check ng blocking `beforeSignIn` |
| `role` | admin role mirror ng `adminRoles` | Hindi pinagkakatiwalaan para sa auth — ang `adminRoles` doc + claim ang tunay |
| `deviceTokens[]` | array (max 20) | FCM push targets |
| `preferences{}`, `onboarding{}` | map | Client-writable (whitelist lang — tingnan §3) |
| `counters{}` | map | totalPhotosTaken, totalShares, totalExports, totalBookings, lifetimeCreditsSpent |
| `referralCode`, `referredBy` | string | `PB` + 8 chars |
| `createdAt`, `updatedAt`, `lastActiveAt` | Timestamp | |

### `quotas/{uid}` — ⭐ authoritative spendable balance
`creditsRemaining` (free = 150/buwan) · `creditsGranted` · `creditsSpent` · `dailyCount` ·
`dailyLimit` (free=5, premium=500, studio=5000) · `dayKey` / `monthKey` (**Asia/Manila**) ·
`periodStart` / `periodEnd` / `lastResetAt`.
Nababago **lamang sa loob ng Firestore transaction**; ang pagbabago ng `dayKey`/`monthKey` ay
nag-trigger ng daily + monthly rollover (lazy sa read AT sa scheduled `dailyQuotaReset`).

### `quotaLedger/{entryId}` — append-only audit ng bawat kilos ng credit
`uid` · `delta` (±) · `balanceAfter` · `action` · `reason` · `refType`
(`photo|export|booking|purchase|admin|reset|signup`) · `refId` · `monthKey` · `dayKey` · `createdAt`

### `photos/{photoId}` — upload records
| Field | Tipo |
|---|---|
| `uid`, `eventId`, `bookingId` | string \| null |
| `storagePath` | **canonical private Storage path — hindi public URL** |
| `thumbnailPath`, `publicUrl` | string \| null (publicUrl may laman lang kapag `visibility: 'public'`) |
| `filterId`, `filterApplied` | string, boolean |
| `mode` | `'single' \| 'burst' \| 'gif' \| 'strip'` |
| `status` | `'reserved' \| 'processing' \| 'ready' \| 'failed' \| 'deleted'` |
| `visibility` | `'private' \| 'event' \| 'public'` |
| `caption` (max 280), `hashtags[]` | string, array |
| `width`, `height`, `sizeBytes`, `contentType` | number, string |
| `creditsSpent` | number |
| `likes`, `shares`, `views` | number |
| `isFlagged`, `flagReason` | boolean, string \| null (moderation) |
| `createdAt`, `updatedAt`, `deletedAt` | Timestamp |

### `uploadReservations/{reservationId}` — TTL 30 min
`uid` · `photoId` · `storagePath` · `filterId` · `mode` · `visibility` · `eventId` ·
`creditsToSpend` · `status` (`pending|consumed|expired`) · `expiresAt` ← **TTL index**

### `photoShares/{shareId}` — revocable share links
`photoId` · `uid` · `token` · `url` · `channel` (`link|instagram|tiktok|facebook|qr|email`) ·
`expiresAt` (default 168h / max 336h) · `revoked` · `viewCount`

### `filters/{filterId}` — read-all, write-server-only
`name` · `slug` · `description` · `prompt` (para sa Stable Diffusion) · `isPremium` ·
`priceMinorUnits` · `category` (`basic|artistic|utility|seasonal`) · `color` · `sortOrder` · `strength`
10 launch filters ang naka-seed sa `scripts/seed.mjs` — ang 8 premium IDs ay tugma sa
`shared/plan-constants.ts → PREMIUM_FILTER_IDS`.

### `subscriptions/{platform}_{transactionId}` — **server-owned, deterministic ID**
`uid` · `plan` · `platform` (`ios|android|web|manual`) · `productId` · `transactionId` ·
`originalTransactionId` · `status` (`pending|active|in_grace_period|cancelled|expired|refunded`) ·
`autoRenew` · `amountMinorUnits` · `currency` · `receiptHash` · `verifiedAt` · `startedAt` ·
`currentPeriodEnd` · `expiresAt` · `cancelledAt` · `refundedAt`
Ang deterministic doc id (`ios_<transactionId>`) ang pumipigil sa dobleng premium grant
kahit i-replay ang store webhook. Revenue-recognising statuses: `active`, `in_grace_period`,
`cancelled` (`REVENUE_STATUSES`).

### `events/{eventId}` · `eventSlots/{slotId}` · `bookings/{bookingId}`
- `events`: `organizerId` · `title` · `slug` (unique, auto-deduped) · `description` ·
  `coverPath`/`coverUrl` · `venue` · `city` · `status` (`draft|published|ongoing|completed|cancelled`) ·
  `eventDate` · `startTime`/`endTime` · `timezone` · `packageIds[]` · `basePriceMinorUnits` ·
  `currency` · `capacity` · `bookedCount` · `photoCount` · `tags[]` · `isFeatured`
- `eventSlots`: `eventId` · `organizerId` · `label` · `startTime`/`endTime` · `capacity` ·
  `bookedCount` · `priceMinorUnits` · `status` (`draft|open|closed|cancelled`)
- `bookings`: `code` (`PB-XXXXXXXX`, unique) · `uid` · `eventId` · `slotId` · `organizerId` ·
  `packageId` · `guestName`/`guestEmail`/`guestPhone` · `attendees` (max 20) · `addOns[]` ·
  `status` (`pending|confirmed|checked_in|completed|cancelled|no_show|refunded`) ·
  `amountMinorUnits` · `paymentStatus` (`unpaid|paid|refunded|waived`) · `paymentRef` · `photoCount`

### `packages/{packageId}` — B2B booth packages (canonical runtime; seed values)
`pkg_basic` ₱4,990 · `pkg_premium` ₱12,990 · `pkg_wedding` ₱24,990 — may `durationMinutes`,
`photosIncluded`, `printsIncluded`, `includesGif`, `includesPremiumFilters`.
⚠️ Iba ang set na ito sa hardcoded `EVENT_PACKAGES` ng mobile monetization — tingnan D5 sa CONTRACTS.md.

### `adminRoles/{uid}` — **server-owned, pinagmumulan ng katotohanan para sa admin auth**
`uid` · `email` · `role` (`superadmin|admin|support|moderator`) · `status` (`active|revoked`) ·
`notes` · `grantedBy`/`grantedAt` · `revokedBy`/`revokedAt`
Ang custom claim (`token.admin`) ay mabilisang gate lang — ang **bawat** admin callable ay
nagsi-check din ng live na `adminRoles/{uid}.status == 'active'`. Kaya ang pag-revoke ay
epektibo agad kahit may lumang token pa.

### Iba pa
| Collection | Gamit |
|---|---|
| `analytics_events/{id}` | TTL 180 araw; allowlist lang ang pangalan; max 25 params; max 200-char strings |
| `analytics_daily/{YYYY-MM-DD}` | Materialized rollup: `counts.{event}`, `activeUsers`, `newUsers`, `photos`, `revenueMinorUnits`, … |
| `metrics/{overview\|weekly\|rollupState}` | Pre-aggregated dashboards |
| `auditLogs/{id}` | Bawat privileged mutation — sino, kailan, bakit |
| `notifications/{id}` | Admin-sent push |
| `config/{app\|creditCosts\|bookingPolicy\|subscriptionProducts}` | Live-tunable config na binabasa ng client |
| `idempotencyKeys/{key}` | TTL 24h — dedupe ng retry |
| `rateLimits/{uid_action_window}` | Per-UID action rate limiting |
| `payments/{id}` | Payment records (Stripe/manual) |

## 2) Storage path map (mula sa `STORAGE_PATHS` + `storage.rules`)

| Path | Read | Write | Limit |
|---|---|---|---|
| `users/{uid}/photos/{file}` | **owner lang** | owner | ≤ 10 MB · `image/jpeg\|png\|webp\|heic` |
| `users/{uid}/avatars/{file}` | signed-in | owner | ≤ 5 MB · image/* |
| `users/{uid}/exports/{file}` | owner | owner | ≤ 25 MB · image o PDF |
| `events/{eventId}/cover/{file}` | signed-in | signed-in (function-authorized) | ≤ 5 MB |
| `public/photos/{file}` | **public** | **functions lang** (`allow write: if false` sa client) | — |
| `/{allPaths=**}` | ❌ deny | ❌ deny | default |

## 3) C3 — Security Rules contract (deny-by-default)

**Mga patakaran na hindi kayang lampasan ng client:**

1. **Plan/credits/admin ay server-owned.** Ang `users` update ay whitelist lang:
   `['displayName','photoURL','preferences','locale','onboarding','deviceTokens','lastActiveAt']`.
   Hindi kasama ang `plan`, `creditsRemaining`, `role`, `premiumUntil`, `subscriptionId` —
   iwas self-upgrade. `create: if false` (identity trigger ang gumagawa); `delete: if false`.
2. **Admin = claim + live doc.** `isAdmin()` = `token.admin == true` **AT** may
   `adminRoles/{uid}` na `status == 'active'`. `adminRoles` write: `false` sa client.
   Ang `superadmin` ay hiwalay na function (`isSuperAdmin()`).
3. **Premium gate sa read:** `function isPremiumUser()` = `request.auth.token.plan == 'premium'` —
   ang claim ay nire-refresh ng `onSubscriptionWritten` trigger / `refreshClaims` callable.
4. **Quotas, quotaLedger, subscriptions, adminRoles, auditLogs, analytics_events, config:**
   client write = `false` lahat. Read: sarili + admin lang (ang `config/{app}` at
   `filters`/`packages` ay public-read dahil kailangan ng app ang catalogue).
5. **Photos:** create/update/delete sa client = `false` (functions lang — sa pamamagitan ng
   3-step upload protocol na may reservation); read ay depende sa `visibility`.
6. **Storage:** size + MIME limits bawat path (tingnan §2), default deny-all sa dulo.
7. **Idempotency + rate limits** ay server-enforced (mga collection sa itaas), hindi client.

### ⚠️ `makePublic()` audit (Blocker B7 ng master plan)

Nahanap ang **2 sadyang** `makePublic()` sa `functions/src/services/photoService.ts`
(mga linya ~263 at ~430) — PAREHO sa `public/photos/` mirror path lamang, kapag
`visibility === 'public'` o kapag gumawa ng share link. **Wala ito sa private
`users/{uid}/photos/` path.** Kahit papaano, tandaan:

- Ang mga pampublikong copy ay nailalagay sa `public/photos/{photoId}.jpg` (na may
  `write: if false` sa rules — functions lang ang makakasulat doon).
- Mas ligtas na alternatibo kung gusto mong tanggalin ang mirror nang tuluyan: signed
  download URLs o Firebase download tokens (`?alt=media&token=…`) sa `photoShares` doc.
- Desisyon ito ng tao bago mag-prod — hindi ito awtomatikong buburain ng pack na ito
  dahil may sadyang disenyong share-page flow ang backend.
