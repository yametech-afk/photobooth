/**
 * HTTP endpoints (non-webhook).
 *
 *  GET  /healthz              — liveness + config presence (no secrets exposed)
 *  GET  /s/:token             — tiny public share landing page (OG tags for social previews)
 *  GET  /admin/export/:kind   — CSV export for the admin panel (admin-authenticated via Bearer id token)
 *
 * The share page is deliberately a minimal, dependency-free HTML shell: it renders OG tags so
 * WhatsApp / Messenger / Instagram previews work, then deep-links into the app.
 */
import { onRequest } from "firebase-functions/v2/https";
import { REGION, ADMIN_ROLES, COLLECTIONS, PLANS } from "../config/constants";
import { auth, db } from "../config/admin";
import { log } from "../lib/logger";
import { resolveShare } from "../services/photoService";
import { getAppConfig } from "../services/configService";
import { writeAudit, AUDIT_ACTIONS } from "../lib/audit";
import type { AdminRoleDoc, BookingDoc, PhotoDoc, SubscriptionDoc, UserDoc } from "../models/types";

/** Escape untrusted text before it lands in HTML. */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** GET /healthz — used by uptime monitors and by the mobile app's "is the backend up?" check. */
export const healthz = onRequest({ region: REGION, cors: true, timeoutSeconds: 15 }, async (_req, res) => {
  try {
    const appConfig = await getAppConfig();
    const checks: Record<string, boolean> = {
      firestore: false,
      auth: false,
      storage: false,
    };

    try {
      await db.collection(COLLECTIONS.config).limit(1).get();
      checks.firestore = true;
    } catch (error) {
      log.warn({ event: "health_firestore_failed", error: String(error) });
    }
    try {
      await auth.listUsers(1);
      checks.auth = true;
    } catch (error) {
      log.warn({ event: "health_auth_failed", error: String(error) });
    }
    try {
      const { bucket } = await import("../config/admin");
      await bucket().getMetadata();
      checks.storage = true;
    } catch (error) {
      log.warn({ event: "health_storage_failed", error: String(error) });
    }

    const healthy = Object.values(checks).every(Boolean);
    res.status(healthy ? 200 : 503).json({
      ok: healthy,
      checks,
      maintenanceMode: appConfig.maintenanceMode,
      minAppVersion: appConfig.minAppVersion,
      integrations: {
        // Boolean presence only — never the values themselves.
        appleStoreKit: Boolean(process.env.APPLE_ISSUER_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY),
        googlePlay: Boolean(process.env.GOOGLE_PLAY_PACKAGE_NAME),
        stripe: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      },
      version: process.env.K_REVISION ?? "local",
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: "health_check_failed" });
  }
});

