/**
 * Canonical document shapes for every Firestore collection in the Photobooth platform.
 *
 * The mobile app and the admin panel both mirror these interfaces in their own
 * `src/types/` folder — keep them in lockstep when a field is added.
 */
import { Timestamp } from "firebase-admin/firestore";
import type { AdminRole, PlanId } from "../config/constants";

// ------------------------------------------------------------------- users

export interface UserPreferences {
  notifications: boolean;
  emailUpdates: boolean;
  defaultFilterId: string;
  saveOriginalsToLibrary: boolean;
  locale: string;
  theme: "dark" | "light" | "system";
}

export interface UserOnboarding {
  completed: boolean;
  completedAt: Timestamp | null;
  lastStep: number;
  version: number;
}

export interface UserCounters {
  totalPhotosTaken: number;
  totalShares: number;
  totalExports: number;
  totalBookings: number;
  lifetimeCreditsSpent: number;
}

export interface UserDoc {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  phoneNumber: string | null;
  displayName: string;
  photoURL: string | null;
  plan: PlanId;
  planSource: "signup" | "purchase" | "admin_grant" | "promo";
  premiumSince: Timestamp | null;
  premiumUntil: Timestamp | null;
  subscriptionId: string | null;
  status: "active" | "suspended" | "deleted";
  suspendedReason: string | null;
  role: AdminRole | null;
  deviceTokens: string[];
  preferences: UserPreferences;
  onboarding: UserOnboarding;
  counters: UserCounters;
  referredBy: string | null;
  referralCode: string;
  locale: string;
  timezone: string;
  lastActiveAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export function defaultPreferences(): UserPreferences {
  return {
    notifications: true,
    emailUpdates: true,
    defaultFilterId: "none",
    saveOriginalsToLibrary: true,
    locale: "en-PH",
    theme: "dark",
  };
}

export function defaultCounters(): UserCounters {
  return {
    totalPhotosTaken: 0,
    totalShares: 0,
    totalExports: 0,
    totalBookings: 0,
    lifetimeCreditsSpent: 0,
  };
}

// ------------------------------------------------------------------- quotas

/**
 * `quotas/{uid}` — the authoritative spendable balance.
 * `creditsRemaining` is decremented inside a Firestore transaction in quotaService.spend().
 */
export interface QuotaDoc {
  uid: string;
  plan: PlanId;
  /** Human-readable marketing credits (matches plan.monthlyCredits at period start). */
  creditsRemaining: number;
  creditsGranted: number;
  creditsSpent: number;
  /** Separate daily counter so the free tier gets 5/day even if monthly credits remain. */
  dailyCount: number;
  dailyLimit: number;
  /** `YYYY-MM-DD` (Asia/Manila) the daily counter belongs to. */
  dayKey: string;
  /** `YYYY-MM` (Asia/Manila) the monthly allowance belongs to. */
  monthKey: string;
  periodStart: Timestamp;
  periodEnd: Timestamp;
  lastResetAt: Timestamp;
  updatedAt: Timestamp;
}

/** `quotaLedger/{entryId}` — append-only audit of every credit movement. */
export interface QuotaLedgerEntry {
  uid: string;
  delta: number;
  balanceAfter: number;
  action: string;
  reason: string;
  refType: "photo" | "export" | "booking" | "purchase" | "admin" | "reset" | "signup";
  refId: string | null;
  monthKey: string;
  dayKey: string;
  createdAt: Timestamp;
}

// ------------------------------------------------------------------- photos

export type PhotoStatus = "reserved" | "processing" | "ready" | "failed" | "deleted";
export type PhotoVisibility = "private" | "event" | "public";

export interface PhotoDoc {
  photoId: string;
  uid: string;
  eventId: string | null;
  bookingId: string | null;
  /** Canonical Storage path — never a public URL for private photos. */
  storagePath: string;
  thumbnailPath: string | null;
  publicUrl: string | null;
  filterId: string;
  filterApplied: boolean;
  mode: "single" | "burst" | "gif" | "strip";
  status: PhotoStatus;
  visibility: PhotoVisibility;
  caption: string | null;
  hashtags: string[];
  width: number | null;
  height: number | null;
  sizeBytes: number;
  contentType: string;
  creditsSpent: number;
  likes: number;
  shares: number;
  views: number;
  isFlagged: boolean;
  flagReason: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
}

/** `uploadReservations/{id}` — short-lived intent created before the binary is uploaded. */
export interface UploadReservationDoc {
  reservationId: string;
  uid: string;
  photoId: string;
  storagePath: string;
  filterId: string;
  mode: PhotoDoc["mode"];
  visibility: PhotoVisibility;
  eventId: string | null;
  creditsToSpend: number;
  status: "pending" | "consumed" | "expired";
  createdAt: Timestamp;
  expiresAt: Timestamp;
}

/** `photoShares/{shareId}` — revocable public share links + QR codes. */
export interface PhotoShareDoc {
  shareId: string;
  photoId: string;
  uid: string;
  token: string;
  url: string;
  channel: "link" | "instagram" | "tiktok" | "facebook" | "qr" | "email";
  expiresAt: Timestamp;
  revoked: boolean;
  viewCount: number;
  createdAt: Timestamp;
}

// ------------------------------------------------------------------- events & bookings

export type EventStatus = "draft" | "published" | "ongoing" | "completed" | "cancelled";

export interface EventDoc {
  eventId: string;
  organizerId: string;
  title: string;
  slug: string;
  description: string;
  coverPath: string | null;
  coverUrl: string | null;
  venue: string;
  city: string;
  status: EventStatus;
  eventDate: Timestamp;
  startTime: Timestamp;
  endTime: Timestamp;
  timezone: string;
  packageIds: string[];
  basePriceMinorUnits: number;
  currency: string;
  capacity: number;
  bookedCount: number;
  photoCount: number;
  tags: string[];
  isFeatured: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type SlotStatus = "draft" | "open" | "closed" | "cancelled";

export interface EventSlotDoc {
  slotId: string;
  eventId: string;
  organizerId: string;
  label: string;
  startTime: Timestamp;
  endTime: Timestamp;
  capacity: number;
  bookedCount: number;
  priceMinorUnits: number;
  currency: string;
  status: SlotStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "checked_in"
  | "completed"
  | "cancelled"
  | "no_show"
  | "refunded";

export interface BookingDoc {
  bookingId: string;
  code: string;
  uid: string;
  eventId: string;
  slotId: string;
  organizerId: string;
  packageId: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  attendees: number;
  addOns: string[];
  notes: string | null;
  status: BookingStatus;
  amountMinorUnits: number;
  currency: string;
  paymentStatus: "unpaid" | "paid" | "refunded" | "waived";
  paymentRef: string | null;
  photoCount: number;
  checkedInAt: Timestamp | null;
  cancelledAt: Timestamp | null;
  cancelReason: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PackageDoc {
  packageId: string;
  name: string;
  description: string;
  priceMinorUnits: number;
  currency: string;
  durationMinutes: number;
  photosIncluded: number;
  printsIncluded: number;
  includesGif: boolean;
  includesPremiumFilters: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ------------------------------------------------------------------- subscriptions

export type SubscriptionPlatform = "ios" | "android" | "web" | "manual";
export type SubscriptionStatus =
  | "pending"
  | "active"
  | "in_grace_period"
  | "cancelled"
  | "expired"
  | "refunded";

export interface SubscriptionDoc {
  subscriptionId: string;
  uid: string;
  plan: PlanId;
  platform: SubscriptionPlatform;
  productId: string;
  /** Store transaction id / Stripe subscription id. Unique per store. */
  transactionId: string;
  originalTransactionId: string | null;
  status: SubscriptionStatus;
  autoRenew: boolean;
  amountMinorUnits: number;
  currency: string;
  /** Raw store receipt reference (NOT the receipt body) for support lookups. */
  receiptHash: string;
  verifiedAt: Timestamp | null;
  startedAt: Timestamp;
  currentPeriodEnd: Timestamp;
  expiresAt: Timestamp;
  cancelledAt: Timestamp | null;
  refundedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ------------------------------------------------------------------- analytics

export interface AnalyticsEventDoc {
  eventId: string;
  uid: string;
  name: string;
  params: Record<string, string | number | boolean | null>;
  sessionId: string;
  platform: string;
  appVersion: string;
  deviceModel: string | null;
  osVersion: string | null;
  dayKey: string;
  timestamp: Timestamp;
  /** Firestore TTL field — rows self-delete after ANALYTICS_RETENTION_DAYS. */
  expiresAt: Timestamp;
}

export interface AnalyticsDailyDoc {
  dayKey: string;
  counts: Record<string, number>;
  activeUsers: number;
  newUsers: number;
  photos: number;
  uploads: number;
  revenueMinorUnits: number;
  bookings: number;
  subscriptionsStarted: number;
  subscriptionsCancelled: number;
  updatedAt: Timestamp;
}

// ------------------------------------------------------------------- admin

export interface AdminRoleDoc {
  uid: string;
  email: string;
  role: AdminRole;
  status: "active" | "revoked";
  notes: string | null;
  grantedBy: string;
  grantedAt: Timestamp;
  revokedBy: string | null;
  revokedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AuditLogDoc {
  actorUid: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  targetType: string;
  targetId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  meta: Record<string, unknown>;
  createdAt: Timestamp;
}

export interface NotificationDoc {
  notificationId: string;
  title: string;
  body: string;
  type: "info" | "promo" | "system" | "booking";
  targetUid: string | null;
  targetAudience: "all" | "free" | "premium" | "single";
  deepLink: string | null;
  createdBy: string;
  sentAt: Timestamp | null;
  createdAt: Timestamp;
}

// ------------------------------------------------------------------- callable payloads

export interface ApiSuccess<T = Record<string, unknown>> {
  success: true;
  data: T;
  serverTime: string;
}

export interface ApiFailure {
  success: false;
  code: string;
  message: string;
  field?: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}
