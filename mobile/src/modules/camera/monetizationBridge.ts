/**
 * Monetization bridge — the ONLY place the camera module knows about the
 * monetization module. Adapts src/modules/monetization (canUseFilter /
 * PaywallModal) into the camera's PremiumFilterGate contract.
 *
 * Usage on a screen that already sits inside <SubscriptionProvider>:
 *
 *   const gate = createMonetizationGate({
 *     canUseFilter,                     // from src/modules/monetization
 *     onLocked: (filterId) => paywallRef.current?.open(filterId),
 *   });
 */
import type { PremiumFilterGate } from './types';

export interface MonetizationGateDeps {
  /** From src/modules/monetization — resolves plan entitlements for a filter. */
  canUseFilter(user: unknown, filterId: string): boolean;
  /** Current user document from AuthContext / SubscriptionContext. */
  user: unknown;
  /** Called when the user taps a locked filter — open the PaywallModal here. */
  onLocked?: (filterId: string) => void;
}

export function createMonetizationGate(deps: MonetizationGateDeps): PremiumFilterGate {
  return {
    canUseFilter: (filterId) => deps.canUseFilter(deps.user, filterId),
    lockedFilterIds: () =>
      // The monetization module's PREMIUM_FILTER_IDS; listed defensively here
      // in case the gate is used before the catalogue loads.
      [
        'cyberpunk',
        'oil-painting',
        'pop-art',
        'watercolor',
        'pixel-art',
        'anime-pro',
        'neon-glow',
        'film-noir',
      ].filter((id) => !deps.canUseFilter(deps.user, id)),
    onLockedFilterTouched: (filterId) => deps.onLocked?.(filterId),
  };
}
