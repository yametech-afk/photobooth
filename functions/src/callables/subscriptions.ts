/**
 * Subscription callables + webhook handlers.
 *
 * SECURITY POSTURE — read this before changing anything here:
 *   • `verifyPremiumPurchase` accepts a receipt/token from the client but ALWAYS verifies it
 *     against Apple/Google before activating premium. If the store credentials are not
 *     configured, verification FAILS CLOSED and the purchase is stored as `pending` for manual
 *     review — premium is never granted on an unverifiable receipt.
 *   • `storeWebhook` validates platform signatures (Stripe HMAC; Apple JWS payload is only
 *     trusted after it has been fetched via the authenticated App Store Server API) and is the
 *     ONLY unauthenticated endpoint that can grant premium.
 *   • `adminSetUserPlan` / `adminGrantPremium` are superadmin/admin-only and fully audited.
 */
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { guard, errors } from "../lib/errors";
import { resolveContext, requireAdmin } from "../lib/context";
import { enforceRateLimit } from "../lib/rateLimit";
import { log } from "../lib/logger";
import { asHttpsValidationError, optionalEnum, optionalInt, optionalString, requiredEnum, requiredString } from "../lib/validation";
import { setPlan } from "../services/quotaService";
import {
  appleCredentialsPresent,
  cancelSubscription,
  decodeJwsPayload,
  expireSubscription,
  getActiveSubscription,
  getSubscriptionMetrics,
  grantPremiumManually,
  activateSubscription,
  verifyAppleTransaction,
  verifyGoogleSubscription,
  verifyStripeSignature,
  type VerifiedPurchase,
} from "../services/subscriptionService";
import { recordDailyCounters } from "../services/analyticsService";
import { getSubscriptionProducts } from "../services/configService";
import { logEvents } from "../services/analyticsService";

const OPTS = { region: REGION, cors: true, timeoutSeconds: 60, memory: "256MiB" as const };

// ------------------------------------------------------------------ read

export const getMySubscription = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const [summary, products] = await Promise.all([getActiveSubscription(ctx.uid), getSubscriptionProducts()]);
    return {
      success: true as const,
      data: {
        summary,
        products: products.all,
        // Config presence (not the keys themselves) so the app can warn "payments not live yet".
        verificationAvailable: { apple: appleCredentialsPresent(), google: Boolean(process.env.GOOGLE_PLAY_PACKAGE_NAME) },
      },
      serverTime: new Date().toISOString(),
    };
  })
);

// ------------------------------------------------------------------ client verification

/**
 * The mobile app posts the store transaction id (iOS) or purchase token (Android) here after a
 * purchase. We verify server-side, then activate. Safe to call repeatedly (idempotent on
 * platform + transactionId).
 */
