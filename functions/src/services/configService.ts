/**
 * Remote-config / tunables service.
 *
 * Pricing, credit costs and booking policy live in Firestore (`config/*`) so the owner can
 * change them from the admin panel without redeploying functions. Each read falls back to the
 * compiled defaults in `config/constants.ts` when a document is missing, so the backend is
 * always runnable on a brand-new project.
 */
import { db, FieldValue } from "../config/admin";
import { COLLECTIONS, CONFIG_DOCS, CREDIT_COSTS, PLANS, type CreditAction, type PlanId } from "../config/constants";
import { log } from "../lib/logger";

export interface AppConfig {
  maintenanceMode: boolean;
  minAppVersion: string;
  uploadsEnabled: boolean;
  aiFiltersEnabled: boolean;
  signupBonusCredits: number;
  referralBonusCredits: number;
  freeDailyPhotoLimit: number;
  sharingEnabled: boolean;
  printOrdersEnabled: boolean;
  bookingsEnabled: boolean;
  announcement: string | null;
}

export interface SubscriptionProduct {
  productId: string;
  planId: PlanId;
  platform: "ios" | "android" | "web" | "manual";
  priceMinorUnits: number;
  currency: string;
  creditsGranted: number;
  durationDays: number;
  trialDays: number;
}

export interface BookingPolicy {
  minLeadTimeHours: number;
  maxAdvanceDays: number;
  cancellationCutoffHours: number;
  refundPercent: number;
  maxAttendeesPerBooking: number;
  requirePhone: boolean;
  depositPercent: number;
}

const DEFAULT_APP_CONFIG: AppConfig = {
  maintenanceMode: false,
  minAppVersion: "1.0.0",
  uploadsEnabled: true,
  aiFiltersEnabled: true,
  signupBonusCredits: 150,
  referralBonusCredits: 50,
  freeDailyPhotoLimit: PLANS.free.maxPhotosPerDay,
  sharingEnabled: true,
  printOrdersEnabled: true,
  bookingsEnabled: true,
  announcement: null,
};

const DEFAULT_BOOKING_POLICY: BookingPolicy = {
  minLeadTimeHours: 2,
  maxAdvanceDays: 180,
  cancellationCutoffHours: 24,
  refundPercent: 100,
  maxAttendeesPerBooking: 20,
  requirePhone: true,
  depositPercent: 0,
};

/** Default store product ids — override in `config/subscriptionProducts`. */
const DEFAULT_PRODUCTS: SubscriptionProduct[] = [
  {
    productId: "photobooth.premium.monthly",
    planId: "premium",
    platform: "ios",
    priceMinorUnits: PLANS.premium.priceMinorUnits,
    currency: "PHP",
    creditsGranted: PLANS.premium.monthlyCredits,
    durationDays: 30,
    trialDays: 3,
  },
  {
    productId: "photobooth.premium.monthly",
    planId: "premium",
    platform: "android",
    priceMinorUnits: PLANS.premium.priceMinorUnits,
    currency: "PHP",
    creditsGranted: PLANS.premium.monthlyCredits,
    durationDays: 30,
    trialDays: 3,
  },
  {
    productId: "photobooth.studio.monthly",
    planId: "studio",
    platform: "web",
    priceMinorUnits: PLANS.studio.priceMinorUnits,
    currency: "PHP",
    creditsGranted: PLANS.studio.monthlyCredits,
    durationDays: 30,
    trialDays: 0,
  },
];

interface Cached<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, Cached<unknown>>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  const value = await loader();
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export function invalidateConfigCache(): void {
  cache.clear();
}

export async function getAppConfig(): Promise<AppConfig> {
  return cached("app", async () => {
    try {
      const snap = await db.doc(CONFIG_DOCS.app).get();
      return { ...DEFAULT_APP_CONFIG, ...(snap.data() as Partial<AppConfig> | undefined) };
    } catch (error) {
      log.warn({ event: "config_read_failed", doc: CONFIG_DOCS.app, error: String(error) });
      return DEFAULT_APP_CONFIG;
    }
  });
}

export async function getCreditCosts(): Promise<Record<CreditAction, number>> {
  return cached("creditCosts", async () => {
    try {
      const snap = await db.doc(CONFIG_DOCS.creditCosts).get();
      return { ...CREDIT_COSTS, ...(snap.data() as Partial<Record<CreditAction, number>> | undefined) };
    } catch {
      return { ...CREDIT_COSTS };
    }
  });
}

export async function getBookingPolicy(): Promise<BookingPolicy> {
  return cached("bookingPolicy", async () => {
    try {
      const snap = await db.doc(CONFIG_DOCS.bookingPolicy).get();
      return { ...DEFAULT_BOOKING_POLICY, ...(snap.data() as Partial<BookingPolicy> | undefined) };
    } catch {
      return DEFAULT_BOOKING_POLICY;
    }
  });
}

export interface SubscriptionProductMap {
  byProductId: Record<string, SubscriptionProduct>;
  all: SubscriptionProduct[];
}

export async function getSubscriptionProducts(): Promise<SubscriptionProductMap> {
  return cached("subscriptionProducts", async () => {
    let list: SubscriptionProduct[] = DEFAULT_PRODUCTS;
    try {
      const snap = await db.doc(CONFIG_DOCS.subscriptionProducts).get();
      const data = snap.data() as { products?: SubscriptionProduct[] } | undefined;
      if (data?.products?.length) list = data.products;
    } catch {
      /* fall through to defaults */
    }
    const byProductId: Record<string, SubscriptionProduct> = {};
    for (const product of list) byProductId[product.productId] = product;
    return { byProductId, all: list };
  });
}

/**
 * Write the compiled defaults into Firestore. Run once after `firebase deploy`
 * (or via `npm run seed`) so the admin panel has something to edit.
 * Safe to re-run: it never clobbers values an admin already changed unless `force`.
 */
export async function seedConfigDocuments(force = false): Promise<string[]> {
  const written: string[] = [];
  const docs: Array<[string, Record<string, unknown>]> = [
    [CONFIG_DOCS.app, DEFAULT_APP_CONFIG as unknown as Record<string, unknown>],
    [CONFIG_DOCS.creditCosts, CREDIT_COSTS as unknown as Record<string, unknown>],
    [CONFIG_DOCS.bookingPolicy, DEFAULT_BOOKING_POLICY as unknown as Record<string, unknown>],
    [CONFIG_DOCS.subscriptionProducts, { products: DEFAULT_PRODUCTS }],
  ];

  for (const [path, payload] of docs) {
    const ref = db.doc(path);
    const existing = await ref.get();
    if (existing.exists && !force) continue;
    await ref.set(
      { ...payload, seededAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    written.push(path);
  }

  invalidateConfigCache();
  log.info({ event: "config_seeded", docs: written });
  return written;
}

/** Convenience: list the collections the admin panel queries, for the settings screen. */
export const COLLECTION_NAMES = COLLECTIONS;
