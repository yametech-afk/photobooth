/**
 * Shared constants for the Photobooth backend.
 *
 * Everything tunable lives here (or in the `config/*` Firestore documents) so pricing,
 * quotas and limits can be changed from the admin panel / Firestore console without a
 * code redeploy. The numbers below are the launch defaults for the Philippine market.
 */

export const REGION = "asia-southeast1";
export const APP_TIMEZONE = "Asia/Manila";

export const COLLECTIONS = {
  users: "users",
  quotas: "quotas",
  quotaLedger: "quotaLedger",
  subscriptions: "subscriptions",
  payments: "payments",
  photos: "photos",
  photoShares: "photoShares",
  uploadReservations: "uploadReservations",
  filters: "filters",
  events: "events",
  eventSlots: "eventSlots",
  bookings: "bookings",
  packages: "packages",
  analyticsEvents: "analytics_events",
  analyticsDaily: "analytics_daily",
  metrics: "metrics",
  adminRoles: "adminRoles",
  auditLogs: "auditLogs",
  notifications: "notifications",
  idempotencyKeys: "idempotencyKeys",
  config: "config",
} as const;

export const CONFIG_DOCS = {
  app: "config/app",
  creditCosts: "config/creditCosts",
  subscriptionProducts: "config/subscriptionProducts",
  bookingPolicy: "config/bookingPolicy",
} as const;

/** Storage layout — keep in sync with storage.rules. */
export const STORAGE_PATHS = {
  userPhoto: (uid: string, photoId: string) => `users/${uid}/photos/${photoId}.jpg`,
  userAvatar: (uid: string, file: string) => `users/${uid}/avatars/${file}`,
  userExport: (uid: string, file: string) => `users/${uid}/exports/${file}`,
  eventCover: (eventId: string, file: string) => `events/${eventId}/cover/${file}`,
  publicPhoto: (fileName: string) => `public/photos/${fileName}`,
} as const;

// ------------------------------------------------------------------ plans

export type PlanId = "free" | "premium" | "studio";

export interface PlanConfig {
  id: PlanId;
  label: string;
  monthlyCredits: number;
  currency: string;
  /** Price in minor units (centavos for PHP). 9900 === ₱99.00 */
  priceMinorUnits: number;
  priceLabel: string;
  maxPhotosPerDay: number;
  watermark: boolean;
  prioritySupport: boolean;
  storageQuotaBytes: number;
}

export const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id: "free",
    label: "Free",
    monthlyCredits: 150, // 5 captures/day across a 30-day cycle
    currency: "PHP",
    priceMinorUnits: 0,
    priceLabel: "Free",
    maxPhotosPerDay: 5,
    watermark: true,
    prioritySupport: false,
    storageQuotaBytes: 250 * 1024 * 1024,
  },
  premium: {
    id: "premium",
    label: "Premium",
    monthlyCredits: 9999,
    currency: "PHP",
    priceMinorUnits: 9900,
    priceLabel: "₱99 / month",
    maxPhotosPerDay: 500,
    watermark: false,
    prioritySupport: false,
    storageQuotaBytes: 5 * 1024 * 1024 * 1024,
  },
  studio: {
    id: "studio",
    label: "Studio (B2B)",
    monthlyCredits: 50000,
    currency: "PHP",
    priceMinorUnits: 49900,
    priceLabel: "₱499 / month",
    maxPhotosPerDay: 5000,
    watermark: false,
    prioritySupport: true,
    storageQuotaBytes: 50 * 1024 * 1024 * 1024,
  },
};

export const PAID_PLANS: PlanId[] = ["premium", "studio"];

// ------------------------------------------------------------------ credits

/** Credit cost per action. Mirrored in `config/creditCosts` for the client to read. */
export const CREDIT_COSTS = {
  photo_capture: 1,
  burst_capture: 4, // 4-shot burst counts as 4 captures
  gif_capture: 3,
  ai_filter_basic: 0, // included
  ai_filter_premium: 3,
  hd_export: 2,
  strip_export: 1,
  print_order: 0, // paid separately with real money
  event_booking: 0, // paid separately with real money
} as const;

