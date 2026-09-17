# 📦 Photobooth App — Master Assembly Map
**Owner:** Photobooth App (React Native + Firebase) · **Simula:** Sep 15, 2026 · **Assembly date:** Sep 16, 2026
**Layunin:** Pagsamahin ang lahat ng output ng mga workstream agents para matapos ang app nang walang ambiguity.

---

## 1) Current Status — Ano ang mayroon tayo ngayon (honest audit)

| # | Workstream | Agent Project | State |
|---|------------|---------------|-------|
| 1 | Planning/Architecture (parent) | df72aee0-3a15-4cce-9bb2-ce66ea07f68b | ✅ Specs complete (architecture, schemas, admin panel code, deployment guide) |
| 2 | Mobile Core (React Native + Expo) | 2147bfda-3471-4305-9e07-8c028a917d2e | 🟡 Nakagawa — **hindi pa verified** na kumpleto |
| 3 | Camera + AI Filters | 5a8c4c8d-3767-40dc-890a-4f6867b287c0 | 🟡 Nakagawa — **hindi pa verified** |
| 4 | Firebase Backend (Cloud Functions) | b35cc687-795e-4289-bb17-9661b1f24c93 | 🟡 Nakagawa — **hindi pa verified** |
| 5 | Admin Panel (React + MUI) | 0587b3f0-2ac5-43ee-9475-3432f9ded1c0 | 🟡 Nakagawa — **hindi pa verified** |
| 6 | Photo Preview/Editor + Gallery | 3995e046-862a-4482-b353-6343d70c1bff | 🟡 Nakagawa — **hindi pa verified** |
| 7 | Premium Monetization / IAP | c78acafd-5467-4b11-876f-e39befdaf35f | 🟡 Nakagawa — **hindi pa verified** |
| 8 | QA & Test Automation | 674d9a03-f545-4d0f-918c-af9d0d998a98 | 🟡 Nakagawa — **hindi pa verified** |
| 9 | DevOps / CI-CD / Deployment | 3bdaca25-3ad2-4621-ac5c-52e559fe9726 | 🟡 Nakagawa — **hindi pa verified** |
| 10 | Growth & Analytics | c391d7d5-6fbc-4c22-9f5c-cefbc8d89d30 | ✅ May kumpirmadong output artifact (growth funnel architecture) |

**Katotohanan:** Ang mga unang 4 na agents (Mobile Core, Camera/AI, QA, DevOps) ay na-interrupt habang tumatakbo — may partial/near-complete output sila kaya HINDI uulitin nang bagong run; i-review muna. Walang kahit isang workstream ang may **verified, kumpletong final code artifact** — ang mga digest ay naka-base sa specs. Ito ang unang aayusin ng plan na ito.

---

## 2) Monorepo Structure (canonical — dito papasok ang lahat ng module outputs)

```
photobooth-monorepo/
├── mobile/                          # React Native (Expo) — Workstreams 2, 3, 6, 7
│   ├── src/
│   │   ├── screens/                 # Camera, Preview/Editor, Gallery, Premium, Events, Auth
│   │   ├── components/              # FilterPicker, ARStickerOverlay, PhotoStrip, GradientButton
│   │   ├── services/
│   │   │   ├── firebase.js          # SHARED CONTRACT C1
│   │   │   ├── aiFilters.js         # SHARED CONTRACT C4
│   │   │   ├── analytics.js         # SHARED CONTRACT C5
│   │   │   └── payments.js          # SHARED CONTRACT C6
│   │   ├── contexts/                # AuthContext, PhotoContext
│   │   └── utils/constants.js       # SHARED CONTRACT C7 (design system)
│   ├── .env                         # EXPO_PUBLIC_* vars
│   ├── eas.json
│   └── app.json
├── admin-panel/                     # React + Material UI — Workstream 5
│   ├── src/
│   │   ├── pages/                   # Login, Dashboard, Users, Photos, Filters, Revenue, Events
│   │   ├── firebase/config.js       # REACT_APP_* vars
│   │   └── services/
│   └── .env
├── functions/                       # Firebase Cloud Functions — Workstream 4
│   └── src/index.js                 # uploadPhoto, activatePremium, onUserCreate, onPhotoDelete
├── shared/                          # ⚠️ BAGONG folder — dito ilalagay ang shared contracts
│   ├── firestore-schema.md          # C2
│   ├── analytics-events.js          # C5 (pareho sa mobile at admin)
│   └── plan-constants.js            # C6 (quota, prices)
├── firestore.rules                  # C3
├── firestore.indexes.json
├── storage.rules
├── firebase.json
├── .firebaserc
└── README.md
```

