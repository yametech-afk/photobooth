import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import GradientButton from '../../components/ui/GradientButton';
import Card from '../../components/ui/Card';
import Screen from '../../components/ui/Screen';
import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../hooks/useAuth';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList, MainTabParamList } from '../../navigation/types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'SettingsTab'>,
  NativeStackScreenProps<MainStackParamList>
>;

export default function SettingsScreen({ navigation }: Props) {
  const { colors, fonts, spacing } = useTheme();
  const { user, profile, logout } = useAuth();

  const isPremium = profile?.plan === 'premium';

  const handleLogout = async () => {
    Alert.alert('Logout', 'Sigurado ka bang gusto mong mag-logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: () => logout() },
    ]);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <Text style={[fonts.heading, { color: colors.text, marginTop: 24 }]}>Settings</Text>

        <Card style={{ marginTop: spacing.lg }}>
          <Text style={[fonts.subheading, { color: colors.text }]}>
            {user?.displayName || 'Photobooth User'}
          </Text>
          <Text style={[fonts.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>
            {user?.email ?? ''}
          </Text>
          <Text style={[fonts.caption, { color: isPremium ? colors.warning : colors.textSecondary, marginTop: spacing.sm }]}>
            {isPremium ? '★ Premium plan' : 'Free plan'}
          </Text>
        </Card>

        {!isPremium && (
          <View style={{ marginTop: spacing.lg }}>
            <GradientButton
              title="Upgrade to Premium"
              onPress={() => navigation.navigate('Premium')}
              variant="outline"
            />
            <Text style={[fonts.caption, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm }]}>
              Premium screen is provided by the premium module.
            </Text>
          </View>
        )}

        <Card style={{ marginTop: spacing.lg }}>
          <Text style={[fonts.subheading, { color: colors.text }]}>About</Text>
          <Text style={[fonts.body, { color: colors.textSecondary, marginTop: spacing.sm }]}>
            Photobooth App v1.0.0 — AI-powered photobooth na may filters, burst mode, at instant
            sharing.
          </Text>
        </Card>

        <View style={{ marginTop: spacing.xl }}>
          <GradientButton title="Logout" onPress={handleLogout} variant="outline" />
        </View>
      </ScrollView>
    </Screen>
  );
}
