# 📐 shared/ — Single Source of Truth (Contracts C1–C7)

Ang folder na ito ang **tanging pinagmumukan ng katotohanan** para sa mga constants, schemas,
event names, route params, at callable contracts na ginagamit ng `mobile/`, `admin-panel/`, at
`functions/`. Nakabatay ang LAHAT ng value dito sa aktwal na assembled code ng monorepo v3
(hindi imbensyon) — ang bawat file ay may nakalistang source kung saan nanggaling.

## 📁 Laman

| File | Contract | Nilalaman | Machine-importable |
|---|---|---|---|
| [`plan-constants.ts`](./plan-constants.ts) | **C6** | Plans, prices (centavos), credit costs, premium filter IDs, IAP product IDs, event packages | ✅ TypeScript |
| [`analytics-events.ts`](./analytics-events.ts) | **C5** | Analytics event catalog (49-event backend allowlist + C5 legacy mapping + param rules) | ✅ TypeScript |
| [`routes.ts`](./routes.ts) | **C-route** | Navigation param lists (AuthStack, MainTab, MainStack) — canonical route registry | ✅ TypeScript |
| [`callables.ts`](./callables.ts) | **C-data** | Cloud Functions callable registry (79 na verified na pangalan) + request/result shapes + upload protocol | ✅ TypeScript |
| [`env-contract.md`](./env-contract.md) | **C1** | Firebase config + env var matrix (mobile `EXPO_PUBLIC_*`, admin `VITE_*`, functions secrets) | 📄 doc |
| [`firestore-schema.md`](./firestore-schema.md) | **C2 + C3** | 20 Firestore collections, storage path map, security-rules contract (deny-by-default) | 📄 doc |
| [`CONTRACTS.md`](./CONTRACTS.md) | **C1–C7** | Master contracts doc + **drift register D1–D5** + merge guidance (alin ang ide-delete/re-point) | 📄 doc |

## 📏 Mga Tuntunin ng Paggamit

1. **Bawal mag-hard-code.** Kapag kailangan ng price, quota, filter ID, event name, o region —
   import mula dito. Bawal ang kopyang constants sa loob ng `mobile/`, `admin-panel/`, o `functions/`.
2. **Isang direksyon ang pagbabago:** dito muna, tapos i-propagate. Ang `functions/` ang
   *authoritative runtime* (may security rules), pero dito mo muna ine-edit para makita ng
   lahat ng workstream ang pagbabago sa iisang diff.
3. **TypeScript ang format** para pwedeng i-copy/i-import nang direkta ng mobile at
   i-port (remove types) ng admin panel (JS). Walang runtime dependency sa Firebase —
   puro constants at types, kaya safe sa lahat ng bundler.
4. **Pag may drift na natuklasan:** idagdag sa `CONTRACTS.md` § Drift Register bago ayusin —
   huwag agad magbago nang tahimik.

## 🔎 Pinagmulan ng mga Value (audit trail)

| Value group | Nakuha mula sa (aktwal na file sa monorepo v3) |
|---|---|
| Plans, prices, IAP product IDs, premium filter IDs | `mobile/src/modules/monetization/src/monetization/config/plans.js`, `functions/src/config/constants.ts` |
| Credit costs, admin roles, limits, region, timezone | `functions/src/config/constants.ts` |
| Filter catalog (12 entries) | `mobile/src/modules/camera/filters/filterCatalog.ts` |
| Analytics allowlist (49 events) | `functions/src/config/constants.ts` → `ANALYTICS_EVENT_ALLOWLIST` |
| Legacy C5 event names + north star metric | `docs/photobooth-master-assembly-plan.md` §3 (C5) |
| Route param lists | `mobile/src/navigation/types.ts`, `mobile/src/modules/preview-editor/navigation/types.ts` |
| Callable names (79) | `grep` sa `functions/src/callables/*.ts` + `functions/src/http/endpoints.ts` |
| 3-step upload protocol | `mobile/src/modules/camera/services/uploadHandoff.ts` ↔ `functions/src/callables/photos.ts` |
| Env vars | `mobile/.env.example`, `admin-panel/.env.example`, `functions/.env.example`, `mobile/src/config/env.ts`, `admin-panel/src/services/firebase.js` |
| Collections, storage paths, rules | `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `functions/src/models/types.ts` |

> ⚠️ Ang `shared/` na ito ang sinasabing "empty placeholder" sa `README.md` at `MERGE_NOTES.md`
> ng v3 — sa v4, dito na nakalagay ang tunay na contracts. Kung magkakontradiksiya ang luma
> na doc sa folder na ito, **ang folder na ito ang dapat sundan**.