export const verifyPremiumPurchase = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    await enforceRateLimit(ctx.uid, { action: "verify_purchase", max: 20, window: "hour" });

    const data = (request.data ?? {}) as Record<string, unknown>;
    try {
      const platform = requiredEnum(data.platform, "platform", ["ios", "android", "web"], "ios");
      const productId = requiredString(data.productId, "productId", { max: 120 });

      if (platform === "ios") {
        const transactionId = requiredString(data.transactionId ?? data.originalTransactionId, "transactionId", { max: 120 });
        const verification = await verifyAppleTransaction(transactionId);
        if (!verification.verified || !verification.purchase) {
          await persistPendingPurchase({ uid: ctx.uid, platform: "ios", productId, reference: transactionId, reason: verification.reason });
          void logEvents({ uid: ctx.uid, sessionId: "purchase", events: [{ name: "purchase_failed", params: { platform, reason: verification.reason } }] }).catch(() => undefined);
          return {
            success: true as const,
            data: { verified: false, reason: verification.reason, plan: null, message: "Hindi ma-verify ang purchase. Nasa manual review ito — huwag mag-alala, hindi ka sisingilin ng doble." },
            serverTime: new Date().toISOString(),
          };
        }
        const result = await activateSubscription({ uid: ctx.uid, purchase: verification.purchase, source: "client_verify" });
        void logEvents({ uid: ctx.uid, sessionId: "purchase", events: [{ name: "purchase_completed", params: { platform, plan: result.plan, value: 9900, currency: "PHP" } }] }).catch(() => undefined);
        void recordDailyCounters({ subscriptionsStarted: result.replayed ? 0 : 1, revenueMinorUnits: result.replayed ? 0 : 9900 });
        return {
          success: true as const,
          data: { verified: true, replayed: result.replayed, plan: result.plan, creditsGranted: result.creditsGranted, currentPeriodEnd: result.currentPeriodEnd, subscriptionId: result.subscriptionId },
          serverTime: new Date().toISOString(),
        };
      }

      if (platform === "android") {
        const purchaseToken = requiredString(data.purchaseToken, "purchaseToken", { max: 2048 });
        const verification = await verifyGoogleSubscription({ productId, purchaseToken });
        if (!verification.verified || !verification.purchase) {
          await persistPendingPurchase({
            uid: ctx.uid,
            platform: "android",
            productId,
            reference: purchaseToken.slice(0, 120),
            reason: verification.reason,
          });
          void logEvents({ uid: ctx.uid, sessionId: "purchase", events: [{ name: "purchase_failed", params: { platform, reason: verification.reason } }] }).catch(() => undefined);
          return {
            success: true as const,
            data: { verified: false, reason: verification.reason, plan: null, message: "Hindi ma-verify ang purchase ngayon. Nasa manual review ito." },
            serverTime: new Date().toISOString(),
          };
        }
        const result = await activateSubscription({ uid: ctx.uid, purchase: verification.purchase, source: "client_verify" });
        void logEvents({ uid: ctx.uid, sessionId: "purchase", events: [{ name: "purchase_completed", params: { platform, plan: result.plan, value: 9900, currency: "PHP" } }] }).catch(() => undefined);
        void recordDailyCounters({ subscriptionsStarted: result.replayed ? 0 : 1, revenueMinorUnits: result.replayed ? 0 : 9900 });
        return {
          success: true as const,
          data: { verified: true, replayed: result.replayed, plan: result.plan, creditsGranted: result.creditsGranted, currentPeriodEnd: result.currentPeriodEnd, subscriptionId: result.subscriptionId },
          serverTime: new Date().toISOString(),
        };
      }

      return {
        success: true as const,
        data: { verified: false, reason: "unsupported_platform", plan: null, message: "Para sa web purchases, gamitin ang Stripe checkout o makipag-ugnayan sa support." },
        serverTime: new Date().toISOString(),
      };
    } catch (error) {
      asHttpsValidationError(error);
    }
  })
);

/** Record an unverifiable purchase for manual support review (never grants premium). */
async function persistPendingPurchase(params: { uid: string; platform: string; productId: string; reference: string; reason: string }): Promise<void> {
  const { db, FieldValue, Timestamp } = await import("../config/admin");
  const { COLLECTIONS, PLANS } = await import("../config/constants");
  await db.collection(COLLECTIONS.subscriptions).add({
    uid: params.uid,
    plan: "free",
    platform: params.platform,
    productId: params.productId,
    transactionId: params.reference,
    originalTransactionId: null,
    status: "pending",
    autoRenew: false,
    amountMinorUnits: 0,
    currency: PLANS.premium.currency,
    receiptHash: params.reference.slice(0, 16),
    verifiedAt: null,
    startedAt: Timestamp.now(),
    currentPeriodEnd: Timestamp.now(),
    expiresAt: Timestamp.now(),
    cancelledAt: null,
    refundedAt: null,
    verificationReason: params.reason,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  log.warn({ event: "pending_purchase_recorded", uid: params.uid, platform: params.platform, reason: params.reason });
}

/** Re-check a pending purchase (support tool). */
export const adminRecheckPurchase = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    requireAdmin(ctx, ["superadmin", "admin"]);
    const data = (request.data ?? {}) as { uid?: string; platform?: string; transactionId?: string; productId?: string; purchaseToken?: string };
    const targetUid = requiredString(data.uid, "uid", { max: 128 });
    const platform = requiredEnum(data.platform, "platform", ["ios", "android"], "ios");

    if (platform === "ios") {
      const verification = await verifyAppleTransaction(requiredString(data.transactionId, "transactionId", { max: 120 }));
      if (!verification.verified || !verification.purchase) {
        return { success: true as const, data: { verified: false, reason: verification.reason }, serverTime: new Date().toISOString() };
      }
      const result = await activateSubscription({ uid: targetUid, purchase: verification.purchase, source: "admin", actorUid: ctx.uid });
      return { success: true as const, data: { verified: true, ...result }, serverTime: new Date().toISOString() };
    }

    const verification = await verifyGoogleSubscription({
      productId: requiredString(data.productId, "productId", { max: 120 }),
      purchaseToken: requiredString(data.purchaseToken, "purchaseToken", { max: 2048 }),
    });
    if (!verification.verified || !verification.purchase) {
      return { success: true as const, data: { verified: false, reason: verification.reason }, serverTime: new Date().toISOString() };
    }
    const result = await activateSubscription({ uid: targetUid, purchase: verification.purchase, source: "admin", actorUid: ctx.uid });
    return { success: true as const, data: { verified: true, ...result }, serverTime: new Date().toISOString() };
  })
);

