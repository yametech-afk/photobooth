/**
 * Bridge shim — the monetization module ships expecting a local
 * `services/firebase` file ("point to your app's firebase.js"). The monorepo
 * keeps ONE Firebase bootstrap (mobile core `src/services/firebase.ts`), so
 * this simply re-exports it. Both `src/monetization/context/SubscriptionContext.jsx`
 * and `src/monetization/services/subscriptionService.js` resolve their
 * `db`/`auth`/`functions` imports here — this is the only file added to the module.
 *
 * `functions` is the region-pinned instance (`asia-southeast1`) exported by the
 * mobile core. Never call `getFunctions()` without a region inside this module:
 * the default is us-central1 and every callable would 404 on a real project
 * (QA finding F-2).
 */
export {
  auth,
  db,
  storage,
  functions,
  FUNCTIONS_REGION,
  firebaseApp as default,
} from '../../../../services/firebase';