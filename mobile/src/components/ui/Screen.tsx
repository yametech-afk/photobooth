import React from 'react';
import { View, StyleSheet, StatusBar, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';

type Props = {
  children: React.ReactNode;
  /** Extra padding applied to the content container. */
  padded?: boolean;
  style?: ViewStyle;
};

/** Safe-area aware screen container with the app background color. */
export default function Screen({ children, padded = true, style }: Props) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingHorizontal: padded ? spacing.lg : 0,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
        style,
      ]}
    >
      <StatusBar barStyle="light-content" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
