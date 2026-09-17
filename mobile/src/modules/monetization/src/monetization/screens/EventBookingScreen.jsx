/**
 * ============================================================
 * EVENT BOOKING SCREEN — B2B upsell path (high-ticket revenue).
 * Lists EVENT_PACKAGES from config; user picks a package and
 * sends a booking request. The request is persisted to Firestore
 * (`events/enquiries`) via the Cloud Function `createEventBooking`
 * so admin can follow up. A mailto fallback is included.
 * ============================================================
 */

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Linking, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { httpsCallable } from 'firebase/functions';
import { EVENT_PACKAGES, BUSINESS_CONTACT, CURRENCY } from '../config/plans';
import { useSubscription } from '../context/SubscriptionContext';
// Region-pinned Functions instance from the mobile core (asia-southeast1).
// Calling getFunctions() here without a region would hit us-central1 and every
// invocation would fail with functions/not-found on a real project.
import { functions } from '../../../services/firebase';

export default function EventBookingScreen({ navigation }) {
  const { uid } = useSubscription();
  const [selectedId, setSelectedId] = useState(null);
  const [contact, setContact] = useState('');
  const [eventDate, setEventDate] = useState('');
  // A booking is always against a PUBLISHED EVENT SLOT. The backend callable
  // (createEventBooking in functions/src/callables/events.ts) requires eventId +
  // slotId and enforces slot capacity inside a transaction, so a package alone is
  // not bookable. These ids come from the public event list once the admin has
  // created an event (getPublicEvents / getPublicEventDetail). Without them the
  // screen falls back to a package enquiry by email instead of invoking a
  // function that is guaranteed to fail validation.
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedSlotId, setSelectedSlotId] = useState('');
  const [attendees, setAttendees] = useState(1);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const selected = EVENT_PACKAGES.find((p) => p.id === selectedId) || null;

  const sendEnquiry = async () => {
    setBusy(true);
    setError('');
    try {
      if (!uid) {
        // Anonymous/pre-login flow: fall back to mailto.
        const body = encodeURIComponent(
          `Package: ${selected?.name}\nEvent date: ${eventDate}\nContact: ${contact}\n\nGusto kong mag-book ng photobooth.`
        );
        Linking.openURL(`mailto:${BUSINESS_CONTACT.email}?subject=${encodeURIComponent(BUSINESS_CONTACT.subjectPrefix)}&body=${body}`);
        setSent(true);
        return;
      }
      // `eventId` + `slotId` are REQUIRED by the backend (createEventBooking in
      // functions/src/callables/events.ts) — a booking is always against a
      // published event slot with capacity. Without a selected event the screen
      // must not call the function at all: a package enquiry goes out by email.
      if (!selectedEventId || !selectedSlotId) {
        const body = encodeURIComponent(
          `Package: ${selected?.name}\nEvent date: ${eventDate}\nContact: ${contact}\n\nGusto kong mag-book ng photobooth.`
        );
        Linking.openURL(
          `mailto:${BUSINESS_CONTACT.email}?subject=${encodeURIComponent(BUSINESS_CONTACT.subjectPrefix)}&body=${body}`
        );
        setSent(true);
        return;
      }

      const fn = httpsCallable(functions, 'createEventBooking');
      const res = await fn({
        eventId: selectedEventId,
        slotId: selectedSlotId,
        packageId: selected?.id,
        guestName: contact,
        attendees,
        notes: `Package: ${selected?.name}. Event date: ${eventDate}.`,
      });
      if (res.data?.success) setSent(true);
      else setError('Hindi na-send ang booking. Subukan muli.');
    } catch (e) {
      setError('Network error habang nagse-send. Subukan muli.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>PHOTOBOOTH FOR EVENTS</Text>
        <Text style={styles.title}>Magrenta ng branded photobooth 🎉</Text>
        <Text style={styles.subtitle}>
          Perpektong package para sa kasal, corporate event, o birthday. May kasamang attendant,
          custom frames, at live gallery.
        </Text>

        {EVENT_PACKAGES.map((pkg) => (
          <TouchableOpacity
            key={pkg.id}
            style={[styles.card, selectedId === pkg.id && styles.cardSelected]}
            onPress={() => setSelectedId(pkg.id)}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardName}>{pkg.name}</Text>
              <Text style={styles.cardPrice}>
                {CURRENCY} {pkg.price.toLocaleString()}
              </Text>
            </View>
            {pkg.includes.map((inc) => (
              <Text key={inc} style={styles.cardInclude}>• {inc}</Text>
            ))}
          </TouchableOpacity>
        ))}

        <TextInput
          style={styles.input}
          placeholder="Pangalan / contact number"
          placeholderTextColor="#8B8BA8"
          value={contact}
          onChangeText={setContact}
        />
        <TextInput
          style={styles.input}
          placeholder="Petsa ng event (e.g. 2026-12-20)"
          placeholderTextColor="#8B8BA8"
          value={eventDate}
          onChangeText={setEventDate}
        />
        <TextInput
          style={styles.input}
          placeholder="Event ID (mula sa published event)"
          placeholderTextColor="#8B8BA8"
          autoCapitalize="none"
          value={selectedEventId}
          onChangeText={setSelectedEventId}
        />
        <TextInput
          style={styles.input}
          placeholder="Slot ID (mula sa event schedule)"
          placeholderTextColor="#8B8BA8"
          autoCapitalize="none"
          value={selectedSlotId}
          onChangeText={setSelectedSlotId}
        />
        <TextInput
          style={styles.input}
          placeholder="Bilang ng attendees (1-20)"
          placeholderTextColor="#8B8BA8"
          keyboardType="number-pad"
          value={String(attendees)}
          onChangeText={(text) =>
            setAttendees(Math.max(1, Math.min(20, parseInt(text, 10) || 1)))
          }
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {sent ? (
          <View style={styles.successCard}>
            <Text style={styles.successText}>✅ Naipadala na ang booking request mo. Mag-e-email kami sa'yo soon!</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.cta, (!selected || busy) && styles.ctaDisabled]}
            onPress={sendEnquiry}
            disabled={!selected || busy}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Ipadala ang Booking Request</Text>}
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Bumalik sa Premium</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A1F' },
  content: { padding: 24, paddingBottom: 60 },
  kicker: { color: '#00BCD4', fontSize: 12, fontWeight: '800', letterSpacing: 2, textAlign: 'center' },
  title: { color: '#fff', fontSize: 26, fontWeight: '800', textAlign: 'center', marginTop: 6 },
  subtitle: { color: '#B8B8D0', fontSize: 14, textAlign: 'center', marginTop: 8, marginBottom: 20, lineHeight: 21 },
  card: {
    backgroundColor: '#1A1A2E',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#33335a',
    padding: 16,
    marginBottom: 12,
  },
  cardSelected: { borderColor: '#00BCD4', backgroundColor: 'rgba(0,188,212,0.08)' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardName: { color: '#fff', fontSize: 17, fontWeight: '800' },
  cardPrice: { color: '#FFD600', fontSize: 16, fontWeight: '800' },
  cardInclude: { color: '#B8B8D0', fontSize: 13, lineHeight: 20 },
  input: {
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#33335a',
    color: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 14,
  },
  error: { color: '#FF5252', fontSize: 13, marginBottom: 10, textAlign: 'center' },
  cta: { backgroundColor: '#00BCD4', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 6 },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { color: '#0A0A1F', fontSize: 16, fontWeight: '800' },
  successCard: { backgroundColor: 'rgba(0,230,118,0.12)', borderRadius: 14, padding: 16, marginTop: 6 },
  successText: { color: '#00E676', fontSize: 14, textAlign: 'center' },
  back: { marginTop: 20, alignItems: 'center' },
  backText: { color: '#B8B8D0', fontSize: 14 },
});
