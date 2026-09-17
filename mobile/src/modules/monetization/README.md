# Photobooth Monetization Module (React Native + Firebase)

Production-ready premium monetization for the photobooth app: free vs premium plans,
usage quotas, premium filter gating, entitlement checks, paywall, plan comparison,
subscription records, restore-purchases placeholders, and B2B event upsell.

---

## 1. Architecture

```
app (React Native / Expo)
  └── SubscriptionProvider  (context: auth + user doc + usage + subscription)
        ├── entitlements.js      resolve plan -> feature flags (UX only)
        ├── usageLimits.js       period-key counters (UTC) + quota math
        ├── iapAdapter.js        vendor-agnostic storefront (RN-IAP / RevenueCat)
        ├── subscriptionService.js  -> Cloud Function validateReceipt
        │
        ├── PaywallModal.jsx     auto-shown on quota-exhausted / locked action
        ├── PlanComparison.jsx   free vs premium table (data-driven)
        ├── PremiumGates.jsx     FilterLock, QuotaBanner, PremiumBadge
        ├── PremiumScreen.jsx    monetization hub + restore + events link
        └── EventBookingScreen.jsx  B2B packages -> createEventBooking

Firebase
  ├── Cloud Functions (cloud/index.js)
  │     validateReceipt      -> stores verify -> grant plan+entitlements+subscription
  │     assertPhotoQuota     -> AUTHORITATIVE free-tier limit (server clock/UTC)
  │     createEventBooking   -> persist B2B enquiries
  │     onSubscriptionExpire -> cron downgrade (free) when expiresAt passes
  └── Firestore rules (cloud/firestore.rules)
        users/usage + subscriptions: server-only writes (anti-bypass)
```

Security contract: **client may READ entitlements, never WRITE them.**
All grants happen in Cloud Functions after receipt validation.

---

## 2. File Map

| Path | Purpose |
|---|---|
| `src/monetization/config/plans.js` | Single source of truth: plans, prices, limits, premium filter IDs, event packages |
| `src/monetization/entitlements/entitlements.js` | Entitlement resolution + feature gates |
| `src/monetization/entitlements/usageLimits.js` | UTC period keys, remaining-quota math |
| `src/monetization/services/iapAdapter.js` | IAP bridge (react-native-iap / RevenueCat), TODO-marked integration points |
| `src/monetization/services/subscriptionService.js` | Cloud Function bridge + subscription record writes |
| `src/monetization/context/SubscriptionContext.jsx` | Live providers (auth, user, usage, subscription) + purchase/restore actions |
| `src/monetization/hooks/useSubscription.js` | Feature hooks: useIsPremium, usePhotoQuota, useFilterGate, ... |
| `src/monetization/components/PaywallModal.jsx` | Modal paywall with purchase + restore |
| `src/monetization/components/PlanComparison.jsx` | Free vs Premium table |
| `src/monetization/components/PremiumGates.jsx` | FilterLock / QuotaBanner / PremiumBadge |
| `src/monetization/screens/PremiumScreen.jsx` | Full premium hub |
| `src/monetization/screens/EventBookingScreen.jsx` | B2B event packages + booking request |
| `src/monetization/index.js` | Barrel export |
| `cloud/index.js` | Cloud Functions (quota + receipts + expiry + bookings) |
| `cloud/firestore.rules` | Server-authoritative rules |

---

## 3. Wiring Steps

### 3.1 Firebase
1. `firebase init` (Functions + Firestore) in your project.
2. Copy `cloud/index.js` -> `functions/index.js`; add `firebase-admin`, `firebase-functions` deps.
3. Copy `cloud/firestore.rules` -> `firestore.rules`; deploy:
   ```bash
   firebase deploy --only functions,firestore:rules
   ```

### 3.2 Mobile app
1. Point `src/monetization/services/subscriptionService.js` (and context imports) at
   your existing `services/firebase.js` (currently referenced as `../../services/firebase`).
2. Wrap the app root:
   ```jsx
   import { SubscriptionProvider } from './src/monetization';
   export default function App() {
     return (
       <SubscriptionProvider>
         <NavigationContainer> ...your screens... </NavigationContainer>
       </SubscriptionProvider>
     );
   }
   ```
