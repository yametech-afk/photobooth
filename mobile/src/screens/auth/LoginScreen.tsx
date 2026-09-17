import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import GradientButton from '../../components/ui/GradientButton';
import Input from '../../components/ui/Input';
import Screen from '../../components/ui/Screen';
import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../hooks/useAuth';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { colors, fonts, spacing } = useTheme();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) return;
    try {
      setLoading(true);
      await signIn(email.trim(), password);
    } catch (error) {
      Alert.alert('Login failed', 'Paki-check ang email at password mo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[fonts.heading, { color: colors.text }]}>Welcome back</Text>
        <Text style={[fonts.body, { color: colors.textSecondary, marginTop: spacing.sm }]}>
          Sign in para makapag-photobooth na
        </Text>
      </View>

      <View style={{ marginTop: spacing.xl }}>
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@email.com"
        />
        <Input
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
          containerStyle={{ marginTop: spacing.md }}
        />
      </View>

      <View style={{ flex: 1 }} />

      <GradientButton title="Sign In" onPress={handleLogin} loading={loading} />
      <TouchableOpacity
        onPress={() => navigation.navigate('SignUp')}
        style={{ marginTop: spacing.md, marginBottom: spacing.lg }}
      >
        <Text style={[fonts.caption, { color: colors.textSecondary, textAlign: 'center' }]}>
          Wala pang account? <Text style={{ color: colors.primary }}>Sign up</Text>
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
