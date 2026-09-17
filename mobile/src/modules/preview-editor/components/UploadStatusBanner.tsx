/**
 * Upload status banner + retry affordances.
 * Rendered above the action bar so "Ina-upload… 62%" is visible without opening the queue.
 */
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../theme/ThemeContext';
import { humanStatus, pct } from '../utils/format';
import type { UploadJob } from '../types';

type BannerProps = {
  job: UploadJob | null;
  queuedCount: number;
  failedCount: number;
  overallProgress: number;
  onCancel?: (jobId: string) => void;
  onRetry?: (jobId: string) => void;
  onOpenQueue?: () => void;
};

export function UploadStatusBanner({
  job,
  queuedCount,
  failedCount,
  overallProgress,
  onCancel,
  onRetry,
  onOpenQueue,
}: BannerProps) {
  const { colors, fonts, spacing, radius } = useTheme();

  if (!job && failedCount === 0) {
    return (
      <View style={[styles.row, { paddingHorizontal: spacing.md }]}>
        <Ionicons name="cloud-done-outline" size={16} color={colors.success} />
        <Text style={[fonts.caption, { color: colors.textSecondary, marginLeft: 6 }]}>
          Naka-save sa device. Puwede mo nang i-upload o i-share.
        </Text>
      </View>
    );
  }

  if (!job && failedCount > 0) {
    return (
      <View
        style={[
          styles.row,
          {
            backgroundColor: 'rgba(255,82,82,0.12)',
            borderRadius: radius.md,
            padding: spacing.sm,
            marginHorizontal: spacing.md,
          },
        ]}
      >
        <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
        <Text style={[fonts.caption, { color: colors.error, flex: 1, marginLeft: 6 }]}>
          {failedCount} upload ang nabigo. Nakabantay pa rin ang file sa device.
        </Text>
        {onOpenQueue && (
          <Pressable onPress={onOpenQueue} accessibilityRole="button">
            <Text style={[fonts.caption, { color: colors.primary }]}>Tingnan</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const isError = job?.status === 'error';
  const isCanceled = job?.status === 'canceled';
  const tint = isError ? colors.error : isCanceled ? colors.textSecondary : colors.secondary;
  const showSpinner = !isError && !isCanceled && job?.status !== 'done';

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          padding: spacing.sm,
          marginHorizontal: spacing.md,
        },
      ]}
    >
      <View style={styles.rowInner}>
        {showSpinner ? (
          <ActivityIndicator size="small" color={tint} />
        ) : (
          <Ionicons
            name={isError ? 'alert-circle-outline' : isCanceled ? 'close-circle-outline' : 'checkmark-circle-outline'}
            size={18}
            color={tint}
          />
        )}
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={[fonts.caption, { color: colors.text }]}>
            {humanStatus(job?.status ?? 'idle')}
            {queuedCount > 1 ? ` • ${queuedCount} sa pila` : ''}
          </Text>

          <View style={[styles.track, { backgroundColor: colors.card, marginTop: 6 }]}>
            <View
              style={[
                styles.fill,
                {
                  width: `${Math.round((isError ? 0 : job?.progress ?? overallProgress) * 100)}%`,
                  backgroundColor: tint,
                },
              ]}
            />
          </View>

          <Text style={[fonts.caption, { color: colors.textSecondary, marginTop: 4 }]}>
            {isError
              ? job?.error ?? 'Nabigo ang upload.'
              : isCanceled
              ? 'Kinansela — hindi na-charge ang credit.'
              : pct(job?.progress ?? overallProgress)}
          </Text>
        </View>

        {isError && onRetry && job && (
          <Pressable
            onPress={() => onRetry(job.id)}
            accessibilityRole="button"
            accessibilityLabel="Retry upload"
            style={[styles.action, { backgroundColor: colors.primary, borderRadius: radius.round }]}
          >
            <Ionicons name="refresh" size={16} color={colors.text} />
            <Text style={[fonts.caption, { color: colors.text, marginLeft: 4 }]}>Retry</Text>
          </Pressable>
        )}

        {showSpinner && onCancel && job && (
          <Pressable onPress={() => onCancel(job.id)} accessibilityRole="button" accessibilityLabel="Cancel upload">
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  banner: { paddingVertical: 10 },
  rowInner: { flexDirection: 'row', alignItems: 'center' },
  track: { height: 5, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 5, borderRadius: 3 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginLeft: 8,
  },
});