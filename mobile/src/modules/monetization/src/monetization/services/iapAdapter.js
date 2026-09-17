/**
 * ============================================================
 * IAP ADAPTER — vendor-agnostic storefront bridge.
 *
 * Swap `IapConfig.vendor` to switch between `react-native-iap`
 * and RevenueCat without touching the screens. All methods are
 * wrapped and return normalised results; the store transaction
 * is ALWAYS forwarded to the server via `verifyPremiumPurchase`
 * so entitlements are granted server-side only.
 *
 * STATUS: the store SDK is deliberately NOT bundled yet — the
 * commented calls below are the exact integration points and the
 * functions return `ok: false` with an explicit reason so the UI
 * reports "payments not configured" instead of faking a purchase.
 * The backend verifier is REAL (functions/src/services/
 * subscriptionService.ts: Apple/Google/Stripe), so the only work
 * left is installing the store SDK and uncommenting these calls.
 *
 * `platform` values returned here are the backend enum the
 * subscription service expects: 'ios' | 'android'.
 * ============================================================
 */

import { Platform } from 'react-native';
import { PLANS } from '../config/plans';

export const IAP_VENDOR = Object.freeze({
  REVENUECAT: 'revenuecat',
  REACT_NATIVE_IAP: 'react-native-iap',
});

export const IapConfig = {
  vendor: process.env.EXPO_PUBLIC_IAP_VENDOR || 'react-native-iap', // or 'revenuecat'
  revenuecatApiKey: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY || '', // public SDK key
  googleLicenseKey: process.env.EXPO_PUBLIC_GOOGLE_LICENSE_KEY || '',
  products: PLANS.premium.productIds, // { apple, google }
};

/** Normalised store product view used by the paywall. */
export const PRODUCT_VIEW = {
  id: 'premium_monthly',
  title: 'Photobooth Premium',
  description: 'Unlimited photos, all AI filters, no watermark, 4K export.',
  price: '₱99',
  priceAmountMicros: 99000000,
  currency: 'PHP',
  period: 'P1M', // ISO 8601 recurring period
  platform: null, // filled at runtime
};

/** The store platform this build is running on, in the backend's enum. */
export function currentPlatform() {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

/** The store SKU for the running platform. */
export function currentProductId() {
  return currentPlatform() === 'ios'
    ? PLANS.premium.productIds.apple
    : PLANS.premium.productIds.google;
}

/**
 * Kick off the storefront. Returns `true` on success.
 * @returns {Promise<boolean>}
 */
export async function setupStorefront() {
  if (IapConfig.vendor === IAP_VENDOR.REVENUECAT) {
    // == TODO(integration): install react-native-purchases, then ==
    // const Purchases = require('react-native-purchases');
    // await Purchases.configure({ apiKey: IapConfig.revenuecatApiKey });
    return true;
  }
  // react-native-iap flow
  try {
    // const RNIap = require('react-native-iap');
    // await RNIap.initConnection();
    // await RNIap.getSubscriptions([currentProductId()]);
    return true;
  } catch (e) {
    console.warn('[IAP] storefront setup failed', e);
    return false;
  }
}

/**
 * Start a purchase for the premium plan.
 * @returns {Promise<{ok: boolean, receipt?: object, platform?: string, error?: string}>}
 */
export async function purchasePremium() {
  const platform = currentPlatform();

  if (IapConfig.vendor === IAP_VENDOR.REVENUECAT) {
    // const Purchases = require('react-native-purchases');
    // const { entitlements } = await Purchases.getOfferings();
    // const pkg = entitlements.premium?.availablePackages?.[0];
    // const res = pkg ? await Purchases.purchasePackage(pkg) : null;
    // if (!res) return { ok: false, error: 'no_offer_available' };
    // return { ok: true, platform, receipt: { revenuecat: res } };
    return { ok: false, platform, error: 'revenuecat_not_configured' }; // TODO(integration)
  }

  // react-native-iap flow
  try {
    // const RNIap = require('react-native-iap');
    // const purchase = await RNIap.requestPurchase({
    //   sku: currentProductId(),
    //   andDangerouslyFinishTransactionAutomaticallyIOS: false,
    // });
    // return { ok: true, platform, receipt: purchase };
    return { ok: false, platform, error: 'iap_not_configured' }; // TODO(integration)
  } catch (e) {
    return { ok: false, platform, error: e?.message || 'purchase_failed' };
  }
}

/**
 * Restore previously bought subscriptions from the store. Returns the raw
 * receipts so the caller can forward them to the server for verification.
 * @returns {Promise<{ok: boolean, receipts?: object[], platform?: string, error?: string}>}
 */
export async function restorePurchases() {
  const platform = currentPlatform();

  if (IapConfig.vendor === IAP_VENDOR.REVENUECAT) {
    // const Purchases = require('react-native-purchases');
    // await Purchases.restorePurchases();
    // const info = await Purchases.getCustomerInfo();
    // return await fetchCurrentEntitlements(); // then revalidate server-side
    return { ok: false, platform, error: 'revenuecat_not_configured' }; // TODO(integration)
  }
  try {
    // const RNIap = require('react-native-iap');
    // const restored = await RNIap.getAvailablePurchases();
    // return { ok: restored.length > 0, platform, receipts: restored };
    return { ok: false, platform, error: 'iap_not_configured' }; // TODO(integration)
  } catch (e) {
    return { ok: false, platform, error: e?.message || 'restore_failed' };
  }
}