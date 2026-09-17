/**
 * ============================================================
 * SUBSCRIPTION SERVICE — client -> Cloud Function bridge.
 *
 * The client NEVER writes `plan`/`entitlements`/`subscriptions` directly.
 * All grant/revoke paths go through the backend callable
 * `verifyPremiumPurchase`, which is the single server-side gate that
 * finally authorises a plan and stamps the `subscriptions` record.
 *
 * Fixed here (QA findings F-2 + F-3 + forbidden client write):
 *   • the Functions instance is now the region-pinned one from the mobile core
 *     (`asia-southeast1`), not `getFunctions()` (which defaults to us-central1)
 *   • the callable name is `verifyPremiumPurchase` — the assembled backend has
 *     no `validateReceipt`
 *   • the payload matches the backend contract (`platform` is `ios|android|web`,
 *     plus `productId` and `transactionId`/`purchaseToken`)
 *   • the client-side `setDoc('subscriptions/{uid}')` mirror is DELETED — rules
 *     set `allow write: if false` there, so it could only ever fail
 * ============================================================
 */

import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, auth, functions } from '../../services/firebase';

/** Map store-vendor names used by the paywall to the backend's platform enum. */
const PLATFORM_TO_BACKEND = {
  apple: 'ios',
  ios: 'ios',
  google: 'android',
  android: 'android',
  web: 'web',
};

function callVerifyPremiumPurchase(payload) {
  const fn = httpsCallable(functions, 'verifyPremiumPurchase');
  return fn(payload).then((res) => res.data);
}

/**
 * Client hook: subscribe to the live subscription record of the
 * current user. Read-only — the document is written by the server.
 */
export function watchSubscription(uid, onChange) {
  if (!uid) {
    onChange(null);
    return () => {};
  }
  return onSnapshot(doc(db, 'subscriptions', uid), (snap) => {
    onChange(snap.exists() ? snap.data() : null);
  });
}

/**
 * Send the store transaction (iOS transaction id / Android purchase token) to
 * the server for validation. The server verifies with Apple/Google and grants
 * the plan itself; the client only learns the outcome.
 *
 * @param {{ receipt?: object, platform?: string, productId?: string,
 *           transactionId?: string, purchaseToken?: string }} params
 */
export async function verifyPremiumPurchase({
  receipt,
  platform = 'android',
  productId,
  transactionId,
  purchaseToken,
}) {
  const backendPlatform = PLATFORM_TO_BACKEND[platform] || 'android';

  // The store SDK hands back the raw transaction object; pull the identifier the
  // backend needs out of it when the caller did not pass one explicitly.
  const resolvedTransactionId =
    transactionId ||
    receipt?.transactionId ||
    receipt?.originalTransactionId ||
    receipt?.transactionReceipt ||
    undefined;
  const resolvedPurchaseToken = purchaseToken || receipt?.purchaseToken || receipt?.dataAndroid || undefined;

  if (backendPlatform === 'ios' && !resolvedTransactionId) {
    return { verified: false, reason: 'missing_transaction_id', plan: null };
  }
  if (backendPlatform === 'android' && !resolvedPurchaseToken) {
    return { verified: false, reason: 'missing_purchase_token', plan: null };
  }

  return callVerifyPremiumPurchase({
    platform: backendPlatform,
    productId,
    ...(resolvedTransactionId ? { transactionId: resolvedTransactionId } : {}),
    ...(resolvedPurchaseToken ? { purchaseToken: resolvedPurchaseToken } : {}),
  });
}

/**
 * Legacy alias kept for the module barrel. `validateReceipt` never existed as a
 * backend callable — it now simply forwards to `verifyPremiumPurchase`.
 * @deprecated use verifyPremiumPurchase
 */
export const validateReceipt = verifyPremiumPurchase;

/**
 * Wrapper used by the paywall after a successful store purchase.
 *
 * There is NO client-side Firestore write here: `subscriptions` is server-owned
 * (`allow write: if false`), and the entitlement is granted only by the
 * verification call above.
 */
export async function activatePremium({ uid: _uid, platform, receipt, productId, transactionId, purchaseToken }) {
  return verifyPremiumPurchase({ platform, receipt, productId, transactionId, purchaseToken });
}

/** Current user UID helper (null-safe). */
export function currentUid() {
  return auth.currentUser?.uid || null;
}