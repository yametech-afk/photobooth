/**
 * ============================================================
 * PAYWALL MODAL — shown automatically by the quota guard and
 * by any premium-gated action. Includes plan comparison summary,
 * purchase CTA, restore-purchases placeholder, and a link to the
 * full Premium screen.
 * ============================================================
 */

import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useSubscription } from '../context/SubscriptionContext';
import { PLANS, CURRENCY } from '../config/plans';
import PlanComparison from './PlanComparison';

export default function PaywallModal({ visible, source = 'quota', onClose }) {
  const { plan, purchase, restore, busy, lastError } = useSubscription();
  const premium = PLANS.premium;

  if (!visible) return null;

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.kicker}>UNLOCK PHOTOBOOTH PREMIUM</Text>
            <Text style={styles.title}>Kumuha nang walang limitasyon 📸</Text>
            <Text style={styles.subtitle}>
              {source === 'quota'
                ? 'Naubos mo na ang libreng quota mo para sa araw na ito.'
                : 'Premium feature ito. I-unlock para magamit mo na.'}
            </Text>

            <PlanComparison compact />

            <View style={styles.priceRow}>
              <Text style={styles.price}>{premium.priceLabel}</Text>
              <Text style={styles.currency}>{CURRENCY}</Text>
            </View>

            {lastError ? <Text style={styles.error}>{lastError}</Text> : null}

            <TouchableOpacity
              style={[styles.cta, busy && styles.ctaDisabled]}
              onPress={() => purchase('google')}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.ctaText}>Mag-Subscribe Ngayon</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.restore} onPress={() => restore()} disabled={busy}>
              <Text style={styles.restoreText}>I-Restore ang Purchase</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.review} onPress={onClose}>
              <Text style={styles.reviewText}>Siguro mamaya na lang</Text>
            </TouchableOpacity>

            <Text style={styles.tos}>
              Auto-renewing subscription. Madaling i-cancel sa store settings anumang oras.
              Premium plan: {premium.features.join(' • ')}.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
    maxHeight: '88%',
  },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#444', alignSelf: 'center', marginBottom: 16 },
  kicker: { color: '#FF4DA6', fontSize: 12, fontWeight: '700', letterSpacing: 2, textAlign: 'center' },
  title: { color: '#fff', fontSize: 26, fontWeight: '800', textAlign: 'center', marginTop: 6 },
  subtitle: { color: '#B8B8D0', fontSize: 14, textAlign: 'center', marginTop: 6, marginBottom: 18 },
  priceRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'baseline', marginTop: 16, gap: 6 },
  price: { color: '#fff', fontSize: 40, fontWeight: '800' },
  currency: { color: '#00BCD4', fontSize: 18, fontWeight: '700' },
  error: { color: '#FF5252', fontSize: 13, textAlign: 'center', marginTop: 8 },
  cta: {
    marginTop: 18,
    backgroundColor: 'transparent',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 0,
    overflow: 'hidden',
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  restore: { marginTop: 10, alignItems: 'center', paddingVertical: 8 },
  restoreText: { color: '#00BCD4', fontSize: 14, fontWeight: '600' },
  review: { marginTop: 4, alignItems: 'center', paddingVertical: 6 },
  reviewText: { color: '#B8B8D0', fontSize: 13 },
  tos: { color: '#8B8BA8', fontSize: 11, textAlign: 'center', marginTop: 14, lineHeight: 16 },
});