// ------------------------------------------------------------------ webhook

/**
 * Platform webhook endpoint (unauthenticated by design — authenticated by signature).
 *
 *   POST /storeWebhook            { platform: "stripe", ... }   Stripe-Signature HMAC
 *   POST /storeWebhook?platform=apple   Apple App Store Server Notifications V2 (signedPayload JWS)
 *   POST /storeWebhook?platform=google  Google Play RTDN (Pub/Sub push)
 */
export const storeWebhook = onRequest({ region: REGION, cors: false, timeoutSeconds: 60 }, async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "method_not_allowed" });
      return;
    }

    const platform = String(req.query.platform ?? (req.body?.platform as string) ?? "stripe").toLowerCase();

    // ---------------------------------------------------------- Stripe
    if (platform === "stripe") {
      const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
      const signature = String(req.headers["stripe-signature"] ?? "");
      if (!secret) {
        log.error({ event: "stripe_webhook_secret_missing" });
        res.status(500).json({ ok: false, error: "webhook_not_configured" });
        return;
      }
      const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
      const check = verifyStripeSignature({ payload: raw, header: signature, secret });
      if (!check.valid) {
        log.warn({ event: "stripe_signature_invalid", reason: check.reason });
        res.status(400).json({ ok: false, error: check.reason });
        return;
      }

      const event = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as {
        type?: string;
        data?: { object?: Record<string, unknown> };
      };
      const object = event.data?.object ?? {};
      const uid = String((object.metadata as Record<string, unknown> | undefined)?.uid ?? "");
      const subscriptionId = String(object.id ?? "");
      log.info({ event: "stripe_webhook_received", type: event.type, subscriptionId, hasUid: Boolean(uid) });

      switch (event.type) {
        case "checkout.session.completed":
        case "customer.subscription.created":
        case "customer.subscription.updated": {
          if (!uid) {
            res.status(200).json({ ok: true, ignored: "no_uid_metadata" });
            return;
          }
          const periodEndSeconds = Number((object.current_period_end as number) ?? 0);
          const price = ((object.items as { data?: Array<{ price?: { unit_amount?: number } }> } | undefined)?.data?.[0]?.price) ?? {};
          const purchase: VerifiedPurchase = {
            platform: "web",
            productId: String((object.items as { data?: Array<{ price?: { id?: string } }> } | undefined)?.data?.[0]?.price?.id ?? "photobooth.premium.monthly"),
            transactionId: subscriptionId || `stripe_${Date.now()}`,
            originalTransactionId: subscriptionId,
            purchaseTime: new Date(),
            expiryTime: new Date((periodEndSeconds || Math.floor(Date.now() / 1000) + 30 * 86400) * 1000),
            autoRenew: !Boolean(object.cancel_at_period_end),
            environment: "production",
            raw: { type: event.type, amount: price.unit_amount },
          };
          const result = await activateSubscription({ uid, purchase, source: "store_webhook" });
          void recordDailyCounters({ subscriptionsStarted: result.replayed ? 0 : 1, revenueMinorUnits: Number(price.unit_amount ?? 0) });
          res.status(200).json({ ok: true, subscriptionId: result.subscriptionId, plan: result.plan });
          return;
        }
        case "customer.subscription.deleted": {
          if (subscriptionId) {
            await expireSubscription({ subscriptionId: `web_${subscriptionId}`, reason: "stripe_deleted" }).catch((error) =>
              log.warn({ event: "stripe_expire_failed", error: String(error) })
            );
          }
          res.status(200).json({ ok: true, expired: subscriptionId });
          return;
        }
        case "invoice.payment_failed": {
          log.warn({ event: "stripe_payment_failed", subscriptionId });
          res.status(200).json({ ok: true, noted: "payment_failed" });
          return;
        }
        default:
          res.status(200).json({ ok: true, ignored: event.type ?? "unknown" });
          return;
      }
    }

    // ---------------------------------------------------------- Apple
    if (platform === "apple") {
      const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as { signedPayload?: string };
      if (!body?.signedPayload) {
        res.status(400).json({ ok: false, error: "missing_signed_payload" });
        return;
      }
      // The JWS envelope is decoded to read the notification type; the TRANSACTION is then
      // re-fetched from Apple's authenticated API (authoritative, replay-safe).
      const notification = decodeJwsPayload<{ notificationType?: string; subtype?: string; data?: { signedTransactionInfo?: string } }>(
        body.signedPayload
      );
      const transaction = notification?.data?.signedTransactionInfo
        ? decodeJwsPayload<{ transactionId?: string; appAccountToken?: string; originalTransactionId?: string }>(notification.data.signedTransactionInfo)
        : null;

      const notificationType = notification?.notificationType ?? "UNKNOWN";
      const transactionId = transaction?.transactionId;
      log.info({ event: "apple_webhook_received", notificationType, subtype: notification?.subtype, transactionId });

      if (!transactionId) {
        res.status(200).json({ ok: true, ignored: "no_transaction_id" });
        return;
      }

      const verification = await verifyAppleTransaction(transactionId);
      if (!verification.verified || !verification.purchase) {
        log.warn({ event: "apple_webhook_verify_failed", notificationType, reason: verification.reason });
        res.status(200).json({ ok: true, verified: false, reason: verification.reason });
        return;
      }

      // Map the store transaction back to a Firebase uid via the stored subscription row.
      const { db } = await import("../config/admin");
      const { COLLECTIONS } = await import("../config/constants");
      const existing = await db
        .collection(COLLECTIONS.subscriptions)
        .where("transactionId", "==", transactionId)
        .limit(1)
        .get();
      const uid = existing.empty ? String(transaction?.appAccountToken ?? "") : String(existing.docs[0].data().uid ?? "");

      if (!uid) {
        log.warn({ event: "apple_webhook_no_user_mapping", transactionId, notificationType });
        res.status(200).json({ ok: true, verified: true, mapped: false });
        return;
      }

      if (["EXPIRED", "REFUND", "REVOKE"].includes(notificationType)) {
        const subRow = existing.empty ? null : existing.docs[0].id;
        if (subRow) {
          await expireSubscription({
            subscriptionId: subRow,
            reason: `apple_${notificationType}`,
            status: notificationType === "REFUND" ? "refunded" : "expired",
          });
        }
        res.status(200).json({ ok: true, expired: true, notificationType });
        return;
      }

      const result = await activateSubscription({ uid, purchase: verification.purchase, source: "store_webhook" });
      void recordDailyCounters({ subscriptionsStarted: result.replayed ? 0 : 1 });
      res.status(200).json({ ok: true, subscriptionId: result.subscriptionId, replayed: result.replayed });
      return;
    }

    // ---------------------------------------------------------- Google RTDN
    if (platform === "google") {
      // Pub/Sub push delivers a base64 message. Only the notify/verify flow is trusted.
      const message = (req.body as { message?: { data?: string } })?.message;
      const decoded = message?.data ? JSON.parse(Buffer.from(message.data, "base64").toString("utf8")) : null;
      const packageName = decoded?.packageName as string | undefined;
      const subscriptionNotification = decoded?.subscriptionNotification as { subscriptionId?: string; purchaseToken?: string; notificationType?: number } | undefined;

      if (packageName !== (process.env.GOOGLE_PLAY_PACKAGE_NAME ?? packageName)) {
        log.warn({ event: "google_webhook_wrong_package", packageName });
      }
      if (!subscriptionNotification?.purchaseToken) {
        res.status(200).json({ ok: true, ignored: "no_subscription_notification" });
        return;
      }

      const verification = await verifyGoogleSubscription({
        productId: String(subscriptionNotification.subscriptionId ?? ""),
        purchaseToken: subscriptionNotification.purchaseToken,
      });

      const { db } = await import("../config/admin");
      const { COLLECTIONS } = await import("../config/constants");
      const existing = await db
        .collection(COLLECTIONS.subscriptions)
        .where("transactionId", "==", subscriptionNotification.purchaseToken.slice(0, 120))
        .limit(1)
        .get();
      const uid = existing.empty ? "" : String(existing.docs[0].data().uid ?? "");

      // notificationType 13 = EXPIRED, 12 = REVOKED (refunded)
      const isTermination = [12, 13].includes(Number(subscriptionNotification.notificationType ?? 0));
      if (isTermination && !existing.empty) {
        await expireSubscription({
          subscriptionId: existing.docs[0].id,
          reason: `google_rtdn_${subscriptionNotification.notificationType}`,
          status: Number(subscriptionNotification.notificationType) === 12 ? "refunded" : "expired",
        });
        res.status(200).json({ ok: true, expired: true });
        return;
      }

      if (!verification.verified || !verification.purchase || !uid) {
        res.status(200).json({ ok: true, verified: verification.verified, mapped: Boolean(uid) });
        return;
      }

      const result = await activateSubscription({ uid, purchase: verification.purchase, source: "store_webhook" });
      res.status(200).json({ ok: true, subscriptionId: result.subscriptionId, replayed: result.replayed });
      return;
    }

    res.status(400).json({ ok: false, error: "unknown_platform" });
  } catch (error) {
    log.error({ event: "store_webhook_error", error: String(error) });
    res.status(500).json({ ok: false, error: "internal" });
  }
});

