/**
 * Contract test — client wrappers vs backend callable names (P0-7, P0-8 / F-2, F-3)
 * ============================================================
 * Ang mismong tinitingnan: ang strings na ipinapasa sa httpsCallable() at
 * ang region sa getFunctions() ay tugma sa totoong exports ng backend.
 *
 * Static ang pagsusuri (binabasa ang source files) kaya hindi nangangailangan
 * ng emulator — tumatakbo ito sa Jest kahit sa CI na walang Firebase.
 * ============================================================
 */
import fs from 'node:fs';
import path from 'node:path';

const MOBILE_SRC = path.resolve(__dirname, '../../src');
const FUNCTIONS_SRC = path.resolve(__dirname, '../../../functions/src');

function read(p) { return fs.readFileSync(p, 'utf8'); }

describe('Functions contract — region pinning (P0-7 / F-2)', () => {
  it('mobile core functions.ts ay naka-pin sa asia-southeast1', () => {
    const src = read(path.join(MOBILE_SRC, 'services/functions.ts'));
    expect(src).toMatch(/getFunctions\(\s*firebaseApp\s*,\s*['"]asia-southeast1['"]\s*\)/);
  });

  it('backend REGION constant ay asia-southeast1', () => {
    const src = read(path.join(FUNCTIONS_SRC, 'config/constants.ts'));
    expect(src).toMatch(/export const REGION = "asia-southeast1"/);
  });
});

describe('Functions contract — callable names (P0-8 / F-3)', () => {
  // Kinokolekta ang totoong exports mula sa backend callables
  const callableFiles = ['auth.ts', 'photos.ts', 'subscriptions.ts', 'events.ts', 'admin.ts'];
  const backendNames = new Set();
  for (const f of callableFiles) {
    const src = read(path.join(FUNCTIONS_SRC, 'callables', f));
    for (const m of src.matchAll(/export const ([a-zA-Z0-9_]+)/g)) backendNames.add(m[1]);
  }

  // Kinokolekta ang mga client-called names sa lahat ng wrapper layers.
  // Tight regex: hahanapin lang ang httpsCallable<T>(functions, 'name') na porma
  // upang hindi madamay ang mga literal na 'unlimited' sa mga uri ng pagbabalik.
  const clientFiles = [
    'services/functions.ts',
    'modules/preview-editor/src/modules/preview-editor/services/cloudFunctions.ts',
  ];
  const clientNames = new Set();
  for (const f of clientFiles) {
    const p = path.join(MOBILE_SRC, f);
    if (!fs.existsSync(p)) continue;
    const src = read(p);
    for (const m of src.matchAll(
      /httpsCallable[\s\S]{0,160}?\(\s*functions\s*,\s*['"]([a-zA-Z][a-zA-Z0-9_]+)['"]\s*\)/g
    )) {
      clientNames.add(m[1]);
    }
  }

  it('bawat client-called callable ay may tugmang backend export', () => {
    const missing = [...clientNames].filter((n) => !backendNames.has(n));
    expect({ missing, backendSample: [...backendNames].slice(0, 5) }).toEqual({
      missing: [],
      backendSample: expect.any(Array),
    });
  });

  it('smoke list: mga kritikal na callable ay umiiral', () => {
    for (const name of [
      'bootstrapSession', 'getQuota', 'requestPhotoUpload',
      'finalizePhotoUpload', 'reportUploadFailed', 'verifyPremiumPurchase',
      'createPhotoShare', 'createEventBooking', 'adminListUsers',
    ]) {
      expect(backendNames.has(name)).toBe(true);
    }
  });
});
