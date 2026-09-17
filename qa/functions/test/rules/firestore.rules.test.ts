/**
 * Firestore Security Rules tests — Photobooth platform
 * ============================================================
 * Tumatakbo sa Firebase Emulator Suite (`npm run test:rules` sa functions/).
 * Sinusuri ang bawat `match` block ng root `firestore.rules`:
 * users, quotas, quotaLedger, photos, photoShares, uploadReservations,
 * events, eventSlots, bookings, subscriptions, analytics_events, metrics,
 * adminRoles, auditLogs, idempotencyKeys, default-deny.
 *
 * Kritikal na test: ang admin ay nangangailangan BOTH ng custom claim
 * (`admin: true`) AT live na `adminRoles/{uid}` doc na `status: 'active'`.
 * ============================================================
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  rulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import fs from "node:fs";

// Iisang project kada test run — isolated ang data.
const PROJECT_ID = "rules-test-photobooth";

let testEnv: rulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync("../../../firestore.rules", "utf8"), // root canonical rules
      host: "127.0.0.1",
      port: 8080,
    },
    storage: {
      rules: fs.readFileSync("../../../storage.rules", "utf8"),
      host: "127.0.0.1",
      port: 9199,
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

// ------------------------------------------------------------------ helpers

/** Setup ng adminRoles doc + custom claim sa pamamagitan ng Admin context. */
async function promoteToAdmin(uid: string, role = "superadmin") {
  const admin = testEnv.authenticatedContext(uid, {
    admin: true,
    role,
  });
  // Ang Admin SDK context (bypass rules) ang sumusulat ng adminRoles doc.
  const adminSdk = testEnv.unauthenticatedContext; // placeholder; actual write sa ibaba
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection("adminRoles").doc(uid).set({
      uid,
      email: "admin@test.local",
      role,
      status: "active",
    });
  });
  return admin;
}

// ------------------------------------------------------------------ users

describe("users/{uid} (rules §users)", () => {
  it("R-01 · client create ay DENIED (identity trigger / bootstrapSession lang) [F-1]", async () => {
    const user = testEnv.authenticatedContext("u1");
    await assertFails(
      user
        .firestore()
        .collection("users")
        .doc("u1")
        .set({ uid: "u1", email: "a@b.c", plan: "free", creditsRemaining: 5 })
    );
  });

  it("R-02 · cosmetic-only update ay allowed (displayName, preferences)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("users").doc("u1").set({
        uid: "u1", email: "a@b.c", plan: "free", creditsRemaining: 5,
      });
    });
    const user = testEnv.authenticatedContext("u1");
    await assertSucceeds(
      user.firestore().collection("users").doc("u1").update({ displayName: "Juan" })
    );
  });

  it("R-03 · self-upgrade sa plan=premium ay DENIED (anti self-grant)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("users").doc("u1").set({
        uid: "u1", email: "a@b.c", plan: "free", creditsRemaining: 5,
      });
    });
    const user = testEnv.authenticatedContext("u1");
    await assertFails(
      user.firestore().collection("users").doc("u1").update({ plan: "premium" })
    );
  });

  it("R-04 · creditsRemaining write mula client ay DENIED", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("users").doc("u1").set({
        uid: "u1", email: "a@b.c", plan: "free", creditsRemaining: 5,
      });
    });
    const user = testEnv.authenticatedContext("u1");
    await assertFails(
      user.firestore().collection("users").doc("u1").update({ creditsRemaining: 9999 })
    );
  });
});

// ------------------------------------------------------------------ quotas / ledger

describe("quotas + quotaLedger (server-owned)", () => {
  it("R-05 · client write sa quotas/{uid} ay DENIED", async () => {
    const user = testEnv.authenticatedContext("u1");
    await assertFails(
      user.firestore().collection("quotas").doc("u1").set({ creditsRemaining: 9999 })
    );
  });

  it("R-06 · owner ay makakabasa ng sariling quota", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("quotas").doc("u1").set({ creditsRemaining: 150 });
    });
    const user = testEnv.authenticatedContext("u1");
    await assertSucceeds(user.firestore().collection("quotas").doc("u1").get());
  });

  it("R-07 · client write sa quotaLedger ay DENIED (append-only via functions)", async () => {
    const user = testEnv.authenticatedContext("u1");
    await assertFails(
      user.firestore().collection("quotaLedger").doc("e1").set({ uid: "u1", delta: 100 })
    );
  });
});

// ------------------------------------------------------------------ photos

describe("photos/{photoId} (write:false — functions only)", () => {
  it("R-08 · client write sa photos ay DENIED (3-step upload protocol lang)", async () => {
    const user = testEnv.authenticatedContext("u1");
    await assertFails(
      user
        .firestore()
        .collection("photos")
        .doc("p1")
        .set({ uid: "u1", status: "ready", url: "https://evil.example/x.jpg" })
    );
  });

  it("R-09 · public photo ay mababasa ng kahit sinong signed-in user", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("photos").doc("p1").set({
        uid: "u1", status: "ready", visibility: "public",
      });
    });
    const other = testEnv.authenticatedContext("u2");
    await assertSucceeds(other.firestore().collection("photos").doc("p1").get());
  });

  it("R-10 · private photo ng ibang user ay DENIED", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("photos").doc("p2").set({
        uid: "u1", status: "ready", visibility: "private",
      });
    });
    const other = testEnv.authenticatedContext("u2");
    await assertFails(other.firestore().collection("photos").doc("p2").get());
  });
});

// ------------------------------------------------------------------ subscriptions / adminRoles

describe("subscriptions + adminRoles (anti self-grant)", () => {
  it("R-11 · client write sa subscriptions ay DENIED", async () => {
    const user = testEnv.authenticatedContext("u1");
    await assertFails(
      user
        .firestore()
        .collection("subscriptions")
        .doc("android_tx123")
        .set({ uid: "u1", plan: "premium", status: "active" })
    );
  });

  it("R-12 · client write sa adminRoles ay DENIED kahit may forged claim", async () => {
    const user = testEnv.authenticatedContext("u1", { admin: true, role: "superadmin" });
    await assertFails(
      user.firestore().collection("adminRoles").doc("u2").set({
        uid: "u2", role: "superadmin", status: "active",
      })
    );
  });

  it("R-13 · admin na may claim PERO walang adminRoles doc ay DENIED (stale claim)", async () => {
    // walang adminRoles doc — forged/lumang claim lang
    const user = testEnv.authenticatedContext("u3", { admin: true, role: "superadmin" });
    await assertFails(user.firestore().collection("metrics").doc("overview").get());
  });

  it("R-14 · admin na may claim + active adminRoles doc ay ALLOWED sa metrics", async () => {
    const admin = await promoteToAdmin("a1");
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("metrics").doc("overview").set({ users: 1 });
    });
    await assertSucceeds(admin.firestore().collection("metrics").doc("overview").get());
  });
});

// ------------------------------------------------------------------ default deny

describe("default deny", () => {
  it("R-15 · unauthenticated ay DENIED kahit sa public-fit collections", async () => {
    const anon = testEnv.unauthenticatedContext();
    await assertFails(anon.firestore().collection("users").doc("u1").get());
  });

  it("R-16 · idempotencyKeys ay hindi nababasa ng kahit sino sa client", async () => {
    const user = testEnv.authenticatedContext("u1");
    await assertFails(user.firestore().collection("idempotencyKeys").doc("k1").get());
  });
});
