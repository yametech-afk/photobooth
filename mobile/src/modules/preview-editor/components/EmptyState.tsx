/**
 * Empty / error states for the gallery.
 *
 * Every distinct empty case gets its own copy — "walang litrato pa" and "error sa
 * network" are not the same screen, and a generic illustration for both is what
 * makes an app feel broken.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../../theme/ThemeContext';

export type EmptyStateKind =
  | 'no-photos'
  | 'no-results'
  | 'error'
  | 'offline'
  | 'no-selection';

type Props = {
  kind: EmptyStateKind;
  onPrimary?: () => void;
  onSecondary?: () => void;
  message?: string;
};

const COPY: Record<EmptyStateKind, { icon: string; title: string; body: string; primary?: string; secondary?: string }> = {
  'no-photos': {
    icon: 'camera-outline',
    title: 'Wala pa kang litrato',
    body: 'Simulan ang photobooth session at lalabas agad dito ang mga kuha mo.',
    primary: 'Simulan ang booth',
  },
  'no-results': {
    icon: 'funnel-outline',
    title: 'Walang tugmang litrato',
    body: 'Walang litrato sa filter na ito. Subukan ang "Lahat" para makita ang buong gallery.',
    primary: 'Ipakita lahat',
  },
  error: {
    icon: 'cloud-offline-outline',
    title: 'Hindi na-load ang gallery',
    body: 'Nagkaproblema sa koneksyon. Hindi nawala ang mga litrato mo — nasa cloud pa rin sila.',
    primary: 'Subukan ulit',
  },
  offline: {
    icon: 'wifi-outline',
    title: 'Offline ka',
    body: 'Ipinapakita ang huling naka-cache na gallery. Mag-reconnect para sa pinakabago.',
    primary: 'I-refresh',
  },
  'no-selection': {
    icon: 'checkmark-done-outline',
    title: 'Walang napili',
    body: 'Pindutin at hawakan ang litrato para pumili ng marami, tapos pumili ng aksyon.',
  },
};

export default function EmptyState({ kind, onPrimary, onSecondary, message }: Props) {
  const { colors, fonts, spacing, radius } = useTheme();
  const copy = COPY[kind];

  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={[colors.surface, colors.card]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.iconWrap, { borderRadius: radius.round }]}
      >
        <Ionicons name={copy.icon as never} size={34} color={colors.primary} />
      </LinearGradient>

      <Text style={[fonts.subheading, { color: colors.text, marginTop: spacing.md, textAlign: 'center' }]}>
        {copy.title}
      </Text>
      <Text
        style={[
          fonts.body,
          {
            color: colors.textSecondary,
            marginTop: spacing.sm,
            textAlign: 'center',
            maxWidth: 300,
          },
        ]}
      >
        {message ?? copy.body}
      </Text>

      <View style={styles.actions}>
        {copy.primary && onPrimary && (
          <Pressable
            onPress={onPrimary}
            accessibilityRole="button"
            style={[styles.button, { backgroundColor: colors.primary, borderRadius: radius.round }]}
          >
            <Text style={[fonts.caption, { color: colors.text, fontWeight: '700' }]}>{copy.primary}</Text>
          </Pressable>
        )}
        {copy.secondary && onSecondary && (
          <Pressable
            onPress={onSecondary}
            accessibilityRole="button"
            style={[styles.button, { backgroundColor: colors.surface, borderRadius: radius.round }]}
          >
            <Text style={[fonts.caption, { color: colors.textSecondary }]}>{copy.secondary}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  iconWrap: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20, flexWrap: 'wrap', justifyContent: 'center' },
  button: { paddingVertical: 10, paddingHorizontal: 18 },
});