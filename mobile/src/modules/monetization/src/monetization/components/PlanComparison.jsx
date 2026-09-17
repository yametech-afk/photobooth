/**
 * ============================================================
 * PLAN COMPARISON — free vs premium feature table.
 * Data-driven from config/plans.js; used inside PaywallModal
 * (compact) and PremiumScreen (full).
 * ============================================================
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PLANS } from '../config/plans';

export default function PlanComparison({ compact = false }) {
  const free = PLANS.free;
  const premium = PLANS.premium;

  // Merge features into rows so the comparison reads line by line.
  const rows = [];
  const maxLen = Math.max(free.features.length, premium.features.length);
  for (let i = 0; i < maxLen; i++) {
    rows.push({
      free: free.features[i] || '',
      premium: premium.features[i] || '',
    });
  }

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={styles.header}>
        <Text style={[styles.colHead, styles.colHeadFree]}>{free.name}</Text>
        <Text style={[styles.colHead, styles.colHeadPrem]}>{premium.name}</Text>
      </View>
      {rows.map((row, i) => (
        <View key={i} style={styles.row}>
          <View style={styles.cell}>
            <Text style={[styles.feature, !row.free && styles.muted]}>{row.free || '—'}</Text>
          </View>
          <View style={[styles.cell, styles.cellPrem]}>
            <Text style={[styles.feature, styles.featurePrem]}>{row.premium || '—'}</Text>
          </View>
        </View>
      ))}
      <View style={styles.footer}>
        <Text style={styles.freePrice}>{free.priceLabel}</Text>
        <Text style={styles.premPrice}>{premium.priceLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#33335a' },
  wrapCompact: { marginTop: 8 },
  header: { flexDirection: 'row', backgroundColor: '#252544' },
  colHead: { flex: 1, paddingVertical: 10, textAlign: 'center', fontWeight: '800', fontSize: 14 },
  colHeadFree: { color: '#B8B8D0' },
  colHeadPrem: { color: '#FFD600' },
  row: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#33335a' },
  cell: { flex: 1, paddingVertical: 8, paddingHorizontal: 8 },
  cellPrem: { backgroundColor: 'rgba(255,214,0,0.05)' },
  feature: { color: '#B8B8D0', fontSize: 12, textAlign: 'center' },
  featurePrem: { color: '#fff', fontWeight: '600' },
  muted: { opacity: 0.3 },
  footer: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#33335a', backgroundColor: '#1A1A2E' },
  freePrice: { flex: 1, textAlign: 'center', paddingVertical: 10, color: '#B8B8D0', fontWeight: '700' },
  premPrice: { flex: 1, textAlign: 'center', paddingVertical: 10, color: '#FFD600', fontWeight: '800' },
});
