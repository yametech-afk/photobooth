import React, { useState } from 'react';
import {
  TextInput,
  StyleSheet,
  View,
  Text,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

type Props = TextInputProps & {
  label?: string;
  error?: string | null;
  containerStyle?: ViewStyle;
};

export default function Input({ label, error, containerStyle, ...inputProps }: Props) {
  const { colors, spacing, radius, fonts } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={containerStyle}>
      {label ? (
        <Text style={[fonts.caption, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
          {label}
        </Text>
      ) : null}
      <TextInput
        {...inputProps}
        onFocus={(e) => {
          setFocused(true);
          inputProps.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          inputProps.onBlur?.(e);
        }}
        placeholderTextColor={colors.textSecondary}
        style={[
          fonts.body,
          {
            backgroundColor: colors.card,
            color: colors.text,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            paddingVertical: 14,
            borderWidth: 2,
            borderColor: focused ? colors.primary : 'transparent',
          },
        ]}
      />
      {error ? (
        <Text style={[fonts.caption, { color: colors.error, marginTop: spacing.xs }]}>{error}</Text>
      ) : null}
    </View>
  );
}
