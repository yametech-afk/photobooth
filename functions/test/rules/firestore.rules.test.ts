/**
 * Firestore Security Rules — emulator suite (devops v4)
 * ============================================================
 * Runs through:
 *   cd functions && npm run test:rules
 * which wraps the run in `firebase emulators:exec --only firestore,storage,auth`
 * (ports 8080 / 9199 / 9099 from the root firebase.json).
 *
 * Source of truth: the ROOT firestore.rules. The reference copy under devops/
 * is never loaded here — that divergence is tracked in devops/docs/RULES-PARITY.md.
 *
 * The allow/deny pairs below are derived from the root rules and from the
 * collection-by-collection map in the QA pack (docs/qa/05-EMULATOR-STRATEGY.md §5).
 * They have NOT been executed yet: the emulator suite needs Java + firebase-tools,
 * which the assembly sandbox did not have. Treat a green local run as the proof.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const PROJECT_ID = 'photobooth-rules-test';
const REPO_ROOT = path.resolve(__dirname, '../../..'); // functions/test/rules -> repo root

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(path.join(REPO_ROOT, 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

const asUser = (uid: string, claims: Record<string, unknown> = {}) =>
  testEnv.authenticatedContext(uid, claims).firestore();

const asAnon = () => testEnv.unauthenticatedContext().firestore();

/** Seed privileged documents the way Cloud Functions (Admin SDK) would. */
async function seed(build: (db: any) => Promise<unknown>) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await build(ctx.firestore());
  });
}

describe('Firestore rules — default posture', () => {
  it('R-01 denies reads of an unlisted collection to a signed-in user', async () => {
    await assertFails(asUser('u1').doc('notACollection/x').get());
  });

  it('R-02 denies everything to an unauthenticated client', async () => {
    await assertFails(asAnon().doc('users/u1').get());
  });
});

describe('Firestore rules — users', () => {
  it('R-03 denies a client-created user document', async () => {
    await assertFails(
      asUser('u1').doc('users/u1').set({
        uid: 'u1',
        email: 'u1@example.com',
        createdAt: new Date(),
      }),
    );
  });

  it('R-04 allows an owner to update cosmetic fields only', async () => {
    await seed((db) => db.doc('users/u1').set({ uid: 'u1', plan: 'free', displayName: 'A' }));
    await assertSucceeds(asUser('u1').doc('users/u1').update({ displayName: 'B' }));
  });

  it('R-05 denies an owner self-upgrading to premium (plan is server-owned)', async () => {
    await seed((db) => db.doc('users/u1').set({ uid: 'u1', plan: 'free' }));
    await assertFails(asUser('u1').doc('users/u1').update({ plan: 'premium' }));
  });

  it('R-06 denies an owner self-granting credits', async () => {
    await seed((db) => db.doc('users/u1').set({ uid: 'u1', plan: 'free', creditsRemaining: 1 }));
    await assertFails(asUser('u1').doc('users/u1').update({ creditsRemaining: 9999 }));
  });

  it('R-07 denies reading another user document', async () => {
    await seed((db) => db.doc('users/u2').set({ uid: 'u2', plan: 'free' }));
    await assertFails(asUser('u1').doc('users/u2').get());
  });
});

describe('Firestore rules — server-owned collections', () => {
  it('R-08 denies the owner writing their own quota document', async () => {
    await assertFails(asUser('u1').doc('quotas/u1').set({ creditsRemaining: 9999 }));
  });

  it('R-09 denies the owner writing the quota ledger', async () => {
    await assertFails(asUser('u1').doc('quotaLedger/l1').set({ uid: 'u1', delta: 100 }));
  });

  it('R-10 denies the owner forging a subscription', async () => {
    await assertFails(asUser('u1').doc('subscriptions/u1').set({ uid: 'u1', status: 'active' }));
  });

  it('R-11 denies client writes to adminRoles and allows the owner to read their own subscription', async () => {
    await assertFails(asUser('u1').doc('adminRoles/u1').set({ role: 'superadmin', status: 'active' }));
    await seed((db) => db.doc('subscriptions/u1').set({ uid: 'u1', status: 'active' }));
    await assertSucceeds(asUser('u1').doc('subscriptions/u1').get());
  });

  it('R-12 denies writing audit logs and analytics events', async () => {
    await assertFails(asUser('u1').doc('auditLogs/a1').set({ action: 'forged' }));
    await assertFails(asUser('u1').doc('analytics_events/e1').set({ name: 'forged' }));
  });
});

describe('Firestore rules — photos', () => {
  it('R-13 allows any signed-in user to read a public photo', async () => {
    await seed((db) =>
      db.doc('photos/p1').set({ uid: 'owner1', isPublic: true, visibility: 'public' }),
    );
    await assertSucceeds(asUser('u2').doc('photos/p1').get());
  });

  it('R-14 denies a non-owner reading a private photo', async () => {
    await seed((db) =>
      db.doc('photos/p2').set({ uid: 'owner1', isPublic: false, visibility: 'private' }),
    );
    await assertFails(asUser('u2').doc('photos/p2').get());
  });

  it('R-15 denies a client creating a photo document directly', async () => {
    await assertFails(
      asUser('u1').doc('photos/p3').set({
        uid: 'u1',
        storagePath: 'users/u1/photos/a.jpg',
        isPublic: false,
      }),
    );
  });
});

describe('Firestore rules — admin authority requires BOTH claim and live role doc', () => {
  it('R-16 denies an admin claim with no live adminRoles document (stale/forged token)', async () => {
    await seed((db) => db.doc('users/u1').set({ uid: 'u1', plan: 'free' }));
    await assertFails(asUser('ghost', { admin: true, role: 'admin' }).doc('users/u1').get());
  });

  it('R-17 denies an admin claim whose adminRoles document is revoked', async () => {
    await seed(async (db) => {
      await db.doc('users/u1').set({ uid: 'u1', plan: 'free' });
      await db.doc('adminRoles/revoked1').set({ uid: 'revoked1', role: 'admin', status: 'revoked' });
    });
    await assertFails(
      asUser('revoked1', { admin: true, role: 'admin' }).doc('users/u1').get(),
    );
  });

  it('R-18 allows an admin claim backed by an active adminRoles document', async () => {
    await seed(async (db) => {
      await db.doc('users/u1').set({ uid: 'u1', plan: 'free' });
      await db.doc('adminRoles/admin1').set({ uid: 'admin1', role: 'superadmin', status: 'active' });
    });
    await assertSucceeds(asUser('admin1', { admin: true, role: 'superadmin' }).doc('users/u1').get());
  });
});