/**
 * Unit tests sa monetization logic — 100% pure, walang Firebase.
 * ============================================================
 * Location: mobile/__tests__/monetization/ (tumatakbo sa Jest + jest-expo)
 * Orijin ng module: mobile/src/modules/monetization/src/monetization/
 *
 * Sakop: getPeriodKey (UTC), getRemainingPhotos, canCapturePhoto (P0-5:
 * clock rollback), resolveEntitlements, canUseFilter, catalog parity (P1-2).
 * Ito ang mga test na nag-verify ng P1-2 filter-parity sa final monorepo.
 * ============================================================
 */

// ⚠️ I-ajust ang path kung kinakailangan — dual-layering ng module (F-4):
// ang monetization ay nasa src/modules/monetization/src/monetization/ (single-layer, tama)
import {
  ENTITLEMENT_KEYS,
  canUseFilter,
  hasEntitlement,
  isPremium,
  resolveEntitlements,
} from '../src/modules/monetization/src/monetization/entitlements/entitlements';
import {
  applyUsageEntry,
  canCapturePhoto,
  getCurrentPeriodKey,
  getPeriodKey,
} from '../src/modules/monetization/src/monetization/entitlements/usageLimits';
import { PREMIUM_FILTER_IDS } from '../src/modules/monetization/src/monetization/config/plans';
// Camera catalog (parity check) — tingnan P1-2 sa test plan
import { FILTER_CATALOG } from '../src/modules/camera/filters/filterCatalog';

describe('usageLimits — UTC period keys (P0-5)', () => {
  it('buo ang day key na YYYY-MM-DD sa UTC', () => {
    // 2026-09-17 23:30 UTC → "2026-09-17"
    expect(getPeriodKey(new Date('2026-09-17T23:30:00Z'), 'day')).toBe('2026-09-17');
    expect(getPeriodKey(new Date('2026-01-01T00:00:00Z'), 'month')).toBe('2026-01');
  });

  it('UTC-anchored: hindi nababago ng device clock ang key na ginagamit ng mirror', () => {
    const now = new Date('2026-09-17T12:00:00Z');
    // Ang server (Cloud Function) ang may hawak ng period key — ang client ay nagmi-mirror lang.
    expect(getPeriodKey(now, 'day')).toBe('2026-09-17');
    expect(getPeriodKey(new Date(now.getTime() - 26 * 3600e3), 'day')).toBe('2026-09-16');
  });
});

describe('canCapturePhoto — quota decision (P0-5)', () => {
  const usage5 = { [getPeriodKey(new Date(), 'day')]: { photoCount: 5 } };
  const usage4 = { [getPeriodKey(new Date(), 'day')]: { photoCount: 4 } };

  it('free user sa 5/5 → blocked + daily_limit_reached', () => {
    const r = canCapturePhoto({ plan: 'free' }, usage5);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('daily_limit_reached');
  });

  it('free user sa 4/5 → allowed na may remaining=1', () => {
    const r = canCapturePhoto({ plan: 'free' }, usage4);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(1);
  });

  it('premium → walang h–arang (client mirror; server cap 500/day — F-10)', () => {
    const r = canCapturePhoto({ plan: 'premium' }, usage5);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(Infinity); // unang branch: { allowed: true, remaining: Infinity } — walang 'unlimited' key
  });
});

describe('applyUsageEntry — client mirror counter', () => {
  it('tama ang increment at hindi bababa sa 0', () => {
    const key = getCurrentPeriodKey('day');
    let usage = {};
    usage = applyUsageEntry('u1', usage, key, 1);
    expect(usage[key].photoCount).toBe(1);
    usage = applyUsageEntry('u1', usage, key, 1);
    expect(usage[key].photoCount).toBe(2);
  });
});

describe('entitlements — plan resolution', () => {
  it('free user → lahat false', () => {
    const m = resolveEntitlements({ plan: 'free' });
    expect(m[ENTITLEMENT_KEYS.PREMIUM]).toBe(false);
    expect(m[ENTITLEMENT_KEYS.NO_WATERMARK]).toBe(false);
  });

  it('premium user → lahat true', () => {
    const m = resolveEntitlements({ plan: 'premium' });
    expect(m[ENTITLEMENT_KEYS.PREMIUM_FILTERS]).toBe(true);
    expect(m[ENTITLEMENT_KEYS.BURST_MODE]).toBe(true);
    expect(isPremium({ plan: 'premium' })).toBe(true);
  });

  it('granular grant (server-written) ay pinagsasama', () => {
    const m = resolveEntitlements({
      plan: 'free',
      entitlements: { no_watermark: true },
    });
    expect(m.no_watermark).toBe(true);
    expect(m.premium).toBe(false); // ang ibang entitlement ay hindi nasapian
  });

  it('walang user → safe na lahat false (hindi mag-crash)', () => {
    const m = resolveEntitlements(null);
    expect(m[ENTITLEMENT_KEYS.PREMIUM]).toBe(false);
  });
});

describe('filter gating — catalog parity (P1-2)', () => {
  it('bawat isPremium:true sa camera catalog ay nasa PREMIUM_FILTER_IDS', () => {
    const premiumInCatalog = FILTER_CATALOG.filter((f) => f.isPremium).map((f) => f.id);
    expect(premiumInCatalog).toHaveLength(8);
    expect(new Set(premiumInCatalog)).toEqual(new Set(PREMIUM_FILTER_IDS));
  });

  it('free filter ay laging accessible kahit walang entitlement', () => {
    expect(canUseFilter({ plan: 'free' }, 'vintage')).toBe(true);
    expect(canUseFilter({ plan: 'free' }, 'none')).toBe(true);
  });

  it('premium filter ay blocked sa free, open sa premium', () => {
    expect(canUseFilter({ plan: 'free' }, 'cyberpunk')).toBe(false);
    expect(canUseFilter({ plan: 'premium' }, 'cyberpunk')).toBe(true);
  });

  it('showsWatermark: free=true, premium=false', () => {
    expect(resolveEntitlements({ plan: 'free' }).no_watermark).toBe(false);
    expect(resolveEntitlements({ plan: 'premium' }).no_watermark).toBe(true);
  });
});
