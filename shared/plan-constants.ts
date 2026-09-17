/**
 * ============================================================
 * SHARED CONTRACT C6 — PLAN CONSTANTS (single source of truth)
 * ============================================================
 * Pinagmulan (bit-for-bit na mga value mula sa assembled v3 code):
 *   - mobile/src/modules/monetization/src/monetization/config/plans.js
 *   - functions/src/config/constants.ts  (PLANS, CREDIT_COSTS, LIMITS, REGION)
 *   - mobile/src/modules/camera/filters/filterCatalog.ts (FILTER_CATALOG)
 *   - scripts/seed.mjs (backend B2B packages — centavos)
 *
 * TUNTUNIN: pag nabago ang presyo/quota, dito muna — tapos i-sync ang
 * monetization plans.js, functions constants.ts, at Firestore `config/*` docs.
 * Ang backend (Cloud Functions + rules) ang may huling salita sa runtime;
 * ang constants dito ay dapat laging tugma sa `config/creditCosts` na
 * binabasa ng client.
 */

// ---------------------------------------------------------------- region / timezone

/** Dapat tugma sa lahat ng getFunctions() client call — tingnan drift D3 sa CONTRACTS.md. */
export const FUNCTIONS_REGION = 'asia-southeast1';

/** Quota rollover timezone ng backend (dailyQuotaReset scheduled job). */
export const APP_TIMEZONE = 'Asia/Manila';

// ---------------------------------------------------------------- plans

export const CURRENCY = 'PHP';
export const DEFAULT_PLAN = 'free';

/** PlanId: ang `studio` ay backend-only sa ngayon — wala pa sa mobile plans.js (tingnan D5). */
export type PlanId = 'free' | 'premium' | 'studio';

/**
 * Presyo sa **minor units (centavos)**: 9900 === ₱99.00.
 * Galing sa functions/src/config/constants.ts (authoritative runtime).
 */
export interface PlanConfig {
  id: PlanId;
  label: string;
  monthlyCredits: number;
  currency: string;
  priceMinorUnits: number;
  priceLabel: string;
  /** Authoritative daily cap — pinapatupad ng assertPhotoQuota / requestPhotoUpload. */
  maxPhotosPerDay: number;
  watermark: boolean;
  prioritySupport: boolean;
  storageQuotaBytes: number;
}

export const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id: 'free',
    label: 'Free',
    monthlyCredits: 150, // 5 captures/day sa loob ng 30-araw na cycle
    currency: 'PHP',
    priceMinorUnits: 0,
    priceLabel: 'Free',
    maxPhotosPerDay: 5,
    watermark: true,
    prioritySupport: false,
    storageQuotaBytes: 250 * 1024 * 1024,
  },
  premium: {
    id: 'premium',
    label: 'Premium',
    monthlyCredits: 9999,
    currency: 'PHP',
    priceMinorUnits: 9900,
    priceLabel: '₱99 / month',
    maxPhotosPerDay: 500,
    watermark: false,
    prioritySupport: false,
    storageQuotaBytes: 5 * 1024 * 1024 * 1024,
  },
  studio: {
    id: 'studio',
    label: 'Studio (B2B)',
    monthlyCredits: 50000,
    currency: 'PHP',
    priceMinorUnits: 49900,
    priceLabel: '₱499 / month',
    maxPhotosPerDay: 5000,
    watermark: false,
    prioritySupport: true,
    storageQuotaBytes: 50 * 1024 * 1024 * 1024,
  },
};

export const PAID_PLANS: PlanId[] = ['premium', 'studio'];

// ---------------------------------------------------------------- IAP product IDs
// Galing sa mobile monetization config/plans.js. Dapat eksakto ang mga ito sa
// App Store Connect at Google Play Console products (tingnan Blocker B5 —
// digital goods ay IAP lang, hindi Stripe in-app).

export const PREMIUM_PRODUCT_IDS = {
  apple: 'com.yourbrand.photobooth.premium.monthly',
  google: 'photobooth_premium_monthly',
} as const;

// ---------------------------------------------------------------- usage limits (client UX mirror)
// ⚠️ maxFileSizeMB premium=20 ay galing sa mobile plans.js; ang backend
// LIMITS.maxUploadBytes ay 10MB sa lahat — tingnan drift D4 sa CONTRACTS.md.

export const USAGE_LIMITS = {
  free: { photosPerDay: 5, maxFileSizeMB: 10 },
  premium: { photosPerDay: 500, maxFileSizeMB: 10 }, // synced sa backend LIMITS (D4)
  studio: { photosPerDay: 5000, maxFileSizeMB: 10 },
} as const;

// ---------------------------------------------------------------- credit costs
// Galing sa functions/src/config/constants.ts. Mirrored sa `config/creditCosts`
// Firestore doc para mabasa ng client nang live.

