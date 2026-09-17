#!/usr/bin/env node
/**
 * Seed script — bootstraps a brand-new Firebase project with the launch catalogue.
 *
 * Usage:
 *   cd functions && npm run build && node ../scripts/seed.mjs
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/seed.mjs --force
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/seed.mjs
 *
 * What it writes (all idempotent — existing values are preserved unless --force):
 *   config/app, config/creditCosts, config/bookingPolicy, config/subscriptionProducts
 *   filters/{filterId}   (10 launch filters)
 *   packages/{packageId} (3 launch packages)
 *
 * It also optionally promotes a first superadmin (`--admin=email@example.com`) which is the
 * ONLY safe way to bootstrap admin access on a fresh project.
 */
import { createRequire } from "module";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

// Load compiled constants so the seed never drifts from the deployed defaults.
function loadConstants() {
  const candidates = [
    resolve(here, "../functions/lib/config/constants.js"),
    resolve(here, "../functions/src/config/constants.ts"),
  ];
  for (const candidate of candidates) {
    if (candidate.endsWith(".js")) {
      try {
        return require(candidate);
      } catch {
        /* try next */
      }
    }
  }
  throw new Error(
    "Hindi mahanap ang compiled constants. Patakbuhin muna ang `npm --prefix functions run build`."
  );
}

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const ADMIN_EMAIL = (args.find((a) => a.startsWith("--admin=")) ?? "").replace("--admin=", "") || null;

