/**
 * ============================================================
 * ENTITLEMENTS — client-side mirror used for UX gating ONLY.
 *
 * SECURITY: the AUTHORITATIVE entitlement source is the server
 * (Cloud Function `validateReceipt` + Firestore security rules).
 * Clients can never write plan/entitlements themselves — see
 * cloud/firestore.rules. Never treat this file as a security
 * boundary; it only decides what UI to show.
 * ============================================================
 */

import { PREMIUM_FILTER_IDS } from '../config/plans';

export const ENTITLEMENT_KEYS = {
  PREMIUM: 'premium',
  PREMIUM_FILTERS: 'premium_filters',
  NO_WATERMARK: 'no_watermark',
  HD_EXPORT: 'hd_export',
  AD_FREE: 'ad_free',
  BURST_MODE: 'burst_mode',
};

const ALL_KEYS = [
  ENTITLEMENT_KEYS.PREMIUM,
  ENTITLEMENT_KEYS.PREMIUM_FILTERS,
  ENTITLEMENT_KEYS.NO_WATERMARK,
  ENTITLEMENT_KEYS.HD_EXPORT,
  ENTITLEMENT_KEYS.AD_FREE,
  ENTITLEMENT_KEYS.BURST_MODE,
];

/**
 * Normalise a Firestore user doc into a boolean entitlement map.
 * Premium plan unlocks everything; granular server grants merge on top.
 * @param {{plan?: string, entitlements?: Record<string, boolean>}} user
 * @returns {Record<string, boolean>}
 */
export function resolveEntitlements(user) {
  const map = Object.fromEntries(ALL_KEYS.map((k) => [k, false]));
  if (!user) return map;

  if (user.plan === 'premium') {
    for (const k of ALL_KEYS) map[k] = true;
  }

  // Granular grants (e.g. one-time IAP bundles) — written only by the server.
  const extra = user.entitlements || {};
  for (const k of ALL_KEYS) {
    if (extra[k] === true) map[k] = true;
  }
  return map;
}

export function hasEntitlement(user, key) {
  return resolveEntitlements(user)[key] === true;
}

export function isPremium(user) {
  return hasEntitlement(user, ENTITLEMENT_KEYS.PREMIUM);
}

/** Basic filters are always free; premium filter IDs are gated. */
export function canUseFilter(user, filterId) {
  if (!PREMIUM_FILTER_IDS.includes(filterId)) return true;
  return hasEntitlement(user, ENTITLEMENT_KEYS.PREMIUM_FILTERS);
}

/** Subset of filters the current user can actually use. */
export function filterAccessibleFilters(user, allFilters) {
  return allFilters.filter((f) => canUseFilter(user, f.id));
}

export function canExportHd(user) {
  return hasEntitlement(user, ENTITLEMENT_KEYS.HD_EXPORT);
}

export function showsWatermark(user) {
  return !hasEntitlement(user, ENTITLEMENT_KEYS.NO_WATERMARK);
}

export function isAdFree(user) {
  return hasEntitlement(user, ENTITLEMENT_KEYS.AD_FREE);
}

export function canBurst(user) {
  return hasEntitlement(user, ENTITLEMENT_KEYS.BURST_MODE);
}