export const CREDIT_COSTS = {
  photo_capture: 1,
  burst_capture: 4, // 4-shot burst = 4 captures
  gif_capture: 3,
  ai_filter_basic: 0, // kasama na
  ai_filter_premium: 3,
  hd_export: 2,
  strip_export: 1,
  print_order: 0, // bayad nang hiwalay sa tunay na pera
  event_booking: 0, // bayad nang hiwalay sa tunay na pera
} as const;

export type CreditAction = keyof typeof CREDIT_COSTS;

// ---------------------------------------------------------------- filters
// Galing sa mobile/src/modules/camera/filters/filterCatalog.ts.
// Dapat laging tugma ang `isPremium` dito sa PREMIUM_FILTER_IDS sa ibaba
// (nire-regresyon ito ng QA pack: mobile/__tests__/monetization/plans.test.js P1-2).

export interface FilterDefinition {
  id: string;
  label: string;
  isPremium: boolean;
}

export const FILTER_CATALOG: FilterDefinition[] = [
  { id: 'none', label: 'Original', isPremium: false },
  { id: 'vintage', label: 'Vintage', isPremium: false },
  { id: 'sketch', label: 'Sketch', isPremium: false },
  { id: 'anime', label: 'Anime', isPremium: false },
  { id: 'cyberpunk', label: 'Cyberpunk', isPremium: true },
  { id: 'oil-painting', label: 'Oil Painting', isPremium: true },
  { id: 'pop-art', label: 'Pop Art', isPremium: true },
  { id: 'watercolor', label: 'Watercolor', isPremium: true },
  { id: 'pixel-art', label: 'Pixel Art', isPremium: true },
  { id: 'anime-pro', label: 'Anime Pro', isPremium: true },
  { id: 'neon-glow', label: 'Neon Glow', isPremium: true },
  { id: 'film-noir', label: 'Film Noir', isPremium: true },
];

/** Filter IDs na nangangailangan ng `premium_filters` entitlement. */
export const PREMIUM_FILTER_IDS = FILTER_CATALOG.filter((f) => f.isPremium).map((f) => f.id);

// ---------------------------------------------------------------- entitlements (server-granted)
// Mirrored sa firestore.rules — bawal i-write ng client ang entitlements.
// Galing sa mobile monetization plans.js PREMIUM_FEATURES.

export const PREMIUM_FEATURES = {
  premium_filters: { plan: 'premium' },
  no_watermark: { plan: 'premium' },
  hd_export: { plan: 'premium' },
  ad_free: { plan: 'premium' },
  burst_mode: { plan: 'premium' },
} as const;

export type EntitlementKey = keyof typeof PREMIUM_FEATURES;

// ---------------------------------------------------------------- B2B event packages
// DALAWANG MAGKAAIBANG PACKAGE SET ang naroroon sa v3 — tingnan drift D5:
//  (a) mobile monetization EVENT_PACKAGES (peso units, 3 packages sa ibaba)
//  (b) backend scripts/seed.mjs `packages/` (centavos: pkg_basic ₱4,990,
//      pkg_premium ₱12,990, pkg_wedding ₱24,990 — ibang presyo at strukturang
//      may photosIncluded/printsIncluded/durationMinutes)
// Ang `packages/` Firestore collection + `getPackages` callable ang canonical
// runtime; ang mobile EVENT_PACKAGES ay hardcoded client copy na dapat gawing
// read mula sa `getPackages` (tingnan CONTRACTS.md D5).

export interface MobileEventPackage {
  id: string;
  name: string;
  /** Peso units (hindi centavos) — galing sa mobile plans.js. */
  price: number;
  includes: string[];
}

export const EVENT_PACKAGES_MOBILE_LEGACY: MobileEventPackage[] = [
  {
    id: 'event_wedding',
    name: 'Wedding Booth',
    price: 15000,
    includes: [
      'Unlimited booth time (6h)',
      'Custom wedding frames',
      '2 booth attendants',
      'Same-day photo strip prints',
    ],
  },
  {
    id: 'event_corporate',
    name: 'Corporate Event',
    price: 30000,
    includes: [
      'Full-day activation',
      'Branded AR filters + frames',
      'Live gallery + analytics',
      'Post-event report',
    ],
  },
  {
    id: 'event_birthday',
    name: 'Birthday Party',
    price: 8000,
    includes: ['4h booth time', 'Themed frames + props', '1 booth attendant', 'Digital gallery'],
  },
];

export const BUSINESS_CONTACT = {
  email: 'events@yourbrand.com',
  subjectPrefix: 'Photobooth booking inquiry',
} as const;

// ---------------------------------------------------------------- admin roles
// Galing sa functions/src/config/constants.ts. Ang client ay HINDI pwedeng
// mag-grant ng roles — server-only (adminRoles collection + custom claims).

export const ADMIN_ROLES = ['superadmin', 'admin', 'support', 'moderator'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];