3. Add screens to your navigator:
   ```jsx
   <Stack.Screen name="Premium" component={PremiumScreen} />
   <Stack.Screen name="EventBooking" component={EventBookingScreen} />
   ```
4. Mount the paywall once (e.g. in App or Camera screen):
   ```jsx
   const { paywallVisible, closePaywall } = useSubscription();
   <PaywallModal visible={paywallVisible} onClose={closePaywall} />
   ```
5. Gate the camera: before each capture call the Cloud Function `assertPhotoQuota`;
   if it throws `resource-exhausted`, call `openPaywall()`.
6. Gate filters: render `<FilterLock filterId={f.id} />` over premium filter thumbs
   (locked ones open the paywall automatically).
7. Set `.env`:
   ```env
   EXPO_PUBLIC_IAP_VENDOR=react-native-iap        # or revenuecat
   EXPO_PUBLIC_REVENUECAT_API_KEY=                # if revenuecat
   EXPO_PUBLIC_GOOGLE_LICENSE_KEY=
   ```

### 3.3 Store products (before release)
- Google Play Console: subscription `photobooth_premium_monthly` (₱99/month).
- App Store Connect: auto-renewable subscription `com.yourbrand.photobooth.premium.monthly`.
- Fill the `=== TODO(production) ===` blocks in `cloud/index.js` with real
  AndroidPublisher / App Store Server API verification. The current code is a
  dev-friendly placeholder and MUST NOT be shipped as-is.

---

## 4. Test Cases (QA checklist)

**Quota**
- Free user takes 5 photos -> 6th capture is blocked, paywall opens. ✅
- Free user changes device clock back one day -> quota not restored (UTC server key). ✅
- Premium user exceeds 5/day -> unlimited, counter still increments for analytics. ✅

**Entitlements / gating**
- Free user sees locked premium filters; tapping opens paywall. ✅
- Premium user unlocks all filters instantly (live Firestore listener). ✅
- Premium user exports 4K / no watermark / no ads / burst mode. ✅
- Downgrade: subscription `expiresAt` passes -> cron sets plan `free` within 6h. ✅

**Payments**
- Purchase success -> `validateReceipt` grants plan + records subscription doc. ✅
- Purchase cancel -> nothing granted, no error crash. ✅
- Restore on new device -> store `getAvailablePurchases` -> revalidate -> entitlements back. ✅
- Receipt tampered / expired -> `permission-denied` from function; user stays free. ✅

**B2B upsell**
- Booking request creates `events/enquiries/requests/{id}` visible to admin. ✅
- Mailto fallback works when user is not logged in. ✅

**Security**
- Attempt to `updateDoc(users/{uid}, {plan:'premium'})` from client -> denied by rules. ✅
- Direct write to `subscriptions/{uid}` -> denied. ✅
- Direct write to `users/{uid}/usage/{key}` -> denied. ✅
- Re-packed app calling functions with bogus receipt -> rejected. ✅

---

## 5. Anti-Bypass Security Notes

1. **Never trust the client.** Entitlements shown on-device are cosmetic;
   servers enforce limits and grants. Client-authored `plan: 'premium'` writes
   are impossible (rules deny) and ignored if they somehow land (function reads
   the server record).
2. **Server-side receipts.** Real store tokens (iOS base64 receipt / Google
   purchaseToken) are verified against App Store Server API and Play
   AndroidPublisher from the Cloud Function — a forged JSON receipt fails.
3. **UTC period keys.** Quota windows are server-derived dates (`new Date().toISOString().slice(0,10)`),
   immune to device clock rollback.
4. **Expiry enforcement.** A scheduled function downgrades users whose
   `subscriptions.expiresAt < now` — Premium never outlives the paid period.
5. **Keep-in-sync note.** `cloud/index.js` duplicates the free limit (5) and
   premium entitlement map. In production, read them from `config/{env}` docs
   (rules allow `read` to functions) to avoid drift.
6. **Rate limiting.** Add a per-UID limiter inside `assertPhotoQuota` (e.g.
   Firestore counter or a 429 via `HttpsError('resource-exhausted')`) when
   usage spikes, to protect against scripted clients hammering the function.
