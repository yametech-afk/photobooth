/**
 * Claim synchronisation after a cross-region subscription webhook.
 *
 * WHY THIS EXISTS
 * ---------------
 * `functions/src/callables/subscriptions.ts` deploys `storeWebhook` to
 * `asia-southeast1` and exports `storeWebhookInUs` (via `storeWebhookExport()`)
 * on `us-central1` **specifically so the Apple App Store Server Notifications
 * endpoint can be reached without a cross-region call** — every other callable
 * (`verifyPremiumPurchase`, `refreshClaims`, `adminSyncUserClaims`, …) lives only
 * in asia-southeast1.
 *
 * A subscription granted by the webhook therefore lands in Firestore without the
 * client's custom claims being refreshed. This bridge is a thin HTTP hop between
 * the two regional deployments so the client's cached token picks up
 * `plan: premium` immediately instead of after the next sign-in.
 *
 * DEPLOYMENT
 * ----------
 *   1. Replace every REPLACE_* placeholder below with the real project id.
 *   2. Protect it with a shared secret (or App Check) before enabling:
 *        firebase functions:secrets:set CLAIM_SYNC_TOKEN
 *   3. In the storeWebhook handler, after `activateSubscription(...)` succeeds,
 *      call `syncUserClaims(uid)` from this module (fire-and-forget).
 *   4. Deploy together with the rest of the functions codebase:
 *        firebase deploy --only functions
 *
 * NOT YET WIRED: the call site inside storeWebhook is a one-line addition in
 * `functions/src/callables/subscriptions.ts`. It is left explicit here rather
 * than silently patched, because it changes billing-adjacent code that the
 * backend owner should review.
 */
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { REGION } from "./config/constants";
import { log } from "./lib/logger";

/** Shared secret guarding the internal bridge. Set with:
 *  firebase functions:secrets:set CLAIM_SYNC_TOKEN                                  */
const CLAIM_SYNC_TOKEN = defineSecret("CLAIM_SYNC_TOKEN");

/** Project id that owns the callables (both regions belong to the same project). */
const PROJECT_ID = process.env.GCLOUD_PROJECT || "REPLACE_WITH_FIREBASE_PROJECT_ID";

/** Region that owns `refreshClaims` — the same REGION the rest of the API uses. */
const CALLABLES_REGION = REGION;

/** Public (Google-authenticated) callable URL for `refreshClaims`. */
function refreshClaimsUrl(): string {
  return `https://${CALLABLES_REGION}-${PROJECT_ID}.cloudfunctions.net/refreshClaims`;
}

/** Public (Google-authenticated) callable URL for `adminSyncUserClaims`. */
function adminSyncUserClaimsUrl(): string {
  return `https://${CALLABLES_REGION}-${PROJECT_ID}.cloudfunctions.net/adminSyncUserClaims`;
}

/**
 * Ask the cross-region `refreshClaims` callable to re-issue the user's claims.
 * Returns true when the call answered 2xx.
 */
export async function syncUserClaims(uid: string): Promise<boolean> {
  if (!uid) return false;
  try {
    const res = await fetch(refreshClaimsUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-token": CLAIM_SYNC_TOKEN.value(),
      },
      // Callable wire format: the uid travels inside `data`.
      body: JSON.stringify({ data: { uid, source: "store_webhook" } }),
    });
    if (!res.ok) {
      log.warn({ event: "claim_sync_failed", uid, status: res.status });
      return false;
    }
    log.info({ event: "claim_sync_ok", uid });
    return true;
  } catch (error) {
    log.warn({ event: "claim_sync_error", uid, error: String(error) });
    return false;
  }
}

/**
 * HTTP endpoint for out-of-band claim repair, e.g. from the admin panel or a
 * support runbook when a webhook arrived while the user was offline.
 *
 *   POST /crossRegionClaimSync
 *   x-internal-token: <CLAIM_SYNC_TOKEN>
 *   { "uid": "...", "mode": "self" | "admin" }
 */
export const crossRegionClaimSync = onRequest(
  {
    region: CALLABLES_REGION,
    cors: false,
    timeoutSeconds: 30,
    secrets: [CLAIM_SYNC_TOKEN],
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "method_not_allowed" });
      return;
    }
    const token = req.header("x-internal-token");
    if (!token || token !== CLAIM_SYNC_TOKEN.value()) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const uid = typeof req.body?.uid === "string" ? req.body.uid : "";
    const mode = req.body?.mode === "admin" ? "admin" : "self";
    if (!uid) {
      res.status(400).json({ error: "uid_required" });
      return;
    }

    const url = mode === "admin" ? adminSyncUserClaimsUrl() : refreshClaimsUrl();
    try {
      const upstream = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-token": CLAIM_SYNC_TOKEN.value(),
        },
        body: JSON.stringify({ data: { uid } }),
      });
      const body = await upstream.text();
      res.status(upstream.status).send(body);
    } catch (error) {
      log.error({ event: "cross_region_claim_sync_error", uid, error: String(error) });
      res.status(502).json({ error: "upstream_unreachable", uid });
    }
  }
);
