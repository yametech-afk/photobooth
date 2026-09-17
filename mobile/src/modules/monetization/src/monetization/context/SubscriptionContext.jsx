/**
 * ============================================================
 * SUBSCRIPTION CONTEXT — single provider that wires:
 *   - auth user doc        (plan + entitlements, from Firestore)
 *   - usage counters       (period-keyed, live)
 *   - IAP storefront setup
 *   - purchase / restore helpers
 *   - paywall open state
 *
 * Usage counters are stored in Firestore under
 * `users/{uid}/usage/{periodKey}` so they reset automatically
 * when the period key rolls over (e.g. new day / new month).
 * ============================================================
 */

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { resolveEntitlements } from '../entitlements/entitlements';
import { USAGE_LIMITS, PLANS } from '../config/plans';
import { getCurrentPeriodKey, getRemainingPhotos } from '../entitlements/usageLimits';
import {
  setupStorefront,
  purchasePremium,
  restorePurchases,
} from '../services/iapAdapter';
import { activatePremium } from '../services/subscriptionService';

const SubscriptionContext = createContext(null);

export function SubscriptionProvider({ children }) {
  const [uid, setUid] = useState(null);
  const [userDoc, setUserDoc] = useState(null);   // users/{uid}
  const [usage, setUsage] = useState(null);       // users/{uid}/usage
  const [subscription, setSubscription] = useState(null); // subscriptions/{uid}
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState(null);

  // 1) Track auth state
  useEffect(() => onAuthStateChanged(auth, (u) => setUid(u?.uid || null)), []);

  // 2) Live user doc (plan + entitlements)
  useEffect(() => {
    if (!uid) return setUserDoc(null);
    return onSnapshot(doc(db, 'users', uid), (snap) =>
      setUserDoc(snap.exists() ? snap.data() : null)
    );
  }, [uid]);

  // 3) Live usage counters for the current period
  useEffect(() => {
    if (!uid) return setUsage(null);
    const key = getCurrentPeriodKey('day');
    return onSnapshot(doc(db, 'users', uid, 'usage', key), (snap) => {
      setUsage((prev) => ({ ...prev, [key]: snap.exists() ? snap.data() : { photoCount: 0 } }));
    });
  }, [uid]);

  // 4) Live subscription record
  useEffect(() => {
    if (!uid) return setSubscription(null);
    return onSnapshot(doc(db, 'subscriptions', uid), (snap) =>
      setSubscription(snap.exists() ? snap.data() : null)
    );
  }, [uid]);

  // 5) Bring up the storefront once the user is authenticated
  useEffect(() => {
    if (uid) setupStorefront().catch(() => {});
  }, [uid]);

  const entitlements = useMemo(() => resolveEntitlements(userDoc), [userDoc]);

  // Derived premium flag — PremiumScreen/PaywallModal read `isPremium` from this
  // context; without it the screens could never render the active-subscription
  // state (the property was missing from the context value).
  const isPremium = entitlements.premium === true;

  const remaining = useMemo(
    () => getRemainingPhotos(userDoc, usage),
    [userDoc, usage]
  );

  const plan = useMemo(() => PLANS[userDoc?.plan] || PLANS.free, [userDoc]);

  const purchase = useCallback(async (platform = 'google') => {
    setBusy(true);
    setLastError(null);
    try {
      const { ok, receipt, error } = await purchasePremium();
      if (!ok || !receipt) {
        setLastError(error || 'purchase_cancelled');
        return { ok: false, error };
      }
      // The server verifies the store transaction and grants the entitlement.
      const res = await activatePremium({
        uid,
        platform,
        receipt,
        productId: PLANS.premium.productIds[platform],
      });
      if (res?.verified) {
        setPaywallVisible(false);
        return { ok: true };
      }
      setLastError('validation_failed');
      return { ok: false, error: 'validation_failed' };
    } finally {
      setBusy(false);
    }
  }, [uid]);

  const restore = useCallback(async (platform = 'google') => {
    setBusy(true);
    setLastError(null);
    try {
      const { ok, error, receipts } = await restorePurchases(); // vendor adapter
      const storedReceipt = Array.isArray(receipts) ? receipts[0] : receipts;
      if (!ok || !storedReceipt) {
        setLastError(error || 'nothing_to_restore');
        return { ok: false, error };
      }
      // Revalidate whatever the store returned; the server re-grants if valid.
      // The store adapter must hand back a transaction id / purchase token for
      // this to be verifiable — until IAP is wired it returns nothing, and we
      // report that honestly instead of faking a grant.
      const restoredReceipt = storedReceipt || {};
      const res = await activatePremium({
        uid,
        platform,
        receipt: restoredReceipt,
        productId: PLANS.premium.productIds[platform],
      });
      if (!res?.verified) {
        setLastError(res?.reason || 'restore_unverifiable');
        return { ok: false, error: res?.reason || 'restore_unverifiable' };
      }
      return { ok: true };
    } finally {
      setBusy(false);
    }
  }, [uid]);

  const value = useMemo(
    () => ({
      uid,
      userDoc,
      subscription,
      entitlements,
      plan,
      isPremium,
      remaining,
      busy,
      lastError,
      paywallVisible,
      openPaywall: () => setPaywallVisible(true),
      closePaywall: () => setPaywallVisible(false),
      purchase,
      restore,
    }),
    [uid, userDoc, subscription, entitlements, plan, isPremium, remaining, busy, lastError, paywallVisible, purchase, restore]
  );

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be used inside <SubscriptionProvider>');
  return ctx;
}