**Tuntunin:** Bawat agent output ay dapat i-copy sa kanya-langang folder sa itaas — bawal mag-imbento ng bagong file na wala sa structure na ito. Ang `shared/` ay ang tanging mapagkukunan ng mga constants para sa mobile, admin, at functions.

---

## 3) Shared Contracts (C1–C7) — Ang pinakamahalagang bahagi

### C1 — Firebase Config (mobile)
`initializeApp` + `initializeAuth` with `getReactNativePersistence(AsyncStorage)`; exports `{ app, auth, db, storage }`. Admin panel: parehong config pero `REACT_APP_` prefix.

### C2 — Firestore Schema (5 collections + admins)
| Collection | Key fields |
|---|---|
| `users/{uid}` | email, displayName, plan (`free`/`premium`), creditsRemaining (default 5), totalPhotosTaken, createdAt |
| `photos/{photoId}` | photoId, uid, url, filterId, eventId, isPublic, likes, shares, createdAt |
| `filters/{filterId}` | name, description, prompt (para sa Stable Diffusion), isPremium, price, category |
| `subscriptions/{uid}` | uid, subscriptionId, platform (ios/android/web), status, amount, createdAt, expiresAt |
| `events/{eventId}` | organizerId, title, status, eventDate, photoCount, lastPhotoAt |
| `admins/{uid}` | name, email, role (`admin`/`superadmin`) — para sa admin panel login |

### C3 — Security Rules contract
- `users`: owner-only read/write; **bawal** sa user ang magpalit ng sariling `plan` (Cloud Function lang).
- `photos`: public read kung `isPublic == true`, otherwise owner-only; write ay dapat may matching uid.
- `filters`: read-all, write-false (admin-only via console).
- `analytics`, `subscriptions`, `admins`: server-only (client write-false).
- Storage: `photos/{uid}/{file}` — owner-only write, max 10MB, `image/*` content type lang.
- ⚠️ **I-delete ang `file.makePublic()` sa uploadPhoto Cloud Function** — lumalabag sa rules contract. Gumamit ng signed download URLs o download token instead.

### C4 — AI Filter Service contract
`processPhoto(photoUri, filterId) → Promise<string(fileUri)>` · 8 filters: anime, cyberpunk, vintage, oil-painting, pop-art, watercolor, sketch, pixel-art. Cloud path: Replicate API (may API key); fallback: local processing. ⚠️**Tingnan ang Blocker B4 tungkol sa cost.**

### C5 — Analytics Events contract (galing sa Growth Agent artifact)
```
photo_captured {filter, mode} · photo_shared {platform, photo_id} ·
filter_purchased {filter_id, value, currency: 'PHP'} · event_booked {event_id, package_type} ·
premium_upgrade {plan, duration} · onboarding_complete {steps_count} ·
paywall_view · subscription_start · referral_credited · print_ordered · template_used
```
North star metric (mismo mula sa artifact): **"weekly paying moments"** — paid photos + prints + subscriptions + confirmed event bookings. GA4 → BigQuery → Looker Studio + admin panel.

### C6 — Monetization contract
- Free tier: 5 credits/day, basic filters, may watermark, may ads.
- Premium (₱99/month): unlimited photos, lahat ng AI/AR filters, walang watermark, 4K, ad-free.
- Bawal ang premium na digital feature na hindi dumaan sa IAP (tingnan B5). Dapat gumamit ng RevenueCat o native IAP — **hindi** Stripe in-app para sa digital goods.
- `activatePremium(subscriptionId, platform)` Cloud Function lang ang maaaring mag-set ng `plan: 'premium'` sa `users`.

### C7 — Design system contract
Colors: primary `#FF4DA6`, secondary `#00BCD4`, background `#0A0A1F`, gradient `['#FF4DA6','#7B61FF','#00BCD4']`. Fonts: Poppins family. Components: GradientButton, FilterPicker, PhotoStrip. Lahat ng screens dapat gumamit ng constants na ito — bawal hard-coded colors.

---

## 4) Integration Sequence & Merge Order

**Prinsipyo:** Shared contracts muna, pagkatapos core flow, pagkatapos periphery, pagkatapos release.

