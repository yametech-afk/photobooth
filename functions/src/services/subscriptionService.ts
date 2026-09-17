/**
 * Subscription service — premium activation.
 *
 * SECURITY MODEL (why this is not a client callable):
 *  - A client can NEVER grant itself premium. The only paths to `plan = premium` are:
 *      a) `storeWebhook`      — Apple App Store Server Notifications v2 / Stripe webhooks,
 *      b) `verifyPurchase`    — the client sends a receipt/token, we VERIFY it server-side
 *                               against the store API before activating,
 *      c) `adminSetPlan`      — an authorised admin (audited),
 *      d) `activateSubscription` — used by the store webhook after signature validation.
 *  - Activations are idempotent on `(platform, transactionId)`: the store retries webhooks, and
 *    a replayed notification must not stack a second month of premium.
 *
 * Store credential requirement: Apple/Google verification needs production keys. If the keys are
 * absent, verification FAILS CLOSED (we never activate premium on an unverifiable receipt) and the
 * purchase is written with status `pending` for manual review. Configure:
 *   APPLE_ISSUER_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY, APPLE_BUNDLE_ID, APPLE_ENVIRONMENT
 *   GOOGLE_PLAY_PACKAGE_NAME, GOOGLE_APPLICATION_CREDENTIALS (or ADC in Cloud Functions)
 *   STRIPE_WEBHOOK_SECRET, STRIPE_SECRET_KEY
 */
import { createSign } from "crypto";
import { db, FieldValue, Timestamp } from "../config/admin";
import { COLLECTIONS, PAID_PLANS, PLANS, type PlanId } from "../config/constants";
import { errors } from "../lib/errors";
import { log, hashId } from "../lib/logger";
import { writeAudit, AUDIT_ACTIONS } from "../lib/audit";
import { addMonths } from "../lib/dates";
import type { SubscriptionDoc, SubscriptionPlatform, SubscriptionStatus } from "../models/types";
import { getSubscriptionProducts } from "./configService";
import { grantCredits, setPlan } from "./quotaService";
import { syncClaims } from "./userService";

const SUBS = COLLECTIONS.subscriptions;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Deterministic document id ⇒ a duplicated webhook lands on the same row.
 * Apple's `originalTransactionId` is stable across renewals, so renewals update this row
 * instead of creating a new one.
 */
export function subscriptionDocId(platform: SubscriptionPlatform, transactionId: string): string {
  return `${platform}_${transactionId}`;
}

export function subscriptionRef(platform: SubscriptionPlatform, transactionId: string) {
  return db.collection(SUBS).doc(subscriptionDocId(platform, transactionId));
}

export interface VerifiedPurchase {
  platform: SubscriptionPlatform;
  productId: string;
  transactionId: string;
  originalTransactionId: string | null;
  purchaseTime: Date;
  expiryTime: Date;
  autoRenew: boolean;
  environment: "sandbox" | "production";
  raw: Record<string, unknown>;
}

export interface VerificationResult {
  verified: boolean;
  reason: string;
  purchase: VerifiedPurchase | null;
}

// ------------------------------------------------------------------ Apple

interface AppleTransactionPayload {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  purchaseDate: number;
  expiresDate: number;
  type: string;
  inAppOwnershipType?: string;
  environment?: string;
}

