/**
 * Bottom sheet listing every upload job with per-job retry / cancel / remove.
 * This is where a spike of failed uploads is resolved: nothing leaves the queue
 * until it succeeds or the user removes it.
 */
import React from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../theme/ThemeContext';
import { formatBytes, humanStatus, pct } from '../utils/format';
import type { UploadJob } from '../types';

type Props = {
  visible: boolean;
  jobs: UploadJob[];
  onClose: () => void;
  onRetry: (jobId: string) => void;
  onCancel: (jobId: string) => void;
  onRemove: (jobId: string) => void;
  onClearFinished: () => void;
  onRetryAllFailed: () => void;
};

export default function UploadQueueSheet({
  visible,
  jobs,
  onClose,
  onRetry,
  onCancel,
  onRemove,
  onClearFinished,
  onRetryAllFailed,
}: Props) {
  const { colors, fonts, spacing, radius } = useTheme();
  const failed = jobs.filter((job) => job.status === 'error').length;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Isara ang upload queue" />
      <View style={[styles.sheet, { backgroundColor: colors.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl }]}>
        <View style={[styles.handle, { backgroundColor: colors.card }]} />

        <View style={styles.header}>
          <Text style={[fonts.subheading, { color: colors.text }]}>Upload queue</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Isara">
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={[styles.actions, { paddingHorizontal: spacing.lg }]}>
          {failed > 0 && (
            <Pressable
              onPress={onRetryAllFailed}
              style={[styles.pill, { backgroundColor: colors.primary, borderRadius: radius.round }]}
            >
              <Ionicons name="refresh" size={14} color={colors.text} />
              <Text style={[fonts.caption, { color: colors.text, marginLeft: 4 }]}>
                Retry lahat ({failed})
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={onClearFinished}
            style={[styles.pill, { backgroundColor: colors.surface, borderRadius: radius.round }]}
          >
            <Ionicons name="trash-outline" size={14} color={colors.textSecondary} />
            <Text style={[fonts.caption, { color: colors.textSecondary, marginLeft: 4 }]}>
              Clear tapos na
            </Text>
          </Pressable>
        </View>

        {jobs.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="cloud-upload-outline" size={40} color={colors.textSecondary} />
            <Text style={[fonts.body, { color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' }]}>
              Walang upload sa pila.
            </Text>
          </View>
        ) : (
          <FlatList
            data={jobs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
            renderItem={({ item }) => {
              const isError = item.status === 'error';
              const isDone = item.status === 'done';
              const busy = !isError && !isDone && item.status !== 'canceled';

              return (
                <View
                  style={[
                    styles.row,
                    {
                      backgroundColor: colors.surface,
                      borderRadius: radius.md,
                      padding: spacing.sm,
                      borderLeftWidth: 3,
                      borderLeftColor: isError
                        ? colors.error
                        : isDone
                        ? colors.success
                        : colors.secondary,
                    },
                  ]}
                >
                  <Image source={{ uri: item.uri }} style={[styles.thumb, { borderRadius: radius.sm }]} />

                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[fonts.caption, { color: colors.text }]}>
                      {item.filterId === 'none' ? 'Walang filter' : item.filterId}
                      {item.mode !== 'single' ? ` • ${item.mode}` : ''}
                    </Text>
                    <Text style={[fonts.caption, { color: colors.textSecondary }]}>
                      {humanStatus(item.status)}
                      {busy ? ` • ${pct(item.progress)}` : ''} • {formatBytes(item.sizeBytes)}
                      {item.attempts > 1 ? ` • try ${item.attempts}` : ''}
                    </Text>
                    {item.error && (
                      <Text style={[fonts.caption, { color: colors.error, marginTop: 2 }]} numberOfLines={2}>
                        {item.error}
                      </Text>
                    )}
                  </View>

                  {isError && (
                    <Pressable
                      onPress={() => onRetry(item.id)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Retry"
                    >
                      <Ionicons name="refresh" size={22} color={colors.primary} />
                    </Pressable>
                  )}
                  {busy && (
                    <Pressable
                      onPress={() => onCancel(item.id)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel"
                    >
                      <Ionicons name="close-circle-outline" size={22} color={colors.textSecondary} />
                    </Pressable>
                  )}
                  {!busy && (
                    <Pressable
                      onPress={() => onRemove(item.id)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Alisin sa listahan"
                    >
                      <Ionicons name="trash-outline" size={20} color={colors.textSecondary} />
                    </Pressable>
                  )}
                </View>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { maxHeight: '76%', paddingBottom: 24 },
  handle: { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, marginTop: 10 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  pill: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12 },
  empty: { alignItems: 'center', padding: 40 },
  row: { flexDirection: 'row', alignItems: 'center' },
  thumb: { width: 46, height: 46, backgroundColor: '#000' },
});