| Order | Merge | Ano ang pinagbubuklod | Output ng merge |
|---|---|---|---|
| M0 | `shared/` + Firebase project setup | C1–C7 files, rules, indexes | Buildable empty monorepo, emulators tumatakbo |
| M1 | **Mobile Core** + Backend Functions | Auth flow ↔ `onUserCreate`; Firebase config C1 | Pwedeng mag-signup/login at magkaroon ng user doc |
| M2 | **Camera + AI Filters** + **Preview/Gallery** | `processPhoto` C4 + upload flow | Kumuha → mag-apply ng filter → i-upload → makita sa gallery (end-to-end core flow) |
| M3 | **Firebase Backend** photo pipeline + Storage rules | C2/C3 — quota decrement, photo doc, delete trigger | Upload may tamang quota at security |
| M4 | **Admin Panel** | C2 schema live — Users, Filters CRUD, Revenue | Kita sa dashboard ang totoong data mula M1–M3 |
| M5 | **Premium Monetization** | C6 — IAP/RevenueCat ↔ `activatePremium` ↔ admin Revenue page | Pwedeng mag-subscribe at mag-upgrade ang user |
| M6 | **Growth/Analytics** | C5 events sa lahat ng touchpoints | Kumpleto ang funnel data sa BigQuery/Looker |
| M7 | **QA** — full regression sa merged app | Test suite laban sa buong app, hindi per-module | Green test run |
| M8 | **DevOps** — EAS build + Firebase deploy + store submission | Production build + release checklist | App live sa stores |

---

## 5) Acceptance Criteria (bawat module, measurable)

| Module | Acceptance criteria |
|---|---|
| Mobile Core | `npx expo start` tumatakbo; signup/login/logout gumagana; user doc nagagawa sa Firestore; walang lint/type errors |
| Camera + AI | Front/back camera gumagana; single + 4-burst capture; ≥8 filters nag-a-apply; haptic feedback; permission handling |
| Preview/Gallery | Retake/edit/save; photo strip layout; share sheet gumagana; gallery naglo-load ng Firestore photos |
| Backend | `uploadPhoto` naka-validate (auth, 10MB limit, quota); rules test pass; delete trigger naglilinis ng Storage |
| Admin | Admin login may role check; Users/Filters/Revenue pages may totoong data; walang client-side na plan toggle na lumalabag sa C3 |
| Premium | Test subscription sa sandbox accounts (iOS) at test track (Android); paywall visible; plan update server-side lang |
| Analytics | Lahat ng C5 events nasa DebugView; north star dashboard kumpleto |
| QA | Unit + integration tests green; regression checklist 100% pass; 2 test devices minimum |
| DevOps | `eas build` production bundle OK; `firebase deploy` OK; staging/prod projects hiwalay |

---

## 6) Blocker Log (aktwal na harang, may solusyon)

