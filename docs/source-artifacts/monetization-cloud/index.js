/**
 * ============================================================
 * CLOUD FUNCTION — Authoritative monetization backend.
 *
 * Deploy with:  firebase deploy --only functions
 *
 * SECURITY MODEL (anti-bypass core):
 *  - Clients can NEVER write plan/entitlements/usage.
 *  - Only this function (service-account, bypasses rules) grants
 *    entitlements AFTER validating a store receipt.
 *  - Free quota is enforced here, not in the app, so a re-packed
 *    or tampered client cannot exceed limits.
 *  - Period keys (YYYY-MM-DD) are always UTC, so clock rollback
 *    on the device grants nothing.
 *
 * RECEIPT VALIDATION (production TODO):
 *  - Google: pass `receipt` = purchaseToken to AndroidPublisher
 *    `purchases.subscriptions.get` (or use Play Billing Library
 *    server-side verification via Cloud Billing).
 *  - Apple: pass `receipt` = base64 receipt to App Store Server
 *    API (verifyReceipt / status 0 + expires_date).
 *  - RevenueCat: validate the customerInfo entitlement snapshot,
 *    or call the RevenueCat webhook endpoint.
 * The placeholders below return a DECISION you must wire to real
 * store APIs before launch — do not ship them as-is.
 * ============================================================
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();

// Mirrors config/plans.js (single source kept in sync manually, or
// read from a `config` doc — see README "keep-in-sync" note).
const FREE_DAILY_PHOTO_LIMIT = 5;
const PREMIUM_ENTITLEMENTS = {
  premium: true,
  premium_filters: true,
  no_watermark: true,
  hd_export: true,
  ad_free: true,
  burst_mode: true,
};

// ------------------------------------------------------------
// 1) RECEIPT VALIDATION + ENTITLEMENT GRANT
// ------------------------------------------------------------
const validateReceiptWithStore = async ({ platform, receipt }) => {
  // === TODO(production): implement real store validation ===
  // google:   axios.get(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}/purchases/subscriptions/${Sku}/tokens/${purchaseToken}`)
  // apple:    POST https://buy.itunes.apple.com/verifyReceipt with { 'receipt-data': receiptBase64 }
  // revenuecat: webhook/snapshot check
  console.warn('[validateReceipt] Placeholder — wire to real store API before launch.');
  // Dev shortcut ONLY: allows testing the full flow with any receipt.
  return { valid: true, productId: 'photobooth_premium_monthly', periodMonths: 1 };
};

exports.validateReceipt = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Login required');
  }
  const uid = context.auth.uid;
  const { receipt, platform = 'google' } = data || {};

  if (!receipt) {
    throw new functions.https.HttpsError('invalid-argument', 'Receipt is required');
  }

  const verdict = await validateReceiptWithStore({ platform, receipt });
  if (!verdict.valid) {
    throw new functions.https.HttpsError('permission-denied', 'Invalid or expired receipt');
  }

  const now = admin.firestore.Timestamp.now();
  const expiresAt = new Date(now.toDate().getTime() + verdict.periodMonths * 30 * 24 * 60 * 60 * 1000);

  // Grant entitlements + write authoritative subscription record.
  const batch = db.batch();
  batch.set(db.collection('users').doc(uid), {
    plan: 'premium',
    entitlements: PREMIUM_ENTITLEMENTS,
    premiumActivatedAt: now,
  }, { merge: true });

  batch.set(db.collection('subscriptions').doc(uid), {
    uid,
    plan: 'premium',
    platform,
    productId: verdict.productId,
    status: 'active',
    amount: 99,            // servers computes real price from store config
    currency: 'PHP',
    createdAt: now,
    expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
    renewalAttempts: 0,
  }, { merge: true });

  await batch.commit();

  return { success: true, plan: 'premium', expiresAt: expiresAt.toISOString() };
});

// ------------------------------------------------------------
// 2) PHOTO QUOTA GUARD — authoritative free-tier enforcement
// ------------------------------------------------------------
exports.assertPhotoQuota = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Login required');
  }
  const uid = context.auth.uid;

  // Server-generated UTC period key — never trust the client's clock.
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const usageRef = db.collection('users').doc(uid).collection('usage').doc(today);

  const userSnap = await db.collection('users').doc(uid).get();
  const plan = userSnap.exists ? (userSnap.data().plan || 'free') : 'free';

  const usageSnap = await usageRef.get();
  const count = usageSnap.exists ? (usageSnap.data().photoCount || 0) : 0;

  if (plan === 'premium') {
    // Premium: bump the counter (for analytics only), never blocks.
    await usageRef.set({ photoCount: admin.firestore.FieldValue.increment(1) }, { merge: true });
    return { allowed: true, remaining: 'unlimited', plan };
  }

  if (count >= FREE_DAILY_PHOTO_LIMIT) {
    throw new functions.https.HttpsError(
      'resource-exhausted',
      'Daily free limit reached. Upgrade to Premium for unlimited photos.',
    );
  }

  await usageRef.set({ photoCount: admin.firestore.FieldValue.increment(1) }, { merge: true });
  const remaining = FREE_DAILY_PHOTO_LIMIT - count - 1;

  return {
    allowed: true,
    remaining,
    limit: FREE_DAILY_PHOTO_LIMIT,
    periodKey: today,
    plan,
  };
});

// ------------------------------------------------------------
// 3) EVENT BOOKING (B2B upsell) — persist enquiry for admin
// ------------------------------------------------------------
exports.createEventBooking = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Login required');
  }
  const { packageId, packageName, contact, eventDate } = data || {};
  if (!packageId || !packageName) {
    throw new functions.https.HttpsError('invalid-argument', 'Package is required');
  }

  const enquiry = {
    uid: context.auth.uid,
    packageId,
    packageName,
    contact: contact || '',
    eventDate: eventDate || '',
    status: 'new', // admin pipeline: new -> contacted -> booked -> paid
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const ref = await db.collection('events').doc('enquiries').collection('requests').add(enquiry);

  return { success: true, enquiryId: ref.id };
});

// ------------------------------------------------------------
// 4) SUBSCRIPTION EXPIRY — revoke entitlements when period ends
// ------------------------------------------------------------
exports.onSubscriptionExpire = functions.pubsub
  .schedule('every 6 hours')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();
    const expired = await db
      .collection('subscriptions')
      .where('status', '==', 'active')
      .where('expiresAt', '<', now)
      .limit(500)
      .get();

    const batch = db.batch();
    expired.forEach((snap) => {
      const uid = snap.id;
      batch.update(db.collection('users').doc(uid), {
        plan: 'free',
        entitlements: {},
        downgradedAt: now,
      });
      batch.update(snap.ref, { status: 'expired' });
    });

    if (expired.size > 0) await batch.commit();
    console.log(`[cron] downgraded ${expired.size} expired subscription(s)`);
    return null;
  });
