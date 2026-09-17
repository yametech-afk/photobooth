# C1 — Firebase Config & Environment Contract

Ang C1 ang nagtuturok ng tatlong app (mobile, admin-panel, functions) sa iisang Firebase
project **nang hindi nagbabahagi ng mga secret**. Ang mga env var name sa ibaba ay galing
mismo sa mga `.env.example` files at config readers ng assembled v3 monorepo.

---

## 1) Firebase bootstrap pattern (mobile — TypeScript)

Source: `mobile/src/services/firebase.ts`

```ts
initializeApp(env.firebase)                       // env mula sa src/config/env.ts
initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })
getFirestore(app); getStorage(app)
// exports: { firebaseApp, auth, db, storage }
```

- Fail-fast: kapag may kulang na key, nagwa-warn agad (`isFirebaseConfigured` check sa
  `mobile/src/config/env.ts` — placeholder = nagsisimula sa `your_` o `REPLACE`).
- `initializeAuth` ay naka-try/catch — bumabaling sa `getAuth(app)` sa Fast Refresh.

## 2) Firebase bootstrap pattern (admin-panel — JS, Vite)

Source: `admin-panel/src/services/firebase.js`

- **Isang file lang** ang humahawak ng Firebase SDK sa admin — bawal mag-`import 'firebase/*'`
  mula sa pages nang direkta; lahat ay dumadaan sa `services/firebase.js` + `dataAdapter.js`.
- Kapag walang config (`isConfigured === false`), ang data adapters ay bumabaling sa seeded
  mock data (demo mode) — kaya render pa rin ang lahat ng screens habang walang totoong project.
- Admin login: **custom claim muna** (`token.claims.role` / `token.admin`), tapos fallback sa
  `admins/{uid}` doc — kapag wala dalawa, force sign-out (`'You do not have admin privileges.'`).

## 3) Env var matrix (canonical names)

| Purpose | Mobile (`mobile/.env`) | Admin (`admin-panel/.env`) | Functions (`functions/.env` / secrets) |
|---|---|---|---|
| API key | `EXPO_PUBLIC_FIREBASE_API_KEY` | `VITE_FIREBASE_API_KEY` | — (ADC) |
| Auth domain | `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | `VITE_FIREBASE_AUTH_DOMAIN` | — |
| Project ID | `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | `VITE_FIREBASE_PROJECT_ID` | `GCLOUD_PROJECT` |
| Storage bucket | `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | `VITE_FIREBASE_STORAGE_BUCKET` | `STORAGE_BUCKET` |
| Messaging sender ID | `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `VITE_FIREBASE_MESSAGING_SENDER_ID` | — |
| App ID | `EXPO_PUBLIC_FIREBASE_APP_ID` | `VITE_FIREBASE_APP_ID` | — |
| AI filters (Replicate) | `EXPO_PUBLIC_REPLICATE_API_KEY` *(optional — kapag empty, local fallback filters ang gagamitin)* | — | `REPLICATE_API_KEY` (kung ipapasa sa Functions ang inference — recommended bago mag-public launch) |

> ⚠️ **Doc drift (D-doc):** ang root `README.md` at master plan ay nakasulat pang `REACT_APP_*`
> para sa admin panel — pero ang aktwal na admin code ay **Vite**, kaya `VITE_*` ang tama.
> Ang matrix sa itaas ang sundan, hindi ang lumang README.

### Functions-only secrets (server-side, `firebase functions:secrets:set`)

Galing sa `functions/.env.example` — **kailanman hindi isasama sa client build:**

| Secret | Layunin | Kapag kulang |
|---|---|---|
| `APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_BUNDLE_ID`, `APPLE_ENVIRONMENT` | App Store Server API verification ng iOS receipts | Fail-CLOSED: purchase ang napupunta sa `pending` para sa manual review — hindi nag-grant ng premium |
| `GOOGLE_PLAY_PACKAGE_NAME` | Play Developer API verification + RTDN package-name validation | Parehong fail-closed na ugali |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Web verification + pag-verify ng `Stripe-Signature` sa `POST /storeWebhook?platform=stripe` | Webhook ay tinatanggihan |
| `REPLICATE_API_KEY` | AI filter inference (o proxy) server-side | Cloud AI naka-off |

### Mga patakaran ng secrets

1. **Public-by-design** ang Firebase web API keys (naka-embed sa bundle) — ang tunay na
   seguridad ay nasa Security Rules + App Check + server-side authorization, hindi sa key.
2. **Server-only**: lahat ng nasa functions table sa itaas. Nasa `.gitignore` ang `.env`,
   `google-services.json`, `GoogleService-Info.plist`, `*.keystore`, `*serviceAccount*.json`.
3. **Runtime na nagbabasa:** `mobile/src/config/env.ts` (Expo inlines sa build time) at
   `import.meta.env` sa admin (Vite). Hindi sapat ang pagpapalit ng `.env` pagkatapos ng build —
   kailangan ng rebuild.
4. **Region contract:** ang bawat `getFunctions(app, REGION)` client call ay dapat naka-pin sa
   `asia-southeast1` (`shared/plan-constants.ts → FUNCTIONS_REGION`) — pinatutunayan ng QA
   contract test (`functionsContract.test.js`). Tingnan din ang drift D3 sa CONTRACTS.md.
