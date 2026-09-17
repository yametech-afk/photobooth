/**
 * Cloud Functions client layer — the ONE place the mobile core talks to the backend.
 *
 * The call names below are taken from the assembled backend exports
 * (`functions/src/index.ts` + `functions/src/callables/*`), NOT from the older
 * mobile-core documentation. The previous version of this file called
 * `uploadPhoto` and `activatePremium`, neither of which exists in the assembled
 * backend, and it created its Functions instance WITHOUT a region — both were
 * P0 defects (QA findings F-2 and F-3) that a typecheck can never catch because
 * callable names are plain strings.
 *
 * Backend contract (verified against the source):
 *   auth      bootstrapSession({ displayName?, phoneNumber?, timezone?, referredBy? })
 *   quota     getQuota()                      -> { quota, costs }
 *   premium   getMySubscription()             -> { summary, products, verificationAvailable }
 *             verifyPremiumPurchase({ platform, productId, transactionId? | purchaseToken? })
 *             cancelMySubscription()
 *   photos    requestPhotoUpload(...)         -> { reservationId, photoId, uploadUrl, ... }
 *             finalizePhotoUpload(...)        -> { photoId, status, publicUrl, creditsRemaining }
 *             reportUploadFailed(...)         -> { released }
 *             getMyPhotos({ limit?, cursor? })-> { items, nextCursor }
 *             deleteMyPhoto({ photoId })      -> { deleted }
 *
 * Every callable answers with the envelope `{ success, data, serverTime }`; the
 * Firebase SDK's `httpsCallable` already unwraps `data`, so the types below
 * describe the inner `data` object.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

/** Thin typed wrapper — keeps call sites free of SDK ceremony. */
async function call<Req, Res>(name: string, payload?: Req): Promise<Res> {
  const callable = httpsCallable<Req, Res>(functions, name);
  const result = await callable(payload as Req);
  return result.data;
}

// ------------------------------------------------------------------ session

export type BootstrapSessionInput = {
  displayName?: string;
  phoneNumber?: string;
  /** IANA timezone, e.g. 'Asia/Manila'. Backend stores it for quota period keys. */
  timezone?: string;
  referredBy?: string | null;
};

export type BootstrapSessionResult = {
  uid: string;
  /** True when the profile + quota documents were created by this call. */
  created: boolean;
  user: Record<string, unknown> | null;
  role: string | null;
  claims: Record<string, unknown>;
  quota: Record<string, unknown>;
  flags: {
    uploadsEnabled: boolean;
    aiFiltersEnabled: boolean;
    sharingEnabled: boolean;
    bookingsEnabled: boolean;
    printOrdersEnabled: boolean;
    maintenanceMode: boolean;
    minAppVersion: string | null;
    announcement: string | null;
  };
};

/**
 * Creates the users/{uid} profile + quotas/{uid} documents server-side and
 * returns the full session payload in one round trip.
 *
 * This is the ONLY supported way to bootstrap a session: Firestore rules set
 * `allow create: if false` on /users, so a client-side setDoc is PERMISSION_DENIED
 * (QA finding F-1). Calling this after sign-up / sign-in also self-heals a
 * missing profile document.
 */
export async function bootstrapSession(
  input: BootstrapSessionInput = {}
): Promise<BootstrapSessionResult> {
  return call<BootstrapSessionInput, BootstrapSessionResult>('bootstrapSession', input);
}

// ------------------------------------------------------------------ quota

export type QuotaSummary = {
  quota: Record<string, unknown>;
  costs: Record<string, number>;
};

/** Spendable balance + daily limit + credit costs. */
export async function getQuota(): Promise<QuotaSummary> {
  return call<void, QuotaSummary>('getQuota');
}

// ------------------------------------------------------------------ premium

/**
 * Server-side receipt verification. The store transaction id / purchase token
 * is what the backend verifies — the entitlement itself is granted ONLY here.
 * Platform values are the backend's (`ios` | `android` | `web`), not the store
 * vendor names used by the client-side paywall.
 */
export type VerifyPremiumPurchaseInput = {
  platform: 'ios' | 'android' | 'web';
  productId: string;
  /** iOS: the App Store transaction id. */
  transactionId?: string;
  /** Android: the Play purchase token. */
  purchaseToken?: string;
};

export type VerifyPremiumPurchaseResult = {
  verified: boolean;
  plan: string | null;
  reason?: string;
  message?: string;
  replayed?: boolean;
  creditsGranted?: number;
  currentPeriodEnd?: unknown;
  subscriptionId?: string;
};

export async function verifyPremiumPurchase(
  input: VerifyPremiumPurchaseInput
): Promise<VerifyPremiumPurchaseResult> {
  return call<VerifyPremiumPurchaseInput, VerifyPremiumPurchaseResult>(
    'verifyPremiumPurchase',
    input
  );
}

export async function getMySubscription(): Promise<Record<string, unknown>> {
  return call<void, Record<string, unknown>>('getMySubscription');
}

export async function cancelMySubscription(): Promise<Record<string, unknown>> {
  return call<void, Record<string, unknown>>('cancelMySubscription');
}

// ------------------------------------------------------------------ photos
// The signed-URL 3-step protocol is the supported path (the photo never travels
// through a function body). The preview-editor module wraps the same callables
// with progress + cancel; these wrappers exist for the mobile core's own flows.

export type RequestPhotoUploadInput = {
  filterId: string;
  mode: 'single' | 'burst' | 'gif' | 'strip';
  visibility: 'private' | 'event' | 'public';
  eventId?: string | null;
  bookingId?: string | null;
  contentType?: string;
  sizeBytes?: number;
  idempotencyKey?: string;
};

export type RequestPhotoUploadResult = {
  reservationId: string;
  photoId: string;
  storagePath: string;
  uploadUrl: string;
  creditsToSpend: number;
};

export async function requestPhotoUpload(
  input: RequestPhotoUploadInput
): Promise<RequestPhotoUploadResult> {
  return call<RequestPhotoUploadInput, RequestPhotoUploadResult>('requestPhotoUpload', input);
}

export type FinalizePhotoUploadInput = {
  reservationId: string;
  photoId: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  caption?: string;
  hashtags?: string[];
  filterApplied?: boolean;
  sessionId?: string;
};

export type FinalizePhotoUploadResult = {
  photoId: string;
  status: string;
  publicUrl: string | null;
  creditsRemaining: number | 'unlimited';
  visibility: string;
};

export async function finalizePhotoUpload(
  input: FinalizePhotoUploadInput
): Promise<FinalizePhotoUploadResult> {
  return call<FinalizePhotoUploadInput, FinalizePhotoUploadResult>('finalizePhotoUpload', input);
}

export async function reportUploadFailed(input: {
  reservationId: string;
  reason?: string;
}): Promise<{ released: boolean }> {
  return call<typeof input, { released: boolean }>('reportUploadFailed', input);
}

export type GetMyPhotosInput = {
  status?: string;
  filterId?: string;
  eventId?: string;
  limit?: number;
  cursor?: string | null;
};

export type GetMyPhotosResult = {
  items: Record<string, unknown>[];
  nextCursor: string | null;
};

export async function getMyPhotos(input: GetMyPhotosInput = {}): Promise<GetMyPhotosResult> {
  return call<GetMyPhotosInput, GetMyPhotosResult>('getMyPhotos', input);
}

export async function deleteMyPhoto(photoId: string): Promise<{ deleted: number }> {
  return call<{ photoId: string }, { deleted: number }>('deleteMyPhoto', { photoId });
}