// ------------------------------------------------------------------ cancel / restore

export const cancelMySubscription = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const data = (request.data ?? {}) as { subscriptionId?: string; reason?: string; immediate?: boolean };
    const summary = await getActiveSubscription(ctx.uid);
    const subscriptionId = optionalString(data.subscriptionId ?? null, "subscriptionId", { max: 128 }) ?? summary.subscription?.subscriptionId;
    if (!subscriptionId || !summary.subscription) throw errors.notFound("Walang aktibong subscription.");
    if (summary.subscription.uid !== ctx.uid) throw errors.permissionDenied("Hindi sa'yo ang subscription na ito.");

    await cancelSubscription({
      subscriptionId,
      actorUid: ctx.uid,
      immediate: Boolean(data.immediate),
      reason: optionalString(data.reason ?? null, "reason", { max: 300 }) ?? "Cancelled by user",
    });
    void logEvents({ uid: ctx.uid, sessionId: "subscription", events: [{ name: "subscription_cancelled", params: { platform: summary.subscription.platform } }] }).catch(() => undefined);
    return { success: true as const, data: { cancelled: true }, serverTime: new Date().toISOString() };
  })
);

// ------------------------------------------------------------------ admin

/** Admin: force a plan (comped accounts, offline payment). Audited. */
export const adminSetUserPlan = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    const admin = requireAdmin(ctx, ["superadmin", "admin"]);
    await enforceRateLimit(admin.uid, "admin_bulk");

    const data = (request.data ?? {}) as Record<string, unknown>;
    try {
      const uid = requiredString(data.uid, "uid", { max: 128 });
      const plan = requiredEnum(data.plan, "plan", ["free", "premium", "studio"], "premium");
      const reason = requiredString(data.reason ?? "Admin override", "reason", { max: 300 });

      if (plan === "free") {
        const quota = await setPlan({ uid, plan: "free", actorUid: admin.uid, reason, premiumUntil: null, resetCredits: true });
        return {
          success: true as const,
          data: { plan: "free", quota: { creditsRemaining: quota.creditsRemaining, dailyLimit: quota.dailyLimit } },
          serverTime: new Date().toISOString(),
        };
      }

      const months = optionalInt(data.months, "months", { min: 1, max: 36 }) ?? 1;
      const result = await grantPremiumManually({ actorUid: admin.uid, targetUid: uid, plan, months, reason });
      return { success: true as const, data: { plan, ...result }, serverTime: new Date().toISOString() };
    } catch (error) {
      asHttpsValidationError(error);
    }
  })
);

/** Admin: subscription + revenue dashboard payload. */
export const adminGetSubscriptionMetrics = onCall(OPTS, async (request) =>
  guard(async () => {
    const ctx = await resolveContext(request, { requireProfile: true });
    requireAdmin(ctx, ["superadmin", "admin", "support"]);
    const data = (request.data ?? {}) as { days?: number };
    const days = optionalInt(data.days, "days", { min: 1, max: 365 }) ?? 30;
    const metrics = await getSubscriptionMetrics(days);
    return { success: true as const, data: { metrics }, serverTime: new Date().toISOString() };
  })
);

export { optionalEnum, HttpsError };
