/**
 * ============================================================
 * USAGE LIMITS — period-key counters (e.g. "2026-09-16").
 *
 * Client side = UX mirror (show "3 of 5 photos left", block the
 * capture button). AUTHORITATIVE enforcement happens in the Cloud
 * Function quota guard (cloud/validateReceipt.js -> assertPhotoQuota)
 * so a tampered client cannot exceed the free quota.
 *
 * Period keys are always UTC so device clock changes don't grant
 * extra photos.
 * ============================================================
 */

import { USAGE_LIMITS } from '../config/plans';

/** Build the period key. granularity: 'day' | 'month' (UTC). */
export function getPeriodKey(date = new Date(), granularity = 'day') {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  if (granularity === 'month') return `${y}-${m}`;
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCurrentPeriodKey(granularity = 'day') {
  return getPeriodKey(new Date(), granularity);
}

export function getLimit(planId, key) {
  const limits = USAGE_LIMITS[planId] || USAGE_LIMITS.free;
  return limits[key];
}

/**
 * Resolve remaining photos for a user in the CURRENT period.
 * @param {{plan?: string}} user
 * @param {Record<string, {photoCount?: number}>} usage e.g. {"2026-09-16": {photoCount: 3}}
 */
export function getRemainingPhotos(user, usage = {}) {
  const plan = user?.plan || 'free';
  const limit = getLimit(plan, 'photosPerDay');
  const key = getCurrentPeriodKey('day');
  const used = usage?.[key]?.photoCount || 0;
  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
    periodKey: key,
    unlimited: !Number.isFinite(limit),
  };
}

/** Decision used by the camera screen before every capture. */
export function canCapturePhoto(user, usage = {}) {
  const { limit, used, remaining, unlimited, periodKey } = getRemainingPhotos(user, usage);
  if (unlimited) return { allowed: true, remaining: Infinity, periodKey };
  if (used >= limit) {
    return { allowed: false, remaining: 0, periodKey, reason: 'daily_limit_reached' };
  }
  return { allowed: true, remaining, periodKey };
}

/** Increment the client mirror counter (server does the authoritative write). */
export function applyUsageEntry(_userId, usage, periodKey, delta = 1) {
  const entry = usage?.[periodKey] || { photoCount: 0 };
  return {
    ...usage,
    [periodKey]: {
      photoCount: Math.max(0, (entry.photoCount || 0) + delta),
      updatedAt: new Date().toISOString(),
    },
  };
}
