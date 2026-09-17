/**
 * ============================================================
 * SHARED CONTRACT C5 — ANALYTICS EVENT CATALOG
 * ============================================================
 * Pinagmulan:
 *   - functions/src/config/constants.ts → ANALYTICS_EVENT_ALLOWLIST (49 events,
 *     allowlist lang ang tinatanggap ng `logAnalyticsEvents` callable)
 *   - docs/photobooth-master-assembly-plan.md §3 C5 (legacy 11-event contract
 *     mula sa Growth & Analytics workstream)
 *   - mobile/src/services/functions.ts / admin panel services (legacy trackers)
 *
 * PATAKARAN:
 *   1. Ang backend allowlist (ANALYTICS_ALLOWLIST) ang CANONICAL — anumang event
 *      na wala dito ay tatanggihan ng `logAnalyticsEvents` (sanhi ng data loss).
 *   2. Ang mga legacy C5 names (C5_LEGACY_EVENT_MAP) ay maibabalik pa rin:
 *      i-translate muna sa canonical name bago ipadala (tingnan map sa ibaba).
 *   3. North star metric: "weekly paying moments" = paid photos + prints +
 *      subscriptions + confirmed event bookings (mula sa Growth artifact).
 */

export const ANALYTICS_RETENTION_DAYS = 180;
export const ANALYTICS_MAX_BATCH = 25;
export const ANALYTICS_MAX_PARAM_KEYS = 25;
export const ANALYTICS_MAX_STRING_LENGTH = 200;

/** Canonical allowlist — bit-for-bit mula sa functions/src/config/constants.ts. */
export const ANALYTICS_ALLOWLIST = [
  'app_open',
  'session_start',
  'onboarding_start',
  'onboarding_step',
  'onboarding_complete',
  'sign_up',
  'login',
  'login_failed',
  'logout',
  'screen_view',
  'camera_opened',
  'camera_permission_denied',
  'capture_started',
  'photo_captured',
  'capture_failed',
  'burst_captured',
  'gif_created',
  'filter_selected',
  'filter_locked_shown',
  'premium_filter_tapped',
  'photo_upload_requested',
  'photo_upload_completed',
  'photo_upload_failed',
  'photo_deleted',
  'photo_shared',
  'share_link_created',
  'share_link_opened',
  'qr_scanned',
  'print_order_started',
  'print_order_completed',
  'referral_sent',
  'referral_redeemed',
  'paywall_viewed',
  'purchase_started',
  'purchase_completed',
  'purchase_failed',
  'purchase_restored',
  'subscription_cancelled',
  'quota_exhausted',
  'credits_low',
  'event_viewed',
  'event_booking_started',
  'event_booking_completed',
  'event_booking_cancelled',
  'notification_opened',
  'error_shown',
  'performance_sample',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_ALLOWLIST)[number];

/**
 * Legacy C5 event names (master plan §3 + mobile-core analytics service) →
 * canonical allowlist name. Gamitin ito sa mga screen na tumatawag pa ng
 * lumang pangalan para hindi ma-reject ng backend allowlist.
 *
 * Mga na-map na legacy calls na nakita sa codebase:
 *   - mobile core: photo_captured, filter_purchased, event_booked,
 *     premium_upgrade, photo_shared, onboarding_complete
 */
export const C5_LEGACY_EVENT_MAP: Record<string, AnalyticsEventName> = {
  photo_captured: 'photo_captured',
  photo_shared: 'photo_shared',
  onboarding_complete: 'onboarding_complete',
  // may bayad na pathways — idagdag ang konteksto sa params (hal. item: 'filter')
  filter_purchased: 'purchase_completed',
  premium_upgrade: 'purchase_completed',
  subscription_start: 'purchase_completed',
  event_booked: 'event_booking_completed',
  paywall_view: 'paywall_viewed',
  referral_credited: 'referral_redeemed',
  print_ordered: 'print_order_started',
  // 'template_used' — WALANG katumbas sa backend allowlist. Huwag gamitin
  // hangga't walang bagong allowlist entry (tingnan TODO sa CONTRACTS.md D-register).
};

/** I-translate ang legacy name (o ipasa nang direkta kung canonical na). */
export function toCanonicalEvent(name: string): AnalyticsEventName | null {
  if ((ANALYTICS_ALLOWLIST as readonly string[]).includes(name)) {
    return name as AnalyticsEventName;
  }
  return C5_LEGACY_EVENT_MAP[name] ?? null;
}

/** Standard param keys (iwas typo — hindi ipino-proseso ng backend ang sobrang keys). */
export const ANALYTICS_PARAMS = {
  filterId: 'filter_id',
  mode: 'mode', // 'single' | 'burst' | 'gif' | 'strip'
  platform: 'platform', // 'instagram' | 'tiktok' | 'facebook' | 'link' | 'qr' | 'email'
  value: 'value', // halaga sa centavos (minor units)
  currency: 'currency', // 'PHP'
  plan: 'plan', // 'free' | 'premium' | 'studio'
  duration: 'duration',
  eventId: 'event_id',
  packageType: 'package_type',
  photoId: 'photo_id',
  stepsCount: 'steps_count',
  screenName: 'screen_name',
  sessionId: 'session_id',
  appVersion: 'app_version',
} as const;

export type AnalyticsEvent = {
  name: AnalyticsEventName;
  params?: Record<string, string | number | boolean>;
  sessionId?: string;
};

/**
 * North star metric — "weekly paying moments".
 * Sagot mula sa analytics_daily collection:
 *   photo uploads na may bayad (creditsSpent>0 ng paid plan)
 *   + print_order_completed + purchase_completed
 *   + event_booking_completed (status: confirmed)
 */
export const NORTH_STAR_METRIC = 'weekly_paying_moments' as const;
