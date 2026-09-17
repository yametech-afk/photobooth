/**
 * Detox E2E — happy path (P0 + P1 core flow)
 * ============================================================
 * Location: mobile/e2e/happyPath.e2e.js
 * Kailangan: Detox setup (`.detoxrc.js`, jest-circus) + dev client build.
 * Ito ang L3 sa Emulator Strategy — tumatakbo sa totoong emulator/device
 * laban sa local emulator suite.
 * ⚠️ Untested scaffold — i-run pagkatapos i-configure ang Detox.
 * ============================================================
 */

describe('Photobooth happy path (E2E)', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true, permissions: { camera: 'YES', photos: 'YES' } });
  });

  it('1 · onboarding → login (test account)', async () => {
    await element(by.id('onboarding-next')).multiTap(3);
    await element(by.id('login-email')).typeText('e2e@test.local');
    await element(by.id('login-password')).typeText('password123\n');
    await element(by.id('login-submit')).tap();
    await waitFor(element(by.text(/photo credits left/i))).toBeVisible().withTimeout(10000);
  });

  it('2 · Start Booth → camera permission → single capture → PhotoPreview', async () => {
    await element(by.id('start-booth')).tap();
    await waitFor(element(by.id('camera-view'))).toBeVisible().withTimeout(10000);
    await element(by.id('capture-button')).tap();
    await waitFor(element(by.id('photo-preview'))).toBeVisible().withTimeout(10000);
  });

  it('3 · filter + upload → lumalabas sa Gallery (P0-6 happy path)', async () => {
    await element(by.id('filter-vintage')).tap();
    await element(by.id('upload-button')).tap();
    await waitFor(element(by.id('upload-success-banner'))).toBeVisible().withTimeout(20000);
    await element(by.id('nav-back-home')).tap();
    await element(by.id('tab-gallery')).tap();
    await waitFor(element(by.id('gallery-tile-0'))).toBeVisible().withTimeout(10000);
  });

  it('4 · free quota: ika-6 na capture → paywall (P0-5)', async () => {
    // 5 uploads na ang nangyari sa mga naunang iteration o test seed —
    // sa isang totoong run: mag-capture ng 5 beses bago ito.
    await element(by.id('tab-home')).tap();
    await element(by.id('start-booth')).tap();
    await element(by.id('capture-button')).tap();
    await waitFor(element(by.id('paywall-modal'))).toBeVisible().withTimeout(10000);
  });

  it('5 · premium filter lock → paywall, hindi magiging aktibo (P1-3)', async () => {
    await element(by.id('paywall-close')).tap();
    await element(by.id('filter-cyberpunk')).tap(); // isPremium: true
    await waitFor(element(by.id('paywall-modal'))).toBeVisible().withTimeout(5000);
    await element(by.id('paywall-close')).tap();
    // hindi nagiging aktibo ang filter — ang "vintage" pa rin ang selected
    await expect(element(by.id('filter-cyberpunk-selected-badge'))).not.toBeVisible();
  });

  it('6 · logout → nasa auth stack ulit', async () => {
    await element(by.id('tab-settings')).tap();
    await element(by.id('logout-button')).tap();
    await waitFor(element(by.id('login-email'))).toBeVisible().withTimeout(10000);
  });
});
