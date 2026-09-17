import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme/ThemeContext';

type Props = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'gradient' | 'outline' | 'ghost';
  style?: ViewStyle;
};

export default function GradientButton({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'gradient',
  style,
}: Props) {
  const { colors, gradient, spacing, radius, fonts } = useTheme();
  const blocked = loading || disabled;

  if (variant === 'gradient') {
    return (
      <TouchableOpacity onPress={onPress} disabled={blocked} activeOpacity={0.8} style={style}>
        <LinearGradient
          colors={blocked ? ['#555555', '#777777'] : gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.gradient, { borderRadius: radius.lg, paddingVertical: spacing.md }]}
        >
          {loading ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={[fonts.subheading, styles.text, { color: colors.text }]}>{title}</Text>
          )}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={blocked}
      activeOpacity={0.8}
      style={[
        variant === 'outline' ? styles.outline : styles.ghost,
        {
          borderColor: colors.primary,
          borderRadius: radius.lg,
          paddingVertical: spacing.md,
        },
        style,
      ]}
    >
      <View>
        <Text
          style={[
            fonts.subheading,
            { color: variant === 'outline' ? colors.primary : colors.textSecondary },
          ]}
        >
          {title}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  text: {
    marginLeft: 8,
  },
  outline: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghost: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
