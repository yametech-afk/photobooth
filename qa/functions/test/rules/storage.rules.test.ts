/**
 * Storage Security Rules tests — Photobooth platform
 * ============================================================
 * Tumatakbo sa Firebase Emulator Suite (`npm run test:rules`).
 * Sinusuri ang root `storage.rules`: size limits, MIME checks,
 * path scoping, at `public/photos/*` na functions-only.
 * ============================================================
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  rulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import fs from "node:fs";

const PROJECT_ID = "rules-test-photobooth";
let testEnv: rulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: {
      rules: fs.readFileSync("../../../storage.rules", "utf8"),
      host: "127.0.0.1",
      port: 9199,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]); // JPEG magic
const EXE = new Uint8Array([0x4d, 0x5a, 0x00, 0x00]); // MZ (PE binary)

describe("users/{uid}/photos (≤10MB, image/*)", () => {
  it("S-01 · sariling JPEG ≤10MB ay allowed", async () => {
    const user = testEnv.authenticatedContext("u1");
    await assertSucceeds(
      user.storage().ref("users/u1/photos/p1.jpg").put(JPG, { contentType: "image/jpeg" })
    );
  });

  it("S-02 · path ng ibang user ay DENIED", async () => {
    const intruder = testEnv.authenticatedContext("u2");
    await assertFails(
      intruder.storage().ref("users/u1/photos/p1.jpg").put(JPG, { contentType: "image/jpeg" })
    );
  });

  it("S-03 · executable (.exe na MIME) ay DENIED", async () => {
    const user = testEnv.authenticatedContext("u1");
    await assertFails(
      user
        .storage()
        .ref("users/u1/photos/bad.exe")
        .put(EXE, { contentType: "application/x-msdownload" })
    );
  });

  it("S-04 · >10MB ay DENIED (buffer overrun sa limit)", async () => {
    const user = testEnv.authenticatedContext("u1");
    const big = new Uint8Array(10 * 1024 * 1024 + 1); // 10MB + 1 byte
    await assertFails(
      user.storage().ref("users/u1/photos/big.jpg").put(big, { contentType: "image/jpeg" })
    );
  });
});

describe("public/photos/* (functions-only write, public read)", () => {
  it("S-05 · client write ay DENIED kahit admin-claim pa", async () => {
    const user = testEnv.authenticatedContext("u1", { admin: true });
    await assertFails(
      user.storage().ref("public/photos/p1.jpg").put(JPG, { contentType: "image/jpeg" })
    );
  });
});

describe("users/{uid}/exports (≤25MB, image|pdf)", () => {
  it("S-06 · PDF export ≤25MB ay allowed", async () => {
    const user = testEnv.authenticatedContext("u1");
    await assertSucceeds(
      user
        .storage()
        .ref("users/u1/exports/strip.pdf")
        .put(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { contentType: "application/pdf" })
    );
  });
});
