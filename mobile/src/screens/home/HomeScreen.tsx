import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import GradientButton from '../../components/ui/GradientButton';
import Card from '../../components/ui/Card';
import Screen from '../../components/ui/Screen';
import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../hooks/useAuth';
import { usePhotos } from '../../contexts/PhotoContext';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList, MainTabParamList } from '../../navigation/types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'HomeTab'>,
  NativeStackScreenProps<MainStackParamList>
>;

export default function HomeScreen({ navigation }: Props) {
  const { colors, gradient, fonts, radius, spacing } = useTheme();
  const { user, profile } = useAuth();
  const { recentPhotos, loadingRecent } = usePhotos();

  const isPremium = profile?.plan === 'premium';
  const credits = profile?.creditsRemaining ?? 0;

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <View style={styles.header}>
          <Text style={[fonts.heading, { color: colors.text }]}>
            Hi, {user?.displayName?.split(' ')[0] || 'there'} 👋
          </Text>
          <Text style={[fonts.body, { color: colors.textSecondary, marginTop: spacing.xs }]}>
            {isPremium ? 'Premium member ★' : `${credits} photo credits left`}
          </Text>
        </View>

        {/* Primary capture CTA — navigates to the camera module screen. */}
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: radius.xl, padding: spacing.xl, marginTop: spacing.lg }}
        >
          <Text style={[fonts.subheading, { color: colors.text }]}>📸 Photobooth</Text>
          <Text
            style={[fonts.body, { color: colors.text, marginTop: spacing.sm, marginBottom: spacing.lg }]}
          >
            Single o 4-burst shots na may live AI filters
          </Text>
          <View style={{ alignSelf: 'flex-start' }}>
            <GradientButton title="Start Booth" onPress={() => navigation.navigate('Camera')} />
          </View>
        </LinearGradient>

        <View style={styles.quickRow}>
          <Card style={{ flex: 1, marginRight: spacing.sm }}>
            <Text style={[fonts.caption, { color: colors.textSecondary }]}>Photos taken</Text>
            <Text style={[fonts.subheading, { color: colors.text, marginTop: spacing.xs }]}>
              {profile?.totalPhotosTaken ?? 0}
            </Text>
          </Card>
          <Card style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={[fonts.caption, { color: colors.textSecondary }]}>Plan</Text>
            <Text style={[fonts.subheading, { color: isPremium ? colors.warning : colors.text, marginTop: spacing.xs }]}>
              {isPremium ? 'Premium' : 'Free'}
            </Text>
          </Card>
        </View>

        {!isPremium && (
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={[fonts.subheading, { color: colors.text }]}>Go Premium 💎</Text>
            <Text style={[fonts.body, { color: colors.textSecondary, marginTop: spacing.sm }]}>
              Unlimited photos, lahat ng AI filters, at walang watermark.
            </Text>
            <View style={{ alignSelf: 'flex-start', marginTop: spacing.md }}>
              <GradientButton
                title="Upgrade"
                onPress={() => navigation.navigate('Premium')}
                variant="outline"
              />
            </View>
          </Card>
        )}

        <View style={styles.sectionHeader}>
          <Text style={[fonts.subheading, { color: colors.text }]}>Recent photos</Text>
          <Text
            style={[fonts.caption, { color: colors.secondary }]}
            onPress={() => navigation.navigate('GalleryTab')}
          >
            View all
          </Text>
        </View>

        {loadingRecent ? (
          <Text style={[fonts.body, { color: colors.textSecondary, marginTop: spacing.md }]}>
            Loading…
          </Text>
        ) : recentPhotos.length === 0 ? (
          <Text style={[fonts.body, { color: colors.textSecondary, marginTop: spacing.md }]}>
            Wala pa. Kunin ang unang photo mo sa photobooth!
          </Text>
        ) : (
          recentPhotos.slice(0, 6).map((photo) => (
            <Card key={photo.id} style={{ marginTop: spacing.md, padding: spacing.md }}>
              <Text style={[fonts.body, { color: colors.text }]}>Filter: {photo.filterId}</Text>
              <Text style={[fonts.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>
                {photo.createdAt?.toDate?.()?.toLocaleString?.() ?? 'Just now'}
              </Text>
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginTop: 24,
  },
  quickRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
  },
});
