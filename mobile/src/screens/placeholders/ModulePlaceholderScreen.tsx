import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Screen from '../../components/ui/Screen';
import { useTheme } from '../../theme/ThemeContext';

type Props = {
  /** Human-readable module name, e.g. "Camera" or "Premium". */
  moduleName: string;
  /** Which agent workstream owns the real implementation. */
  owner: string;
};

/**
 * Safe placeholder for stack routes whose real screens live in other module
 * workstreams (camera, preview/editor, premium — see INTEGRATION.md).
 * Registering them keeps navigation type-safe and crash-free; module teams
 * replace these registrations in RootNavigator when their screens land.
 */
export default function ModulePlaceholderScreen({ moduleName, owner }: Props) {
  const { colors, fonts, spacing, radius } = useTheme();

  return (
    <Screen>
      <View style={styles.center}>
        <Text style={{ fontSize: 56 }}>🧩</Text>
        <Text
          style={[
            fonts.subheading,
            { color: colors.text, marginTop: spacing.md, textAlign: 'center' },
          ]}
        >
          {moduleName} module
        </Text>
        <Text
          style={[
            fonts.body,
            { color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' },
          ]}
        >
          Handa na ang route at mount point nito. Ang tunay na screen ay ibinibigay ng{' '}
          {owner} workstream.
        </Text>
        <View
          style={{
            marginTop: spacing.lg,
            backgroundColor: colors.card,
            borderRadius: radius.md,
            padding: spacing.md,
          }}
        >
          <Text style={[fonts.caption, { color: colors.textSecondary }]}>
            Tingnan ang INTEGRATION_CHECKLIST.md — palitan ang registration sa
            RootNavigator kapag naka-merge na ang module.
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});
