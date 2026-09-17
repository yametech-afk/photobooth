/**
 * ============================================================
 * PREMIUM GATES — reusable gating components:
 *   <FilterLock>      overlay on premium filter thumbnails
 *   <QuotaBanner>     "3 of 5 photos left" bar under the camera
 *   <PremiumBadge>    small crown/badge for locked elements
 * All open the PaywallModal via context when pressed.
 * ============================================================
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSubscription } from '../context/SubscriptionContext';
import { canUseFilter } from '../entitlements/entitlements';
import { PREMIUM_FILTER_IDS } from '../config/plans';

export function isPremiumFilter(filterId) {
  return PREMIUM_FILTER_IDS.includes(filterId);
}

/** Lock chip shown over a premium filter thumbnail. */
export function FilterLock({ filterId, onPressLock }) {
  const { entitlements, openPaywall } = useSubscription();
  const allowed = canUseFilter({ entitlements }, filterId);
  if (allowed || !isPremiumFilter(filterId)) return null;

  return (
    <TouchableOpacity style={styles.lockBadge} onPress={onPressLock || openPaywall}>
      <Text style={styles.lockText}>🔒 PREMIUM</Text>
    </TouchableOpacity>
  );
}

/** Bottom bar showing the remaining daily photo quota; opens paywall at 0. */
export function QuotaBanner() {
  const { remaining, openPaywall } = useSubscription();
  if (!remaining || remaining.unlimited) return null;

  const pct = remaining.limit === 0 ? 0 : Math.round((remaining.used / remaining.limit) * 100);
  return (
    <TouchableOpacity style={styles.banner} onPress={remaining.remaining <= 0 ? openPaywall : undefined} disabled={remaining.remaining > 0}>
      <Text style={[styles.bannerText, remaining.remaining <= 0 && styles.bannerTextEmpty]}>
        {remaining.remaining > 0
          ? `${remaining.remaining} sa ${remaining.limit} na libreng photo ang natitira ngayon`
          : 'Ubos na ang libreng quota ngayon — I-upgrade para unlimited!'}
      </Text>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${Math.min(100, pct)}%` }]} />
      </View>
    </TouchableOpacity>
  );
}

/** Small crown badge for premium items in lists. */
export function PremiumBadge({ label = 'PREMIUM' }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>👑 {label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  lockBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  lockText: { color: '#FFD600', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  banner: {
    backgroundColor: '#252544',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  bannerText: { color: '#B8B8D0', fontSize: 13, textAlign: 'center' },
  bannerTextEmpty: { color: '#FFD600', fontWeight: '700' },
  bar: { height: 4, borderRadius: 2, backgroundColor: '#33335a', marginTop: 8, overflow: 'hidden' },
  barFill: { height: 4, backgroundColor: '#FF4DA6' },
  badge: {
    backgroundColor: 'rgba(255,214,0,0.15)',
    borderWidth: 1,
    borderColor: '#FFD600',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  badgeText: { color: '#FFD600', fontSize: 10, fontWeight: '800' },
});
