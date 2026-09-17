/**
 * ============================================================
 * MONETIZATION CONFIG — single source of truth
 * Edit ONLY this file to change pricing, limits, or filter gating.
 * ============================================================
 */

export const CURRENCY = 'PHP';
export const DEFAULT_PLAN = 'free';

export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    priceLabel: '₱0',
    features: [
      '5 photos per day',
      'Basic filters only',
      'Watermark on exports',
      'HD quality output',
      'Ads-supported',
    ],
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    priceLabel: '₱99 / month',
    productIds: {
      apple: 'com.yourbrand.photobooth.premium.monthly',
      google: 'photobooth_premium_monthly',
    },
    features: [
      'Unlimited photos',
      'All AI + AR filters',
      'No watermark',
      '4K export',
      'Ad-free experience',
      '4-burst + GIF mode',
      'Priority AI processing',
    ],
  },
};

/**
 * Usage limits per plan.
 * photosPerDay: number | Infinity — enforced authoritatively in Cloud Functions.
 */
export const USAGE_LIMITS = {
  free: {
    photosPerDay: 5,
    maxFileSizeMB: 10,
  },
  premium: {
    photosPerDay: Infinity,
    maxFileSizeMB: 20,
  },
};

/**
 * Premium-gated feature flags (granted server-side).
 * Keys here are mirrored in entitlements resolution + Firestore rules.
 */
export const PREMIUM_FEATURES = {
  premium_filters: { plan: 'premium' },
  no_watermark:    { plan: 'premium' },
  hd_export:       { plan: 'premium' },
  ad_free:         { plan: 'premium' },
  burst_mode:      { plan: 'premium' },
};

/** Filter IDs that require the `premium_filters` entitlement. */
export const PREMIUM_FILTER_IDS = [
  'cyberpunk',
  'oil-painting',
  'pop-art',
  'watercolor',
  'pixel-art',
  'anime-pro',
  'neon-glow',
  'film-noir',
];

/** Business / event upsell packages (higher-ticket B2B revenue). */
export const EVENT_PACKAGES = [
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
    includes: [
      '4h booth time',
      'Themed frames + props',
      '1 booth attendant',
      'Digital gallery',
    ],
  },
];

/** Central place for the business contact / booking destination. */
export const BUSINESS_CONTACT = {
  email: 'events@yourbrand.com',
  subjectPrefix: 'Photobooth booking inquiry',
};
