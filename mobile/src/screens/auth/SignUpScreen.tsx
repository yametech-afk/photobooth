import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import GradientButton from '../../components/ui/GradientButton';
import Input from '../../components/ui/Input';
import Screen from '../../components/ui/Screen';
import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../hooks/useAuth';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;

export default function SignUpScreen({ navigation }: Props) {
  const { colors, fonts, spacing } = useTheme();
  const { signUp } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    if (!email || !password || !displayName) return;
    if (password.length < 6) {
      Alert.alert('Password', 'Dapat 6 na characters pataas ang password.');
      return;
    }
    try {
      setLoading(true);
      await signUp(email.trim(), password, displayName.trim());
      // Navigation switches to the main flow automatically via AuthContext.
    } catch (error) {
      Alert.alert('Sign up failed', 'Baka may existing account na gamit ang email na ito.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[fonts.heading, { color: colors.text }]}>Gumawa ng account</Text>
        <Text style={[fonts.body, { color: colors.textSecondary, marginTop: spacing.sm }]}>
          5 libreng photo credits pag nag-sign up ka
        </Text>
      </View>

      <View style={{ marginTop: spacing.xl }}>
        <Input
          label="Pangalan"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Juan Dela Cruz"
        />
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@email.com"
          containerStyle={{ marginTop: spacing.md }}
        />
        <Input
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="6+ characters"
          containerStyle={{ marginTop: spacing.md }}
        />
      </View>

      <View style={{ flex: 1 }} />

      <GradientButton title="Sign Up" onPress={handleSignUp} loading={loading} />
      <TouchableOpacity
        onPress={() => navigation.navigate('Login')}
        style={{ marginTop: spacing.md, marginBottom: spacing.lg }}
      >
        <Text style={[fonts.caption, { color: colors.textSecondary, textAlign: 'center' }]}>
          May account na? <Text style={{ color: colors.primary }}>Sign in</Text>
        </Text>
      </TouchableOpacity>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginTop: 48,
  },
});