function appleConfig() {
  return {
    issuerId: process.env.APPLE_ISSUER_ID ?? "",
    keyId: process.env.APPLE_KEY_ID ?? "",
    privateKey: (process.env.APPLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    bundleId: process.env.APPLE_BUNDLE_ID ?? "",
    environment: (process.env.APPLE_ENVIRONMENT ?? "production") as "sandbox" | "production",
  };
}

export function appleCredentialsPresent(): boolean {
  const c = appleConfig();
  return Boolean(c.issuerId && c.keyId && c.privateKey && c.bundleId);
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Build the ES256 JWT that authenticates against the App Store Server API. */
export function buildAppleJwt(now: Date = new Date()): string {
  const c = appleConfig();
  const header = { alg: "ES256", kid: c.keyId, typ: "JWT" };
  const payload = {
    iss: c.issuerId,
    iat: Math.floor(now.getTime() / 1000) - 30,
    exp: Math.floor(now.getTime() / 1000) + 15 * 60,
    aud: "appstoreconnect-v1",
    bid: c.bundleId,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  // ES256 requires the raw R||S signature, not DER.
  const der = signer.sign(c.privateKey);
  const r = der.subarray(4, 4 + der.readUInt8(3));
  const sLen = der.readUInt8(4 + der.readUInt8(3));
  const s = der.subarray(6 + der.readUInt8(3), 6 + der.readUInt8(3) + sLen);
  const raw = Buffer.concat([r.length === 33 ? r.subarray(1) : r, s.length === 33 ? s.subarray(1) : s]);
  const signature = base64url(raw);
  return `${signingInput}.${signature}`;
}

/**
 * Verify an Apple subscription transaction id against the App Store Server API.
 * Fails closed: any error returns `verified: false` and never activates premium.
 */
export async function verifyAppleTransaction(transactionId: string): Promise<VerificationResult> {
  if (!appleCredentialsPresent()) {
    return { verified: false, reason: "apple_credentials_missing", purchase: null };
  }
  const c = appleConfig();
  const hosts = c.environment === "sandbox"
    ? ["https://api.storekit-sandbox.itunes.apple.com", "https://api.storekit.itunes.apple.com"]
    : ["https://api.storekit.itunes.apple.com", "https://api.storekit-sandbox.itunes.apple.com"];

  let lastReason = "apple_lookup_failed";
  for (const host of hosts) {
    try {
      const res = await fetch(`${host}/inApps/v1/subscriptions/${encodeURIComponent(transactionId)}`, {
        headers: { Authorization: `Bearer ${buildAppleJwt()}`, Accept: "application/json" },
      });
      if (res.status === 404) {
        lastReason = "apple_transaction_not_found";
        continue;
      }
      if (!res.ok) {
        lastReason = `apple_http_${res.status}`;
        log.warn({ event: "apple_verify_http_error", status: res.status, host });
        continue;
      }
      const body = (await res.json()) as { data?: Array<{ lastTransactions?: Array<Record<string, unknown>> }> };
      const transactions = (body.data ?? []).flatMap((group) =>
        (group.lastTransactions ?? []) as Array<Record<string, unknown>>
      );
      const latest = transactions[0];
      if (!latest) {
        lastReason = "apple_no_transactions";
        continue;
      }
      const decoded = latest.signedTransactionInfo as string | undefined;
      const payload = decoded ? decodeJwsPayload<AppleTransactionPayload>(decoded) : null;
      if (!payload?.transactionId) {
        lastReason = "apple_payload_unreadable";
        continue;
      }
      return {
        verified: true,
        reason: "ok",
        purchase: {
          platform: "ios",
          productId: payload.productId,
          transactionId: String(payload.transactionId),
          originalTransactionId: payload.originalTransactionId ? String(payload.originalTransactionId) : null,
          purchaseTime: new Date(payload.purchaseDate ?? Date.now()),
          expiryTime: new Date(payload.expiresDate ?? Date.now()),
          autoRenew: true,
          environment: c.environment,
          raw: payload as unknown as Record<string, unknown>,
        },
      };
    } catch (error) {
      lastReason = `apple_error_${String(error).slice(0, 60)}`;
      log.warn({ event: "apple_verify_failed", host, error: String(error) });
    }
  }
  return { verified: false, reason: lastReason, purchase: null };
}

/** Decode (not verify) a JWS payload — the signature was already validated by the store API call. */
export function decodeJwsPayload<T>(jws: string): T | null {
  try {
    const part = jws.split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ Google Play

interface GoogleSubscriptionV2 {
  startTime?: string;
  expiryTime?: string;
  autoRenewingPlan?: { autoRenewEnabled?: boolean };
  lineItems?: Array<{ productId?: string; expiryTime?: string }>;
  latestOrderId?: string;
  acknowledgementState?: string;
}

export async function verifyGoogleSubscription(params: {
  productId: string;
  purchaseToken: string;
}): Promise<VerificationResult> {
  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME ?? "";
  if (!packageName || !params.purchaseToken || !params.productId) {
    return { verified: false, reason: "google_config_missing", purchase: null };
  }
  try {
    // google-auth-library ships with firebase-admin; required explicitly in package.json.
    const { GoogleAuth } = await import("google-auth-library");
    const authClient = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/androidpublisher"] });
    const client = await authClient.getClient();
    const token = await client.getAccessToken();
    if (!token.token) return { verified: false, reason: "google_token_unavailable", purchase: null };

    const url =
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
      `${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(params.purchaseToken)}`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token.token}` } });
    if (res.status === 400 || res.status === 404) {
      return { verified: false, reason: "google_purchase_not_found", purchase: null };
    }
    if (!res.ok) {
      log.warn({ event: "google_verify_http_error", status: res.status });
      return { verified: false, reason: `google_http_${res.status}`, purchase: null };
    }

    const body = (await res.json()) as GoogleSubscriptionV2;
    const lineItem = body.lineItems?.find((item) => item.productId === params.productId) ?? body.lineItems?.[0];
    const expiry = lineItem?.expiryTime ?? body.expiryTime;
    if (!expiry) return { verified: false, reason: "google_no_expiry", purchase: null };

    return {
      verified: true,
      reason: "ok",
      purchase: {
        platform: "android",
        productId: lineItem?.productId ?? params.productId,
        transactionId: params.purchaseToken.slice(0, 120),
        originalTransactionId: body.latestOrderId ?? null,
        purchaseTime: body.startTime ? new Date(body.startTime) : new Date(),
        expiryTime: new Date(expiry),
        autoRenew: body.autoRenewingPlan?.autoRenewEnabled ?? false,
        environment: "production",
        raw: body as unknown as Record<string, unknown>,
      },
    };
  } catch (error) {
    log.error({ event: "google_verify_failed", error: String(error) });
    return { verified: false, reason: "google_error", purchase: null };
  }
}

// ------------------------------------------------------------------ Stripe

export interface StripeSubscriptionObject {
  id: string;
  status: string;
  customer: string;
  current_period_end: number;
  cancel_at_period_end: boolean;
  items?: { data?: Array<{ price?: { id?: string; unit_amount?: number; currency?: string; product?: string } }> };
  metadata?: Record<string, string>;
}

/** Constant-time HMAC verification of a Stripe webhook signature. */
export function verifyStripeSignature(params: {
  payload: string;
  header: string;
  secret: string;
  toleranceSeconds?: number;
}): { valid: boolean; reason: string } {
  const tolerance = params.toleranceSeconds ?? 300;
  const parts = params.header.split(",").reduce<Record<string, string[]>>((acc, item) => {
    const [k, v] = item.split("=");
    if (!k || !v) return acc;
    (acc[k] = acc[k] ?? []).push(v);
    return acc;
  }, {});

  const timestamp = parts.t?.[0];
  const signatures = parts.v1 ?? [];
  if (!timestamp || signatures.length === 0) return { valid: false, reason: "malformed_header" };

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > tolerance) return { valid: false, reason: "timestamp_out_of_tolerance" };

  const { createHmac, timingSafeEqual } = require("crypto") as typeof import("crypto");
  const expected = createHmac("sha256", params.secret).update(`${timestamp}.${params.payload}`).digest("hex");

  for (const candidate of signatures) {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(candidate, "utf8");
    if (a.length === b.length && timingSafeEqual(a, b)) return { valid: true, reason: "ok" };
  }
  return { valid: false, reason: "signature_mismatch" };
}

// ------------------------------------------------------------------ activation

export interface ActivateInput {
  uid: string;
  purchase: VerifiedPurchase;
  source: "store_webhook" | "client_verify" | "admin" | "migration";
  actorUid?: string | null;
}

export interface ActivateResult {
  subscriptionId: string;
  plan: PlanId;
  creditsGranted: number;
  currentPeriodEnd: string;
  replayed: boolean;
}

/**
 * Record a verified purchase and grant the plan + credits.
 *
 * Idempotent across renewals: when the stored `currentPeriodEnd` is already at or past the
 * incoming expiry, the notification is treated as a replay and nothing is granted.
 */
export async function activateSubscription(input: ActivateInput): Promise<ActivateResult> {
  const { purchase } = input;
  const products = await getSubscriptionProducts();
  const product = products.byProductId[purchase.productId];

  const plan: PlanId = product?.planId ?? "premium";
  if (!PAID_PLANS.includes(plan)) {
    throw errors.invalidArgument(`Hindi premium plan ang product na ${purchase.productId}.`);
  }

  const ref = subscriptionRef(purchase.platform, purchase.transactionId);
  const existingSnap = await ref.get();
  const existing = existingSnap.exists ? (existingSnap.data() as SubscriptionDoc) : null;

  const incomingExpiry = Timestamp.fromDate(purchase.expiryTime);
  if (existing && existing.expiresAt.toDate().getTime() >= purchase.expiryTime.getTime() &&
      existing.status !== "pending" && existing.status !== "expired") {
    log.info({
      event: "subscription_replay_ignored",
      uid: input.uid,
      subId: ref.id,
      storedExpiry: existing.expiresAt.toDate().toISOString(),
      incomingExpiry: purchase.expiryTime.toISOString(),
    });
    return {
      subscriptionId: ref.id,
      plan: existing.plan,
      creditsGranted: 0,
      currentPeriodEnd: existing.currentPeriodEnd.toDate().toISOString(),
      replayed: true,
    };
  }

  // Credits are granted per paid period. A renewal (later expiry than stored) grants again.
  const isRenewal = Boolean(existing) && purchase.expiryTime.getTime() > (existing?.expiresAt.toDate().getTime() ?? 0);
  const creditsGranted = isRenewal || !existing ? (product?.creditsGranted ?? PLANS[plan].monthlyCredits) : 0;

  const now = Timestamp.now();
  const doc: SubscriptionDoc = {
    subscriptionId: ref.id,
    uid: input.uid,
    plan,
    platform: purchase.platform,
    productId: purchase.productId,
    transactionId: purchase.transactionId,
    originalTransactionId: purchase.originalTransactionId,
    status: "active",
    autoRenew: purchase.autoRenew,
    amountMinorUnits: product?.priceMinorUnits ?? PLANS[plan].priceMinorUnits,
    currency: product?.currency ?? PLANS[plan].currency,
    receiptHash: hashId(`${purchase.platform}:${purchase.transactionId}`),
    verifiedAt: now,
    startedAt: existing?.startedAt ?? Timestamp.fromDate(purchase.purchaseTime),
    currentPeriodEnd: incomingExpiry,
    expiresAt: incomingExpiry,
    cancelledAt: null,
    refundedAt: existing?.refundedAt ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await ref.set(doc, { merge: true });

  // Plan + credits. `setPlan` also syncs custom claims.
  await setPlan({
    uid: input.uid,
    plan,
    actorUid: input.actorUid ?? "store",
    reason: `${input.source}: ${purchase.productId}`,
    premiumUntil: purchase.expiryTime,
    resetCredits: false,
  });

  if (creditsGranted > 0) {
    await grantCredits(input.uid, creditsGranted, {
      action: isRenewal ? "subscription_renewal" : "subscription_activation",
      reason: `${PLANS[plan].label} — ${purchase.productId}`,
      refType: "purchase",
      refId: ref.id,
    });
  }

  await db.collection(COLLECTIONS.users).doc(input.uid).set(
    {
      subscriptionId: ref.id,
      premiumSince: existing?.startedAt ?? now,
      premiumUntil: incomingExpiry,
      planSource: input.actorUid === "admin" ? "admin_grant" : "purchase",
      updatedAt: now,
    },
    { merge: true }
  );

  await db.collection(COLLECTIONS.analyticsDaily).doc().set({}, { merge: true }).catch(() => undefined);

  await writeAudit({
    actorUid: input.actorUid ?? null,
    action: isRenewal ? AUDIT_ACTIONS.subscriptionRenewed : AUDIT_ACTIONS.subscriptionActivated,
    targetType: "subscription",
    targetId: ref.id,
    after: { plan, status: "active", expiresAt: purchase.expiryTime.toISOString(), creditsGranted },
    reason: input.source,
    meta: { platform: purchase.platform, productId: purchase.productId },
  });

  log.info({
    event: "subscription_activated",
    uid: input.uid,
    subId: ref.id,
    plan,
    isRenewal,
    creditsGranted,
    source: input.source,
  });

  return {
    subscriptionId: ref.id,
    plan,
    creditsGranted,
    currentPeriodEnd: purchase.expiryTime.toISOString(),
    replayed: false,
  };
}

/** Client-initiated verification (the mobile app posts a receipt / token). */
export async function verifyPurchaseFromClient(params: {
  uid: string;
  platform: SubscriptionPlatform;
  productId: string;
  transactionId?: string | null;
  purchaseToken?: string | null;
  receipt?: string | null;
}): Promise<{ verified: boolean; reason: string; plan: PlanId | null; message: string }> {
  let verification: VerificationResult;

  if (params.platform === "ios") {
    const transactionId = params.transactionId ?? undefined;
    if (!transactionId) {
      return { verified: false, reason: "missing_transaction_id", plan: null, message: "Kailangan ang transactionId para sa iOS." };
    }
    verification = await verifyAppleTransaction(transactionId);
  } else if (params.platform === "android") {
    if (!params.purchaseToken) {
      return { verified: false, reason: "missing_purchase_token", plan: null, message: "Kailangan ang purchaseToken para sa Android." };
    }
    verification = await verifyGoogleSubscription({ productId: params.productId, purchaseToken: params.purchaseToken });
  } else {
    return {
      verified: false,
      reason: "unsupported_platform",
      plan: null,
      message: "Ang web/manual na subscription ay pinoproseso sa pamamagitan ng webhook o ng admin.",
    };
  }

  if (!verification.verified || !verification.purchase) {
    // Fail closed: persist a `pending` row for manual review rather than granting premium.
    await db.collection(SUBS).add({
      uid: params.uid,
      plan: "free",
      platform: params.platform,
      productId: params.productId,
      transactionId: params.transactionId ?? params.purchaseToken?.slice(0, 120) ?? "unknown",
      originalTransactionId: null,
      status: "pending" as SubscriptionStatus,
      autoRenew: false,
      amountMinorUnits: 0,
      currency: PLANS.premium.currency,
      receiptHash: hashId(`${params.platform}:${params.transactionId ?? params.purchaseToken ?? ""}`),
      verifiedAt: null,
      startedAt: Timestamp.now(),
      currentPeriodEnd: Timestamp.now(),
      expiresAt: Timestamp.now(),
      cancelledAt: null,
      refundedAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      verificationReason: verification.reason,
    });
    log.warn({ event: "purchase_verification_failed", uid: params.uid, platform: params.platform, reason: verification.reason });
    return {
      verified: false,
      reason: verification.reason,
      plan: null,
      message: "Hindi ma-verify ang purchase. Ipapasa ito sa support para sa manual review.",
    };
  }

  const result = await activateSubscription({
    uid: params.uid,
    purchase: verification.purchase,
    source: "client_verify",
  });

  return {
    verified: true,
    reason: "ok",
    plan: result.plan,
    message: `Aktibo na ang ${PLANS[result.plan].label}. ${result.creditsGranted} credits ang naidagdag.`,
  };
}

/** Downgrade to free. Triggered by EXPIRED / REFUND notifications and by the expiry janitor. */
export async function expireSubscription(params: {
  subscriptionId: string;
  reason: string;
  status?: SubscriptionStatus;
  actorUid?: string | null;
}): Promise<{ uid: string | null; downgraded: boolean }> {
  const ref = db.collection(SUBS).doc(params.subscriptionId);
  const snap = await ref.get();
  if (!snap.exists) return { uid: null, downgraded: false };
  const sub = snap.data() as SubscriptionDoc;

  const status: SubscriptionStatus = params.status ?? "expired";
  await ref.set(
    {
      status,
      expiresAt: Timestamp.now(),
      currentPeriodEnd: Timestamp.now(),
      updatedAt: FieldValue.serverTimestamp(),
      ...(status === "refunded" ? { refundedAt: FieldValue.serverTimestamp() } : {}),
    },
    { merge: true }
  );

  // Only downgrade when the user has no OTHER active subscription.
  const otherActive = await db
    .collection(SUBS)
    .where("uid", "==", sub.uid)
    .where("status", "==", "active")
    .limit(1)
    .get();
  const hasOther = otherActive.docs.some((d) => d.id !== params.subscriptionId);

  let downgraded = false;
  if (!hasOther) {
    await setPlan({
      uid: sub.uid,
      plan: "free",
      actorUid: params.actorUid ?? "system",
      reason: params.reason,
      premiumUntil: null,
      resetCredits: true,
    });
    await db.collection(COLLECTIONS.users).doc(sub.uid).set(
      { premiumUntil: null, subscriptionId: null, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    await syncClaims(sub.uid).catch(() => undefined);
    downgraded = true;
  }

  await writeAudit({
    actorUid: params.actorUid ?? null,
    action: status === "refunded" ? AUDIT_ACTIONS.subscriptionRefunded : AUDIT_ACTIONS.subscriptionExpired,
    targetType: "subscription",
    targetId: params.subscriptionId,
    before: { status: sub.status, expiresAt: sub.expiresAt.toDate().toISOString() },
    after: { status },
    reason: params.reason,
  });

  log.info({ event: "subscription_expired", subId: params.subscriptionId, uid: sub.uid, status, downgraded });
  return { uid: sub.uid, downgraded };
}

export async function cancelSubscription(params: {
  subscriptionId: string;
  actorUid?: string | null;
  immediate?: boolean;
  reason?: string;
}): Promise<void> {
  const ref = db.collection(SUBS).doc(params.subscriptionId);
  const snap = await ref.get();
  if (!snap.exists) throw errors.notFound("Hindi mahanap ang subscription.");
  const sub = snap.data() as SubscriptionDoc;

  await ref.set(
    { status: "cancelled", autoRenew: false, cancelledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  if (params.immediate) {
    await expireSubscription({ subscriptionId: params.subscriptionId, reason: params.reason ?? "cancelled", status: "expired", actorUid: params.actorUid });
  } else {
    // Grace period: keep premium until currentPeriodEnd, then the janitor downgrades.
    await db.collection(SUBS).doc(params.subscriptionId).set({ status: "cancelled" }, { merge: true });
  }

  await writeAudit({
    actorUid: params.actorUid ?? null,
    action: AUDIT_ACTIONS.subscriptionCancelled,
    targetType: "subscription",
    targetId: params.subscriptionId,
    before: { status: sub.status },
    after: { status: "cancelled", immediate: Boolean(params.immediate) },
    reason: params.reason ?? null,
  });

  log.info({ event: "subscription_cancelled", subId: params.subscriptionId, uid: sub.uid, immediate: Boolean(params.immediate) });
}

/** Admin-only manual grant (comp accounts, offline payment, refund goodwill). */
export async function grantPremiumManually(params: {
  actorUid: string;
  targetUid: string;
  plan: PlanId;
  months: number;
  reason: string;
}): Promise<{ subscriptionId: string; currentPeriodEnd: string }> {
  if (!PAID_PLANS.includes(params.plan)) throw errors.invalidArgument("plan must be premium or studio");
  if (params.months < 1 || params.months > 36) throw errors.invalidArgument("months must be between 1 and 36");

  const now = new Date();
  const expires = addMonths(now, params.months);
  const transactionId = `manual_${params.targetUid}_${now.getTime()}`;

  const result = await activateSubscription({
    uid: params.targetUid,
    source: "admin",
    actorUid: params.actorUid,
    purchase: {
      platform: "manual",
      productId: `photobooth.${params.plan}.manual`,
      transactionId,
      originalTransactionId: null,
      purchaseTime: now,
      expiryTime: expires,
      autoRenew: false,
      environment: "production",
      raw: { reason: params.reason, months: params.months },
    },
  });

  return { subscriptionId: result.subscriptionId, currentPeriodEnd: result.currentPeriodEnd };
}

/** Expire everything past its period. Called by the daily scheduler. */
export async function expireLapsedSubscriptions(): Promise<{ expired: number; scanned: number }> {
  const now = Timestamp.now();
  const snap = await db
    .collection(SUBS)
    .where("status", "in", ["active", "cancelled", "in_grace_period"])
    .where("expiresAt", "<=", now)
    .limit(300)
    .get();

  let expired = 0;
  for (const doc of snap.docs) {
    const sub = doc.data() as SubscriptionDoc;
    const graceEnd = new Date(sub.expiresAt.toDate().getTime() + 3 * DAY_MS);
    if (sub.status !== "cancelled" && graceEnd.getTime() > Date.now()) {
      await doc.ref.set({ status: "in_grace_period", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      continue;
    }
    await expireSubscription({ subscriptionId: doc.id, reason: "auto_expiry", status: "expired" });
    expired += 1;
  }
  log.info({ event: "subscription_expiry_sweep", scanned: snap.size, expired });
  return { expired, scanned: snap.size };
}

export interface SubscriptionSummary {
  subscription: SubscriptionDoc | null;
  plan: PlanId;
  status: SubscriptionStatus | "none";
  currentPeriodEnd: string | null;
  autoRenew: boolean;
  platform: SubscriptionPlatform | null;
  productId: string | null;
}

/** Read the user's current subscription for the in-app "Manage subscription" screen. */
export async function getActiveSubscription(uid: string): Promise<SubscriptionSummary> {
  const snap = await db
    .collection(SUBS)
    .where("uid", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(10)
    .get();

  const subs = snap.docs.map((d) => d.data() as SubscriptionDoc);
  const active = subs.find((s) => s.status === "active") ?? subs.find((s) => s.status === "in_grace_period") ?? subs[0] ?? null;

  return {
    subscription: active,
    plan: active && active.status === "active" ? active.plan : "free",
    status: active?.status ?? "none",
    currentPeriodEnd: active ? active.currentPeriodEnd.toDate().toISOString() : null,
    autoRenew: active?.autoRenew ?? false,
    platform: active?.platform ?? null,
    productId: active?.productId ?? null,
  };
}

/** Admin dashboard: revenue + churn metrics. */
export async function getSubscriptionMetrics(days = 30): Promise<{
  active: number;
  cancelled: number;
  expired: number;
  pending: number;
  mrrMinorUnits: number;
  newInPeriod: number;
  churnRatePercent: number;
}> {
  const since = Timestamp.fromDate(new Date(Date.now() - days * DAY_MS));
  const [statusCounts, recent, revenueSnap] = await Promise.all([
    Promise.all(
      (["active", "cancelled", "expired", "pending"] as SubscriptionStatus[]).map(async (status) => {
        const count = await db.collection(SUBS).where("status", "==", status).count().get();
        return [status, count.data().count] as const;
      })
    ),
    db.collection(SUBS).where("createdAt", ">=", since).get(),
    db.collection(SUBS).where("status", "==", "active").get(),
  ]);

  const byStatus = Object.fromEntries(statusCounts) as Record<string, number>;
  const mrr = revenueSnap.docs.reduce((sum, d) => sum + Number((d.data() as SubscriptionDoc).amountMinorUnits ?? 0), 0);
  const newInPeriod = recent.size;
  const cancelledInPeriod = recent.docs.filter((d) => ["cancelled", "expired"].includes((d.data() as SubscriptionDoc).status)).length;
  const starting = Math.max(byStatus.active + cancelledInPeriod, 1);

  return {
    active: byStatus.active ?? 0,
    cancelled: byStatus.cancelled ?? 0,
    expired: byStatus.expired ?? 0,
    pending: byStatus.pending ?? 0,
    mrrMinorUnits: mrr,
    newInPeriod,
    churnRatePercent: Number(((cancelledInPeriod / starting) * 100).toFixed(2)),
  };
}
