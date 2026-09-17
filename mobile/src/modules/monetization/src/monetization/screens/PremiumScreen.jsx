/**
 * ============================================================
 * PREMIUM SCREEN — full monetization hub:
 *   • plan comparison (table)
 *   • purchase CTA  (server-validated via Cloud Function)
 *   • restore-purchases placeholder
 *   • link to business/event upsell screen (B2B revenue)
 * ============================================================
 */

import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSubscription } from '../context/SubscriptionContext';
import PlanComparison from '../components/PlanComparison';
import { PLANS, BUSINESS_CONTACT } from '../config/plans';

export default function PremiumScreen({ navigation }) {
  const { plan, purchase, restore, busy, lastError, isPremium } = useSubscription();

  const handleContactBusiness = () => {
    const subject = encodeURIComponent(BUSINESS_CONTACT.subjectPrefix);
    Linking.openURL(`mailto:${BUSINESS_CONTACT.email}?subject=${subject}`).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        {isPremium ? (
          <View style={styles.activeCard}>
            <Text style={styles.activeEmoji}>👑</Text>
            <Text style={styles.activeTitle}>Premium ka na!</Text>
            <Text style={styles.activeSub}>Salamat sa pagsuporta. Enjoy ang unlimited photos, lahat ng AI filters, at 4K exports.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.kicker}>PHOTOBOOTH PREMIUM</Text>
            <Text style={styles.title}>Kumuha nang walang limitasyon</Text>
            <Text style={styles.subtitle}>
              Naka-subscribe ka na sa {plan.name} ({plan.priceLabel}). I-unlock lahat para sa mas magandang photo experience.
            </Text>

            <PlanComparison />

            <Text style={styles.sectionTitle}>Kasama sa Premium</Text>
            {PLANS.premium.features.map((f) => (
              <View key={f} style={styles.bulletRow}>
                <Text style={styles.bullet}>✅</Text>
                <Text style={styles.bulletText}>{f}</Text>
              </View>
            ))}
          </>
        )}

        {!isPremium && (
          <>
            {lastError ? <Text style={styles.error}>{lastError}</Text> : null}
            <TouchableOpacity
              style={[styles.cta, busy && styles.ctaDisabled]}
              onPress={() => purchase('google')}
              disabled={busy}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Mag-Subscribe — {PLANS.premium.priceLabel}</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.restore} onPress={() => restore()} disabled={busy}>
              <Text style={styles.restoreText}>May subscription ka na? I-Restore ang Purchase</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Para sa mga Events & Business 🎉</Text>
        <Text style={styles.subtitle}>
          May kasal, corporate event, o party ka? Magrenta ng branded photobooth at kumita kasama namin.
        </Text>
        <TouchableOpacity style={styles.secondaryCta} onPress={() => navigation.navigate('EventBooking')}>
          <Text style={styles.secondaryCtaText}>Tingnan ang Event Packages</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.link} onPress={handleContactBusiness}>
          <Text style={styles.linkText}>O mag-email sa amin: {BUSINESS_CONTACT.email}</Text>
        </TouchableOpacity>

        <Text style={styles.tos}>
          Auto-renewing subscription na pinamamahalaan ng App Store / Google Play. Pwedeng i-cancel
          anumang oras sa mga store settings. Sa pag-subscribe, sumasang-ayon ka sa Terms of Service.
          Ang entitlement ay nabe-validate ng server (Firebase Cloud Function) — hindi ng app mismo.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A1F' },
  content: { padding: 24, paddingBottom: 60 },
  kicker: { color: '#FF4DA6', fontSize: 12, fontWeight: '800', letterSpacing: 2, textAlign: 'center' },
  title: { color: '#fff', fontSize: 28, fontWeight: '800', textAlign: 'center', marginTop: 6 },
  subtitle: { color: '#B8B8D0', fontSize: 14, textAlign: 'center', marginTop: 8, marginBottom: 20, lineHeight: 21 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 26, marginBottom: 10 },
  bulletRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 },
  bullet: { fontSize: 14 },
  bulletText: { color: '#E0E0F0', fontSize: 14, flex: 1 },
  cta: {
    marginTop: 24,
    backgroundColor: '#FF4DA6',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  restore: { marginTop: 12, alignItems: 'center', paddingVertical: 8 },
  restoreText: { color: '#00BCD4', fontSize: 14 },
  error: { color: '#FF5252', fontSize: 13, textAlign: 'center', marginTop: 12 },
  divider: { height: 1, backgroundColor: '#2A2A4A', marginVertical: 28 },
  secondaryCta: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#00BCD4',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryCtaText: { color: '#00BCD4', fontSize: 16, fontWeight: '700' },
  link: { marginTop: 10, alignItems: 'center' },
  linkText: { color: '#B8B8D0', fontSize: 13, textDecorationLine: 'underline' },
  activeCard: {
    backgroundColor: 'rgba(0,230,118,0.1)',
    borderWidth: 1,
    borderColor: '#00E676',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  activeEmoji: { fontSize: 44 },
  activeTitle: { color: '#00E676', fontSize: 22, fontWeight: '800', marginTop: 8 },
  activeSub: { color: '#B8B8D0', fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 21 },
  tos: { color: '#8B8BA8', fontSize: 11, textAlign: 'center', marginTop: 28, lineHeight: 16 },
});
