import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import GradientButton from './ui/GradientButton';

type Props = { children: React.ReactNode };
type State = { error: Error | null };

/**
 * App-level error boundary. Keeps a render crash from white-screening the
 * whole app and gives the user a clean reload path.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Hook analytics/crash reporting here (e.g. Crashlytics) later.
    console.error('[photobooth] Unhandled UI error:', error);
  }

  private handleReload = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <CrashView message={error.message} onReload={this.handleReload} />;
  }
}

function CrashView({ message, onReload }: { message: string; onReload: () => void }) {
  const { colors, fonts, spacing, radius } = useTheme();
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, padding: spacing.lg },
      ]}
    >
      <ScrollView contentContainerStyle={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}>
        <Text style={{ fontSize: 56 }}>💥</Text>
        <Text style={[fonts.subheading, { color: colors.text, marginTop: spacing.md }]}>
          May naganap na error
        </Text>
        <Text style={[fonts.caption, { color: colors.textSecondary, marginTop: spacing.sm }]}>
          Paumanhin! Nag-crash ang app. Subukan ulit.
        </Text>
        <View
          style={{
            marginTop: spacing.lg,
            backgroundColor: colors.card,
            borderRadius: radius.md,
            padding: spacing.md,
            maxHeight: 160,
          }}
        >
          <Text style={[fonts.caption, { color: colors.textSecondary }]} numberOfLines={6}>
            {message}
          </Text>
        </View>
        <GradientButton title="Subukan Ulit" onPress={onReload} style={{ marginTop: spacing.xl, alignSelf: 'stretch' }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