| ID | Blocker | Impact | Solusyon / Owner |
|---|---|---|---|
| B1 | 4 na agents na-interrupt; walang verified final code artifact | Hindi pa masasabing "tapos" ang kahit isang module | I-open ang bawat agent project link, i-export ang code sa monorepo (Owner: user + master agent, M0) |
| B2 | Generated code naka-Expo SDK ~50 / RN 0.73 — luma na | Hindi recommended i-launch sa lumang SDK | I-upgrade sa **Expo SDK 57 (RN 0.86)** — pinakabagong stable bago ang assembly na ito [Expo SDK](https://docs.expo.dev/versions/latest/) · [npm expo](https://www.npmjs.com/package/expo) (Owner: Mobile Core merge, M1) |
| B3 | **Firebase Storage kailangan na ang Blaze plan** simula Feb 3, 2026 — kahit maliit na volume | Photo-heavy app = storage + egress cost | Blaze plan + budget alert sa Firebase console; i-cache ang filtered images sa CDN [Firebase pricing](https://firebase.google.com/pricing) · [Spark vs Blaze 2026](https://dev.to/androve2k/spark-vs-blaze-the-firebase-pricing-guide-i-wish-id-read-sooner-onb) (Owner: DevOps, M0) |
| B4 | AI filter inference (Replicate/Stable Diffusion): may bayad kada image + latency (polling loop) | Cost leak + mahabang wait sa user | I-cache ang result per (photo, filter); free tier limit 5/day; i-show ang progress UI; local fallback filter para sa free users (Owner: AI workstream, M2) |
| B5 | **Apple rule:** digital filters/premium features ay dapat IAP/auto-renewable subscription — bawal Stripe in-app para sa digital goods | Rejection risk sa App Store review [Apple Guidelines](https://developer.apple.com/app-store/review/guidelines/) | Gumamit ng **RevenueCat** (abstracts StoreKit 2 + Billing, free analytics hanggang $2,500 MTR) [RevenueCat vs native IAP 2026](https://www.misar.blog/compare/revenuecat-vs-native-iap) (Owner: Premium, M5) |
| B6 | Play Store at App Store: kailangan ang privacy policy na naa-access sa app + sa store listing; camera/photo permission disclosures na malinaw | Rejection risk [Play User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en) | Isulat ang privacy policy (photo upload, AI processing disclosure); i-verify ang InfoPlist strings at Android permissions (Owner: user + DevOps, M8) |
| B7 | Generated `makePublic()` sa upload — security hole | Public ang lahat ng private photos | Palitan ng signed URL / download token; i-align sa C3 (Owner: Backend, M3) |
| B8 | Revenue placeholder sa Dashboard (random na values) | Maling business data sa admin | I-source ang revenue sa `subscriptions` collection lang (Owner: Admin, M4) |

---

## 7) Dated Roadmap — mula ngayon hanggang launch

| Petsa | Milestone | Gate bago umusad |
|---|---|---|
| **Sep 16–17 (M0–M1)** | I-export ang lahat ng agent outputs → monorepo; `shared/` contracts; Firebase proj + Blaze; Expo SDK 57 upgrade; auth end-to-end | Login + user doc gumagana sa emulator |
| **Sep 18–20 (M2–M3)** | Camera → filter → upload → gallery end-to-end; rules fix (B7); quota logic | Core flow pass sa 2 devices |
| **Sep 21–23 (M4)** | Admin panel deploy sa Hosting; totoong data; filters CRUD | Dashboard = totoong numbers |
| **Sep 24–26 (M5)** | RevenueCat + IAP products sa App Store Connect/Play Console; `activatePremium` hardening | Test purchase gumagana sa sandbox |
| **Sep 27–28 (M6)** | Analytics events sa lahat ng touchpoints; BigQuery + Looker | Lahat ng C5 events nasa DebugView |
| **Sep 29–Oct 1 (M7)** | QA full regression + device matrix + performance | QA gate: 100% pass |
| **Oct 2–5 (M8)** | EAS production builds; privacy policy; store listings + screenshots; internal testing track | Internal test OK |
| **Oct 6–13** | External testing / TestFlight; feedback fixes | Crash-free ≥ 99% |
| **Oct 14–16** | **Store submission + LAUNCH** 🚀 | Approved + live |

---

## 8) Final Launch Checklist

- [ ] Production Firebase project + Blaze + budget alert (B3)
- [ ] Lahat ng module code naka-merge sa monorepo, walang orphan files
- [ ] `shared/` contracts C1–C7 — walang duplicate constants
- [ ] Security rules deployed; walang `makePublic()`; plan change server-side lang (B7)
- [ ] Expo SDK 57 / RN 0.86 — no downgrade (B2)
- [ ] Auth: Email + Google (+Apple Sign-In sa iOS)
- [ ] AI cache + quota live (B4); walang per-image cost leak
- [ ] RevenueCat subscriptions: monthly ₱99 configured sa parehong stores (B5)
- [ ] Privacy policy URL live + naka-link sa app at stores (B6)
- [ ] Camera/photo permission strings na malinaw sa Tagalog/English
- [ ] Admin panel live sa Firebase Hosting, `admins/{uid}` doc existing
- [ ] EAS production build (Android AAB + iOS IPA) — internal test pass
- [ ] QA regression 100% green sa 2+ devices kada platform
- [ ] Crash reporting (Sentry/Crashlytics) naka-on
- [ ] Store listings: screenshots, description, category, ratings questionnaire
- [ ] App Store submission + Play Console submission

---

## 9) Agent Project Links (i-review at i-export bago mag-merge)

- [Planning/Architecture (parent)](https://www.genspark.ai/agents?id=df72aee0-3a15-4cce-9bb2-ce66ea07f68b)
- [Mobile Core](https://www.genspark.ai/agents?id=2147bfda-3471-4305-9e07-8c028a917d2e)
- [Camera + AI Filters](https://www.genspark.ai/agents?id=5a8c4c8d-3767-40dc-890a-4f6867b287c0)
- [Firebase Backend](https://www.genspark.ai/agents?id=b35cc687-795e-4289-bb17-9661b1f24c93)
- [Admin Panel](https://www.genspark.ai/agents?id=0587b3f0-2ac5-43ee-9475-3432f9ded1c0)
- [Photo Preview/Editor + Gallery](https://www.genspark.ai/agents?id=3995e046-862a-4482-b353-6343d70c1bff)
- [Premium Monetization](https://www.genspark.ai/agents?id=c78acafd-5467-4b11-876f-e39befdaf35f)
- [QA & Test Automation](https://www.genspark.ai/agents?id=674d9a03-f545-4d0f-918c-af9d0d998a98)
- [DevOps / CI-CD](https://www.genspark.ai/agents?id=3bdaca25-3ad2-4621-ac5c-52e559fe9726)
- [Growth & Analytics](https://www.genspark.ai/agents?id=c391d7d5-6fbc-4c22-9f5c-cefbc8d89d30)