async function main() {
  const admin = await import("firebase-admin/app").catch(() => null);
  if (!admin) {
    console.error(
      "Kailangan ng firebase-admin. Patakbuhin: cd functions && npm install"
    );
    process.exitCode = 1;
    return;
  }

  const { initializeApp, getApps, applicationDefault } = await import("firebase-admin/app");
  const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
  const { getAuth } = await import("firebase-admin/auth");

  if (getApps().length === 0) {
    initializeApp({
      credential: applicationDefault(),
      projectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || undefined,
    });
  }

  const db = getFirestore();
  const auth = getAuth();
  const constants = loadConstants();

  console.log(`\n🔥 Photobooth backend seed  —  project: ${db.projectId ?? "(emulator)"}\n`);

  // ---------------------------------------------------------------- config
  const configDocs = [
    [
      "config/app",
      {
        maintenanceMode: false,
        minAppVersion: "1.0.0",
        uploadsEnabled: true,
        aiFiltersEnabled: true,
        signupBonusCredits: 150,
        referralBonusCredits: 50,
        freeDailyPhotoLimit: constants.PLANS.free.maxPhotosPerDay,
        sharingEnabled: true,
        printOrdersEnabled: true,
        bookingsEnabled: true,
        announcement: null,
      },
    ],
    ["config/creditCosts", constants.CREDIT_COSTS],
    [
      "config/bookingPolicy",
      {
        minLeadTimeHours: 2,
        maxAdvanceDays: 180,
        cancellationCutoffHours: 24,
        refundPercent: 100,
        maxAttendeesPerBooking: 20,
        requirePhone: true,
        depositPercent: 0,
      },
    ],
    [
      "config/subscriptionProducts",
      {
        products: [
          {
            productId: "photobooth.premium.monthly",
            planId: "premium",
            platform: "ios",
            priceMinorUnits: constants.PLANS.premium.priceMinorUnits,
            currency: "PHP",
            creditsGranted: constants.PLANS.premium.monthlyCredits,
            durationDays: 30,
            trialDays: 3,
          },
          {
            productId: "photobooth.premium.monthly",
            planId: "premium",
            platform: "android",
            priceMinorUnits: constants.PLANS.premium.priceMinorUnits,
            currency: "PHP",
            creditsGranted: constants.PLANS.premium.monthlyCredits,
            durationDays: 30,
            trialDays: 3,
          },
          {
            productId: "photobooth.studio.monthly",
            planId: "studio",
            platform: "web",
            priceMinorUnits: constants.PLANS.studio.priceMinorUnits,
            currency: "PHP",
            creditsGranted: constants.PLANS.studio.monthlyCredits,
            durationDays: 30,
            trialDays: 0,
          },
        ],
      },
    ],
  ];

  let configWritten = 0;
  for (const [path, payload] of configDocs) {
    const ref = db.doc(path);
    const existing = await ref.get();
    if (existing.exists && !FORCE) {
      console.log(`  · ${path} — may laman na, nilaktawan (gamitin ang --force para i-overwrite)`);
      continue;
    }
    await ref.set({ ...payload, seededAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    configWritten += 1;
    console.log(`  ✓ ${path}`);
  }

  // ---------------------------------------------------------------- filters
  const filters = [
    { filterId: "none", slug: "none", name: "Original", description: "Walang filter — orihinal na litrato.", prompt: "", isPremium: false, priceMinorUnits: 0, category: "basic", color: "#B8B8D0", sortOrder: 0 },
    { filterId: "anime", slug: "anime", name: "Anime", description: "Anime style na may makulay na kulay.", prompt: "anime style, vibrant colors, studio ghibli inspired, highly detailed", isPremium: false, priceMinorUnits: 0, category: "artistic", color: "#FF4DA6", sortOrder: 1 },
    { filterId: "cyberpunk", slug: "cyberpunk", name: "Cyberpunk", description: "Neon futuristic na itsura.", prompt: "cyberpunk neon lights, futuristic, blade runner style, dark atmosphere", isPremium: true, priceMinorUnits: 4900, category: "artistic", color: "#00BCD4", sortOrder: 2 },
    { filterId: "vintage", slug: "vintage", name: "Vintage", description: "1950s retro film na kulay.", prompt: "1950s vintage photograph, sepia tones, retro film grain", isPremium: false, priceMinorUnits: 0, category: "basic", color: "#FFD600", sortOrder: 3 },
    { filterId: "oil-painting", slug: "oil-painting", name: "Oil Painting", description: "Impressionist na brush strokes.", prompt: "oil painting, impressionist style, van gogh, visible brush strokes", isPremium: true, priceMinorUnits: 4900, category: "artistic", color: "#7B61FF", sortOrder: 4 },
    { filterId: "pop-art", slug: "pop-art", name: "Pop Art", description: "Andy Warhol style na bold colors.", prompt: "andy warhol pop art style, bold primary colors, repeated pattern", isPremium: true, priceMinorUnits: 4900, category: "artistic", color: "#FF5252", sortOrder: 5 },
    { filterId: "watercolor", slug: "watercolor", name: "Watercolor", description: "Malambot na watercolor na kulay.", prompt: "watercolor painting, soft colors, artistic brushwork", isPremium: false, priceMinorUnits: 0, category: "artistic", color: "#00E676", sortOrder: 6 },
    { filterId: "sketch", slug: "sketch", name: "Pencil Sketch", description: "Black and white na hand-drawn look.", prompt: "pencil sketch, black and white, hand-drawn, detailed linework", isPremium: false, priceMinorUnits: 0, category: "utility", color: "#B8B8D0", sortOrder: 7 },
    { filterId: "pixel-art", slug: "pixel-art", name: "Pixel Art", description: "8-bit retro game na itsura.", prompt: "pixel art, 8-bit style, retro game aesthetic", isPremium: true, priceMinorUnits: 4900, category: "artistic", color: "#FF9800", sortOrder: 8 },
    { filterId: "christmas", slug: "christmas", name: "Pasko", description: "Seasonal Christmas na tema.", prompt: "christmas themed photo, warm lights, festive, snow", isPremium: false, priceMinorUnits: 0, category: "seasonal", color: "#00E676", sortOrder: 9 },
  ];

  let filtersWritten = 0;
  for (const filter of filters) {
    const ref = db.collection("filters").doc(filter.filterId);
    const existing = await ref.get();
    if (existing.exists && !FORCE) continue;
    await ref.set(
      {
        ...filter,
        negativePrompt: "blurry, distorted, deformed, low quality",
        strength: filter.filterId === "none" ? 0 : 0.65,
        currency: "PHP",
        isActive: true,
        usageCount: existing.exists ? (existing.data()?.usageCount ?? 0) : 0,
        createdAt: existing.exists ? existing.data()?.createdAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    filtersWritten += 1;
  }
  console.log(`  ✓ filters — ${filtersWritten} naisulat`);

  // ---------------------------------------------------------------- packages
  const packages = [
    { packageId: "pkg_basic", name: "Basic Booth", description: "1 oras na photobooth, 50 prints, basic filters.", priceMinorUnits: 499000, durationMinutes: 60, photosIncluded: 100, printsIncluded: 50, includesGif: false, includesPremiumFilters: false, sortOrder: 0 },
    { packageId: "pkg_premium", name: "Premium Booth", description: "3 oras na photobooth, 200 prints, AI filters at GIF.", priceMinorUnits: 1299000, durationMinutes: 180, photosIncluded: 400, printsIncluded: 200, includesGif: true, includesPremiumFilters: true, sortOrder: 1 },
    { packageId: "pkg_wedding", name: "Wedding Package", description: "Buong araw na photobooth, unlimited prints, custom frame.", priceMinorUnits: 2499000, durationMinutes: 480, photosIncluded: 1500, printsIncluded: 500, includesGif: true, includesPremiumFilters: true, sortOrder: 2 },
  ];

  let packagesWritten = 0;
  for (const pkg of packages) {
    const ref = db.collection("packages").doc(pkg.packageId);
    const existing = await ref.get();
    if (existing.exists && !FORCE) continue;
    await ref.set(
      {
        ...pkg,
        currency: "PHP",
        isActive: true,
        createdAt: existing.exists ? existing.data()?.createdAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    packagesWritten += 1;
  }
  console.log(`  ✓ packages — ${packagesWritten} naisulat`);

  // ---------------------------------------------------------------- first admin
  if (ADMIN_EMAIL) {
    try {
      const user = await auth.getUserByEmail(ADMIN_EMAIL);
      const now = FieldValue.serverTimestamp();
      await db.collection("adminRoles").doc(user.uid).set(
        {
          uid: user.uid,
          email: ADMIN_EMAIL,
          role: "superadmin",
          status: "active",
          notes: "Bootstrap superadmin (seed script)",
          grantedBy: "seed-script",
          grantedAt: now,
          revokedBy: null,
          revokedAt: null,
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
      await db.collection("users").doc(user.uid).set({ role: "superadmin", updatedAt: now }, { merge: true });
      await auth.setCustomUserClaims(user.uid, { admin: true, role: "superadmin" });
      console.log(`  ✓ superadmin — ${ADMIN_EMAIL} (${user.uid})`);
      console.log("    ⚠  Hilingin sa user na mag-logout at mag-login muli para makuha ang bagong claims.");
    } catch (error) {
      console.error(`  ✗ Hindi ma-promote ang ${ADMIN_EMAIL}: ${error.message}`);
      console.error("    Siguraduhing existing na Firebase Auth account ang email na iyon.");
    }
  } else {
    console.log("  · Walang --admin=email na ibinigay — laktawan ang superadmin bootstrap.");
  }

  console.log("\n✅ Tapos na ang seed.\n");
  console.log("Sunod na hakbang:");
  console.log("  1. firebase deploy --only firestore:rules,firestore:indexes,storage");
  console.log("  2. firebase deploy --only functions");
  console.log("  3. Buksan ang admin panel at mag-login gamit ang superadmin account\n");
}

main().catch((error) => {
  console.error("Nabigo ang seed:", error);
  process.exitCode = 1;
});
