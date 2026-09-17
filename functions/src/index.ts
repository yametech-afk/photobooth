/**
 * Photobooth platform — Cloud Functions entry point.
 *
 * Deploy targets:
 *   firebase deploy --only functions            (everything)
 *   firebase deploy --only functions:photos     (one codebase group)
 *
 * Every export below is grouped so `firebase.json` can be split into codebases later without
 * renaming anything (the prefixes already separate concerns: admin*, store*, on*, sweep*).
 */

import { setGlobalOptions } from "firebase-functions/v2";
import { REGION } from "./config/constants";

// Applied to every v2 function that does not override them explicitly.
setGlobalOptions({
  region: REGION,
  maxInstances: 100,
  concurrency: 40,
  memory: "256MiB",
  timeoutSeconds: 60,
  enforceAppCheck: false, // flip to true once App Check is enforced in the mobile app
});

// ------------------------------------------------------------------ auth + profile
export {
  bootstrapSession,
  updateUserProfile,
  finishOnboarding,
  refreshClaims,
  getAppBootstrap,
} from "./callables/auth";

// ------------------------------------------------------------------ photos + quota + filters
export {
  getQuota,
  getCreditHistory,
  requestPhotoUpload,
  finalizePhotoUpload,
  reportUploadFailed,
  getMyPhotos,
  getPublicGallery,
  deleteMyPhoto,
  createPhotoShare,
  revokePhotoShare,
  getSharedPhoto,
  getFilters,
  adminUpsertFilter,
  adminDeleteFilter,
  adminListFlaggedPhotos,
  adminModeratePhoto,
  adminDeletePhoto,
} from "./callables/photos";

// ------------------------------------------------------------------ subscriptions + payments
export {
  getMySubscription,
  verifyPremiumPurchase,
  cancelMySubscription,
  adminRecheckPurchase,
  adminSetUserPlan,
  adminGetSubscriptionMetrics,
  storeWebhook,
} from "./callables/subscriptions";

// ------------------------------------------------------------------ events + bookings
export {
  getPublicEvents,
  getPublicEventDetail,
  getPackages,
  createEventBooking,
  getMyBookings,
  getBookingDetail,
  cancelEventBooking,
  adminCreateEvent,
  adminUpdateEvent,
  adminSetEventStatus,
  adminDeleteEvent,
  adminListEvents,
  adminSetEventCover,
  adminCreateEventSlot,
  adminUpdateEventSlot,
  adminListBookings,
  adminUpdateBookingStatus,
  adminMarkBookingPaid,
  adminGetBookingMetrics,
  adminUpsertPackage,
} from "./callables/events";

// ------------------------------------------------------------------ admin panel
export {
  adminGetDashboard,
  adminGetAnalytics,
  adminGetUserEvents,
  adminListUsers,
  adminGetUserDetail,
  adminSuspendUser,
  adminDeleteUser,
  adminSetUserPlan as adminSetUserPlanFromAdmin,
  adminAdjustCredits,
  adminListRoles,
  adminGrantRole,
  adminRevokeRole,
  adminListAuditLogs,
  adminGetConfig,
  adminUpdateConfig,
  adminSeedCatalog,
  adminSendNotification,
  adminListNotifications,
  adminGetRevenue,
  adminRefundSubscription,
  adminSyncUserClaims,
} from "./callables/admin";

// ------------------------------------------------------------------ auth triggers
export { beforeCreate, beforeSignIn, onUserCreated, onUserDeleted } from "./triggers/auth";

// ------------------------------------------------------------------ firestore triggers
export {
  onAnalyticsEventCreated,
  onPhotoDeleted,
  onBookingStatusChanged,
  onSubscriptionWritten,
  onUserDocumentCreated,
  onBookingDeleted,
  onShareExpired,
} from "./triggers/firestore";

// ------------------------------------------------------------------ scheduled jobs
export {
  dailyQuotaReset,
  sweepSubscriptions,
  analyticsRollup,
  housekeepingSweep,
  weeklyMetrics,
  quotaRepair,
} from "./scheduled/jobs";

// ------------------------------------------------------------------ http endpoints
export { healthz, sharePage, adminExport } from "./http/endpoints";
