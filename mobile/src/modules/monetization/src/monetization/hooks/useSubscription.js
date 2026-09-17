/**
 * ============================================================
 * HOOKS — thin wrappers around the subscription context so
 * screens/components stay declarative.
 * ============================================================
 */

import { useSubscription } from '../context/SubscriptionContext';
import { hasEntitlement, canUseFilter, isPremium, showsWatermark, isAdFree, canBurst, canExportHd, ENTITLEMENT_KEYS } from '../entitlements/entitlements';

/** Premium-gate helper for components: true when feature is unlocked. */
export function usePremiumFeature(key) {
  const { entitlements } = useSubscription();
  return entitlements[key] === true;
}

export function useIsPremium() {
  const { entitlements } = useSubscription();
  return entitlements[ENTITLEMENT_KEYS.PREMIUM] === true;
}

export function useFilterGate(filterId) {
  const { entitlements } = useSubscription();
  return { allowed: canUseFilter({ entitlements }, filterId), entitlements };
}

/** Returns {limit, used, remaining, unlimited} for the current day. */
export function usePhotoQuota() {
  const { remaining } = useSubscription();
  return remaining;
}

export function useWatermark() {
  const { entitlements } = useSubscription();
  return { showsWatermark: !entitlements[ENTITLEMENT_KEYS.NO_WATERMARK] };
}

export function useAds() {
  const { entitlements } = useSubscription();
  return { showsAds: !entitlements[ENTITLEMENT_KEYS.AD_FREE] };
}

export function useBurstMode() {
  const { entitlements } = useSubscription();
  return { burstEnabled: entitlements[ENTITLEMENT_KEYS.BURST_MODE] === true };
}

export function useHdExport() {
  const { entitlements } = useSubscription();
  return { hdEnabled: entitlements[ENTITLEMENT_KEYS.HD_EXPORT] === true };
}

export function usePaywall() {
  return useSubscription();
}

// Re-exports used by screens
export { useSubscription, isPremium, hasEntitlement, showsWatermark, isAdFree, canBurst, canExportHd };
