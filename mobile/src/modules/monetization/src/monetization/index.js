/**
 * Public barrel API — import monetization from one place:
 *
 *   import { SubscriptionProvider, useSubscription, PaywallModal, PremiumScreen } from '../monetization';
 */

export { PLANS, USAGE_LIMITS, PREMIUM_FILTER_IDS, EVENT_PACKAGES, PREMIUM_FEATURES, CURRENCY } from './config/plans';

export {
  resolveEntitlements, hasEntitlement, isPremium,
  canUseFilter, filterAccessibleFilters,
  showsWatermark, isAdFree, canBurst, canExportHd, ENTITLEMENT_KEYS,
} from './entitlements/entitlements';

export {
  getPeriodKey, getCurrentPeriodKey, getLimit,
  getRemainingPhotos, canCapturePhoto, applyUsageEntry,
} from './entitlements/usageLimits';

export { SubscriptionProvider, useSubscription } from './context/SubscriptionContext';
export { usePremiumFeature, useIsPremium, useFilterGate, usePhotoQuota, useWatermark, useAds, useBurstMode, useHdExport, usePaywall } from './hooks/useSubscription';

export { default as PaywallModal } from './components/PaywallModal';
export { default as PlanComparison } from './components/PlanComparison';
export { FilterLock, QuotaBanner, PremiumBadge, isPremiumFilter } from './components/PremiumGates';
export { default as PremiumScreen } from './screens/PremiumScreen';
export { default as EventBookingScreen } from './screens/EventBookingScreen';

export { validateReceipt, activatePremium, watchSubscription } from './services/subscriptionService';