export type CreditAction = keyof typeof CREDIT_COSTS;

// ------------------------------------------------------------------ admin roles

export const ADMIN_ROLES = ["superadmin", "admin", "support", "moderator"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/** Permission matrix used by admin callables. Keep in sync with the admin panel routes. */
export const ROLE_PERMISSIONS: Record<AdminRole, readonly string[]> = {
  superadmin: [
    "users:read", "users:write", "users:plan", "users:credits",
    "admins:read", "admins:write",
    "photos:read", "photos:moderate", "photos:delete",
    "events:read", "events:write", "bookings:read", "bookings:write",
    "subscriptions:read", "subscriptions:write", "payments:manual",
    "filters:read", "filters:write",
    "analytics:read", "analytics:export",
    "audit:read", "notifications:write", "settings:write",
  ],
  admin: [
    "users:read", "users:write", "users:credits",
    "photos:read", "photos:moderate",
    "events:read", "events:write", "bookings:read", "bookings:write",
    "subscriptions:read",
    "filters:read", "filters:write",
    "analytics:read", "notifications:write",
  ],
  support: [
    "users:read", "photos:read", "events:read", "bookings:read",
    "subscriptions:read", "analytics:read", "audit:read",
  ],
  moderator: [
    "users:read", "photos:read", "photos:moderate", "analytics:read",
  ],
};

// ------------------------------------------------------------------ analytics

export const ANALYTICS_EVENT_ALLOWLIST = [
  "app_open",
  "session_start",
  "onboarding_start",
  "onboarding_step",
  "onboarding_complete",
  "sign_up",
  "login",
  "login_failed",
  "logout",
  "screen_view",
  "camera_opened",
  "camera_permission_denied",
  "capture_started",
  "photo_captured",
  "capture_failed",
  "burst_captured",
  "gif_created",
  "filter_selected",
  "filter_locked_shown",
  "premium_filter_tapped",
  "photo_upload_requested",
  "photo_upload_completed",
  "photo_upload_failed",
  "photo_deleted",
  "photo_shared",
  "share_link_created",
  "share_link_opened",
  "qr_scanned",
  "print_order_started",
  "print_order_completed",
  "referral_sent",
  "referral_redeemed",
  "paywall_viewed",
  "purchase_started",
  "purchase_completed",
  "purchase_failed",
  "purchase_restored",
  "subscription_cancelled",
  "quota_exhausted",
  "credits_low",
  "event_viewed",
  "event_booking_started",
  "event_booking_completed",
  "event_booking_cancelled",
  "notification_opened",
  "error_shown",
  "performance_sample",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_ALLOWLIST)[number];

export const ANALYTICS_RETENTION_DAYS = 180;

// ------------------------------------------------------------------ limits

export const LIMITS = {
  maxUploadBytes: 10 * 1024 * 1024,
  maxAnalyticsBatch: 25,
  maxAnalyticsParamKeys: 25,
  maxAnalyticsStringLength: 200,
  maxPageSize: 100,
  defaultPageSize: 25,
  maxPhotoCaptionLength: 280,
  maxDisplayNameLength: 60,
  maxBookingAttendees: 20,
  bookingCodePrefix: "PB",
  idempotencyTtlHours: 24,
  uploadReservationTtlMinutes: 30,
  shareLinkDefaultTtlHours: 168, // 7 days
  shareLinkMaxTtlHours: 336, // 14 days
  analyticsRollupMaxEvents: 20000,
} as const;

/** Revenue-recognising statuses used for the admin revenue dashboard. */
export const REVENUE_STATUSES = ["active", "in_grace_period", "cancelled"] as const;
export const ACTIVE_STATUSES = ["active", "in_grace_period"] as const;