/** GET /s/:token — public share landing page with Open Graph metadata. */
export const sharePage = onRequest({ region: REGION, cors: true, timeoutSeconds: 20 }, async (req, res) => {
  const token = String(req.path.replace(/^\/s\//, "").split("/")[0] ?? "").slice(0, 64);

  const shell = (params: { title: string; description: string; image: string | null; url: string; body: string }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(params.title)}</title>
<meta property="og:title" content="${escapeHtml(params.title)}">
<meta property="og:description" content="${escapeHtml(params.description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${escapeHtml(params.url)}">
${params.image ? `<meta property="og:image" content="${escapeHtml(params.image)}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:radial-gradient(1200px 600px at 20% 0%,#2b1b46 0%,#0A0A1F 60%);color:#fff;
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.card{width:min(92vw,460px);background:rgba(37,37,68,.72);border:1px solid rgba(255,255,255,.08);
border-radius:24px;padding:28px;backdrop-filter:blur(14px);text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.45)}
.badge{display:inline-block;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#FF4DA6;margin-bottom:14px}
img{width:100%;border-radius:16px;display:block;margin-bottom:18px;background:#000}
h1{font-size:20px;margin:0 0 8px}
p{color:#B8B8D0;font-size:14px;line-height:1.6;margin:0 0 20px}
a.btn{display:inline-block;padding:14px 22px;border-radius:999px;text-decoration:none;font-weight:700;
background:linear-gradient(45deg,#FF4DA6,#7B61FF,#00BCD4);color:#fff}
.foot{margin-top:18px;font-size:12px;color:#6f6f96}
</style>
</head>
<body>
<main class="card">
<div class="badge">Photobooth</div>
${params.image ? `<img src="${escapeHtml(params.image)}" alt="Shared photobooth photo">` : ""}
<h1>${escapeHtml(params.title)}</h1>
<p>${escapeHtml(params.body)}</p>
<a class="btn" href="photoboothapp://shared?token=${escapeHtml(token)}">Buksan sa app</a>
<p class="foot">Nag-expire ang mga link para sa iyong privacy.</p>
</main>
</body>
</html>`;

  try {
    const result = await resolveShare(token);
    if (!result.share) {
      res.status(404).send(
        shell({
          title: "Hindi mahanap ang link",
          description: "Ang share link na ito ay hindi valid o naalis na.",
          image: null,
          url: `https://${req.hostname}/s/${token}`,
          body: "Maaaring mali ang link, o na-revoke na ito ng may-ari.",
        })
      );
      return;
    }
    if (result.expired) {
      res.status(410).send(
        shell({
          title: "Nag-expire na ang link",
          description: "Pansamantala lang ang mga share link para sa privacy.",
          image: null,
          url: `https://${req.hostname}/s/${token}`,
          body: "Hilingin sa may-ari na gumawa ng bagong share link.",
        })
      );
      return;
    }

    const appConfig = await getAppConfig();
    const photo = result.photo as PhotoDoc | null;
    const caption = photo?.caption ?? "Tingnan ang litrato mula sa Photobooth app!";

    res.set("Cache-Control", "public, max-age=60, s-maxage=300").status(200).send(
      shell({
        title: "Litrato mula sa Photobooth",
        description: caption,
        image: photo?.publicUrl ?? null,
        url: `https://${req.hostname}/s/${token}`,
        body: appConfig.sharingEnabled
          ? `${caption} I-download ito o gumawa ng sarili mong photobooth strip sa app.`
          : "Pansamantalang hindi available ang sharing.",
      })
    );
  } catch (error) {
    log.error({ event: "share_page_failed", token, error: String(error) });
    res.status(500).send(
      shell({
        title: "May error",
        description: "Subukan ulit mamaya.",
        image: null,
        url: `https://${req.hostname}/s/${token}`,
        body: "Pansamantalang problema sa server.",
      })
    );
  }
});

/**
 * GET /admin/export/:kind — CSV export for the admin panel.
 * Auth: `Authorization: Bearer <firebase id token>`; the caller's live role is checked.
 * Supported kinds: users | bookings | subscriptions | photos | ledger
 */
export const adminExport = onRequest(
  { region: REGION, cors: true, timeoutSeconds: 300, memory: "512MiB" as const },
  async (req, res) => {
    const bearer = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    if (!bearer) {
      res.status(401).json({ ok: false, error: "missing_bearer_token" });
      return;
    }

    let uid: string;
    let email: string | null = null;
    try {
      const decoded = await auth.verifyIdToken(bearer, true);
      uid = decoded.uid;
      email = (decoded.email as string | undefined) ?? null;
    } catch (error) {
      log.warn({ event: "export_token_invalid", error: String(error) });
      res.status(401).json({ ok: false, error: "invalid_token" });
      return;
    }

    // Live role check — a revoked admin must lose export access immediately.
    const roleSnap = await db.collection(COLLECTIONS.adminRoles).doc(uid).get();
    const role = roleSnap.exists ? (roleSnap.data() as AdminRoleDoc) : null;
    if (!role || role.status !== "active") {
      res.status(403).json({ ok: false, error: "admin_only" });
      return;
    }

    const kind = String(req.params.kind ?? req.path.split("/").pop() ?? "").toLowerCase();
    const limit = Math.min(Number(req.query.limit ?? 5000) || 5000, 20000);
    if (!["users", "bookings", "subscriptions", "photos", "ledger"].includes(kind)) {
      res.status(400).json({ ok: false, error: "unsupported_kind", supported: ["users", "bookings", "subscriptions", "photos", "ledger"] });
      return;
    }

    try {
      const collection =
        kind === "users"
          ? COLLECTIONS.users
          : kind === "bookings"
            ? COLLECTIONS.bookings
            : kind === "subscriptions"
              ? COLLECTIONS.subscriptions
              : kind === "photos"
                ? COLLECTIONS.photos
                : COLLECTIONS.quotaLedger;

      const snap = await db.collection(collection).orderBy("createdAt", "desc").limit(limit).get();
      const rows = snap.docs.map((doc) => flattenForCsv(doc.id, doc.data()));
      const csv = toCsv(rows);

      await writeAudit({
        actorUid: uid,
        actorEmail: email,
        actorRole: role.role,
        action: AUDIT_ACTIONS.analyticsExported,
        targetType: "export",
        targetId: kind,
        meta: { rows: rows.length },
      });

      log.warn({ event: "admin_export", kind, rows: rows.length, actor: uid });

      res
        .set("Content-Type", "text/csv; charset=utf-8")
        .set("Content-Disposition", `attachment; filename="photobooth-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`)
        .status(200)
        .send(csv);
    } catch (error) {
      log.error({ event: "admin_export_failed", kind, error: String(error) });
      res.status(500).json({ ok: false, error: "export_failed" });
    }
  }
);

/** Reduce a document to a flat, CSV-friendly row. */
function flattenForCsv(id: string, data: Record<string, unknown>): Record<string, string | number> {
  const row: Record<string, string | number> = { id };
  const walk = (value: unknown, prefix: string, depth: number) => {
    if (depth > 2 || value === null || value === undefined) {
      if (prefix) row[prefix] = "";
      return;
    }
    if (typeof value === "object") {
      if (typeof (value as { toDate?: () => Date }).toDate === "function") {
        row[prefix] = (value as { toDate: () => Date }).toDate().toISOString();
        return;
      }
      for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
        walk(nested, prefix ? `${prefix}.${key}` : key, depth + 1);
      }
      return;
    }
    row[prefix] = typeof value === "number" ? value : String(value);
  };
  walk(data, "", 0);
  return row;
}

function toCsv(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return "id\n";
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const escape = (value: unknown) => {
    const text = value === undefined || value === null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((header) => escape(row[header])).join(","));
  return `${lines.join("\n")}\n`;
}

/** Shape guards retained so future exports stay type-checked against the models. */
export type ExportedEntities = UserDoc | BookingDoc | SubscriptionDoc | PhotoDoc;
export const PLAN_LABELS = Object.fromEntries(Object.entries(PLANS).map(([key, plan]) => [key, plan.label]));
export const EXPORTABLE_ROLES = ADMIN_ROLES;
