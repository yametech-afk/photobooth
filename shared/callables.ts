/**
 * ============================================================
 * SHARED CONTRACT (DATA) — CLOUD FUNCTIONS CALLABLE REGISTRY
 * ============================================================
 * Pinagmulan (verified via grep sa assembled v3):
 *   - functions/src/callables/{auth,photos,subscriptions,events,admin}.ts
 *   - functions/src/http/endpoints.ts (healthz, sharePage, storeWebhook, adminExport)
 *   - mobile/src/modules/camera/services/uploadHandoff.ts (3-step upload protocol)
 *   - mobile/src/modules/preview-editor/services/cloudFunctions.ts (typed wrappers)
 *   - QA pack: mobile/__tests__/contract/functionsContract.test.js
 *
 * ⚠️ DRIFT WARNING (D1/D2 sa CONTRACTS.md): ang mobile-core
 * `src/services/functions.ts` ay tumatawag ng `uploadPhoto` at `activatePremium`
 * na WALA sa backend, at hindi naka-pin sa region. Huwag kopyahin ang lumang
 * wrapper — gamitin ang mga tamang tawag sa ibaba.
 */

export { FUNCTIONS_REGION } from './plan-constants';

// ---------------------------------------------------------------- upload protocol (canonical)
// 3-step + rollback — ito ang SUPORTADONG daan (hindi ang legacy base64 upload):
//   1. requestPhotoUpload  → quota pre-check + reservation + signed Storage PUT URL
//   2. HTTP PUT            → bytes papunta sa signed URL (hindi dumadaan sa function)
//   3. finalizePhotoUpload → sine-verify na may file, saka nagde-debit ng credits
//   4. reportUploadFailed  → best-effort rollback ng reservation

export type RequestUploadInput = {
  filterId: string;
  mode: 'single' | 'burst' | 'gif' | 'strip';
  visibility: 'private' | 'event' | 'public';
  eventId?: string | null;
  bookingId?: string | null;
  contentType?: string;
  sizeBytes?: number;
  idempotencyKey?: string;
};

export type RequestUploadResult = {
  reservationId: string;
  photoId: string;
  storagePath: string;
  uploadUrl: string;
  expiresAt: string | { seconds: number } | null;
  contentType: string;
  creditsToSpend: number;
  mode: 'single' | 'burst' | 'gif' | 'strip';
  visibility: 'private' | 'event' | 'public';
};

export type FinalizeUploadInput = {
  reservationId: string;
  photoId: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  caption?: string;
  hashtags?: string[];
  thumbnailPath?: string;
  filterApplied?: boolean;
  creditsOverride?: number;
  sessionId?: string;
};

export type FinalizeUploadResult = {
  photoId: string;
  status: 'reserved' | 'processing' | 'ready' | 'failed' | 'deleted';
  publicUrl: string | null;
  creditsRemaining: number | 'unlimited';
  visibility: 'private' | 'event' | 'public';
};

// ---------------------------------------------------------------- subscription (canonical)
// ⚠️ Ang tamang tawag ay `verifyPremiumPurchase` — HINDI `activatePremium` (D2).

export type VerifyPremiumPurchaseInput = {
  platform: 'ios' | 'android' | 'web';
  productId: string;
  /** Store receipt / purchase token — sine-verify server-side, fail-CLOSED. */
  receipt: string;
};

export type VerifyPremiumPurchaseResult = {
  status: 'active' | 'pending' | 'failed';
  plan?: 'premium' | 'studio';
  subscriptionId?: string;
  currentPeriodEnd?: string;
};

// ---------------------------------------------------------------- verified backend registry
// Kumpletong listahan ng exports ng backend (79) — bit-for-bit mula sa grep ng
// `functions/src/callables/*.ts` + `functions/src/http/endpoints.ts`.
// Bawat client wrapper ay dapat tugma sa pangalang nandito
// (nire-regresyon ng QA pack functionsContract.test.js).

export const MOBILE_CALLABLES = [
  // auth / profile
  'bootstrapSession', // user creation: profile + quota + claims sa isang round trip
  'updateUserProfile',
  'finishOnboarding',
  'refreshClaims',
  'getAppBootstrap', // public: version gate, feature flags, filter catalogue
  // quota
  'getQuota',
  'getCreditHistory',
  // photos (3-step upload protocol)
  'requestPhotoUpload',
  'finalizePhotoUpload',
  'reportUploadFailed',
  'getMyPhotos',
  'getPublicGallery',
  'deleteMyPhoto',
  'createPhotoShare',
  'revokePhotoShare',
  'getSharedPhoto', // public
  'getFilters',
  // subscriptions
  'getMySubscription',
  'verifyPremiumPurchase',
  'cancelMySubscription',
  // events / bookings
  'getPublicEvents',
  'getPublicEventDetail',
  'getPackages',
  'createEventBooking',
  'getMyBookings',
  'getBookingDetail',
  'cancelEventBooking',
  // analytics
  'logAnalyticsEvents', // allowlist lang — tingnan analytics-events.ts
] as const;

export const ADMIN_CALLABLES = [
  'adminGetDashboard', 'adminGetAnalytics', 'adminGetUserEvents', 'adminListUsers',
  'adminGetUserDetail', 'adminSuspendUser', 'adminDeleteUser', 'adminSetUserPlan',
  'adminAdjustCredits', 'adminListRoles', 'adminGrantRole', 'adminRevokeRole',
  'adminListAuditLogs', 'adminGetConfig', 'adminUpdateConfig', 'adminSeedCatalog',
  'adminSendNotification', 'adminListNotifications', 'adminGetRevenue',
  'adminRefundSubscription', 'adminSyncUserClaims', 'adminGetSubscriptionMetrics',
  'adminRecheckPurchase', 'adminUpsertFilter', 'adminDeleteFilter',
  'adminListFlaggedPhotos', 'adminModeratePhoto', 'adminDeletePhoto',
  'adminCreateEvent', 'adminUpdateEvent', 'adminSetEventStatus', 'adminDeleteEvent',
  'adminListEvents', 'adminSetEventCover', 'adminCreateEventSlot', 'adminUpdateEventSlot',
  'adminListBookings', 'adminUpdateBookingStatus', 'adminMarkBookingPaid',
  'adminGetBookingMetrics', 'adminUpsertPackage', 'adminExport',
] as const;

export const HTTP_ENDPOINTS = {
  healthz: '/healthz',
  sharePage: '/s/{token}', // public share page — private path ay hindi nababack
  storeWebhook: '/storeWebhook?platform=stripe', // Stripe-Signature verified
} as const;

export type MobileCallableName = (typeof MOBILE_CALLABLES)[number];
export type AdminCallableName = (typeof ADMIN_CALLABLES)[number];

// ---------------------------------------------------------------- legacy names — WALA SA BACKEND
// Huwag nang tawagin; i-re-point sa canonical equivalents sa taas (tingnan D1/D2):
export const LEGACY_CALLABLES_NEVER_CALL = {
  uploadPhoto: 'palitan ng requestPhotoUpload → PUT → finalizePhotoUpload (D1)',
  activatePremium: 'palitan ng verifyPremiumPurchase (D2)',
} as const;
