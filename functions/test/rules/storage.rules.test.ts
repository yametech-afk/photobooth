/**
 * Storage Security Rules — emulator suite (devops v4)
 * ============================================================
 * Runs through: cd functions && npm run test:rules
 *
 * Covers the root storage.rules posture: ownership by path segment, 10 MB
 * ceiling, image/* content types, and that public/photos/* is functions-only.
 * As with the Firestore suite, these assertions mirror the rules and the QA
 * pack's map, but have not been executed yet — the emulator run is the proof.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { getBytes, ref, uploadBytes } from 'firebase/storage';

const PROJECT_ID = 'photobooth-rules-test';
const REPO_ROOT = path.resolve(__dirname, '../../..');

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: {
      rules: readFileSync(path.join(REPO_ROOT, 'storage.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearStorage();
});

const bytes = (kb: number) => new Uint8Array(kb * 1024);

async function seedFile(storagePath: string, data: Uint8Array, contentType: string) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), storagePath), data, { contentType });
  });
}

describe('Storage rules — owner paths', () => {
  it('S-01 allows a 200 KB image/jpeg upload to the owner path', async () => {
    const ctx = testEnv.authenticatedContext('u1');
    await assertSucceeds(
      uploadBytes(ref(ctx.storage(), 'users/u1/photos/a.jpg'), bytes(200), {
        contentType: 'image/jpeg',
      }),
    );
  });

  it('S-02 denies an 11 MB upload on the owner path', async () => {
    const ctx = testEnv.authenticatedContext('u1');
    await assertFails(
      uploadBytes(ref(ctx.storage(), 'users/u1/photos/big.jpg'), bytes(11 * 1024), {
        contentType: 'image/jpeg',
      }),
    );
  });

  it('S-03 denies a non-image content type on the owner path', async () => {
    const ctx = testEnv.authenticatedContext('u1');
    await assertFails(
      uploadBytes(ref(ctx.storage(), 'users/u1/photos/doc.pdf'), bytes(50), {
        contentType: 'application/pdf',
      }),
    );
  });

  it('S-04 denies writing into another user path', async () => {
    const ctx = testEnv.authenticatedContext('u2');
    await assertFails(
      uploadBytes(ref(ctx.storage(), 'users/u1/photos/evil.jpg'), bytes(50), {
        contentType: 'image/jpeg',
      }),
    );
  });

  it('S-05 denies an unauthenticated read of a stored photo', async () => {
    await seedFile('users/u1/photos/a.jpg', bytes(50), 'image/jpeg');
    const anon = testEnv.unauthenticatedContext();
    await assertFails(getBytes(ref(anon.storage(), 'users/u1/photos/a.jpg')));
  });
});

describe('Storage rules — functions-only public assets', () => {
  it('S-06 denies a client writing under public/photos/*', async () => {
    const ctx = testEnv.authenticatedContext('u1');
    await assertFails(
      uploadBytes(ref(ctx.storage(), 'public/photos/x.jpg'), bytes(50), {
        contentType: 'image/jpeg',
      }),
    );
  });
});