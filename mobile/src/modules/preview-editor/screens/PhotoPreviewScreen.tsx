/**
 * PhotoPreviewScreen — the screen right after the camera fires.
 *
 * Route: `PhotoPreview` with `{ photos, filter }` (already declared in
 * navigation/types.ts by the mobile-core module).
 *
 * Flow: swipe between the burst shots → retake (camera contract) → apply/change
 * filter → open the full editor → save to device → upload with progress → share.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../../../theme/ThemeContext';
import { useAuth } from '../../../hooks/useAuth';
import { usePhotos } from '../../../contexts/PhotoContext';
import FilterPicker from '../components/FilterPicker';
import FilterPreviewCanvas from '../components/FilterPreviewCanvas';
import SaveToDeviceButton from '../components/SaveToDeviceButton';
import ShareSheet from '../components/ShareSheet';
import UploadQueueSheet from '../components/UploadQueueSheet';
import { UploadStatusBanner } from '../components/UploadStatusBanner';
import { usePhotoEditor } from '../hooks/usePhotoEditor';
import { usePhotoUpload } from '../hooks/usePhotoUpload';
import { bakeGeometry, deleteLocal, getFileSize, makeThumbnail } from '../services/imagePipeline';
import { bakeGrade } from '../services/filterRenderer';
import { getFilterPreset, LIMITS } from '../constants';
import { formatBytes, localId } from '../utils/format';
import type { PhotoScreenParams } from '../navigation/params';
import type { MainStackParamList } from '../../../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'PhotoPreview'>;

const { width: SCREEN_W } = Dimensions.get('window');

export default function PhotoPreviewScreen({ route, navigation }: Props) {
  const params = route.params as unknown as PhotoScreenParams['PhotoPreview'];
  const insets = useSafeAreaInsets();
  const { colors, fonts, spacing, radius } = useTheme();
  const { user, profile } = useAuth();
  const { refreshRecentPhotos, clearPendingPhotos, setSelectedFilterId } = usePhotos();

  const [index, setIndex] = useState(0);
  const [shareTarget, setShareTarget] = useState<string | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sessionId = useRef(localId('session')).current;
  const isPremium = profile?.plan === 'premium';
  const photos = useMemo(() => params.photos ?? [], [params.photos]);

  const editor = usePhotoEditor({ initialFilterId: params.filter ?? 'none' });

  const upload = usePhotoUpload({
    uid: user?.uid ?? null,
    sessionId,
    onUploaded: async () => {
      await refreshRecentPhotos();
      clearPendingPhotos();
    },
    onCreditsChanged: () => {
      void refreshRecentPhotos();
    },
  });

  useEffect(() => {
    setSelectedFilterId(editor.state.filterId);
  }, [editor.state.filterId, setSelectedFilterId]);

  const current = photos[index];
  const preset = getFilterPreset(editor.state.filterId);
  const isCloudFilter = preset.renderer === 'cloud';

  /** Retake = hand control back to the camera module; pending shots are dropped. */
  const handleRetake = useCallback(() => {
    clearPendingPhotos();
    navigation.replace('Camera');
  }, [clearPendingPhotos, navigation]);

  /** "Done" → open the full editor for the visible shot. */
  const handleOpenEditor = useCallback(() => {
    if (!current) return;
    navigation.navigate('PhotoEditor', {
      uri: current.uri,
      filterId: editor.state.filterId,
      width: current.width,
      height: current.height,
      mode: 'single',
    });
  }, [current, editor.state.filterId, navigation]);

  const handleUpload = useCallback(async () => {
    if (!current || !user) {
      setNotice('Kailangan mag-login bago mag-upload.');
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      // Bake the GPU grade into a real file first: the server only receives a
      // filterId for AI filters, so for local presets the look must be in the pixels.
      let uploadUri = current.uri;
      if (editor.isDirty && !isCloudFilter) {
        const graded = await bakeGrade(current.uri, editor.state.grade);
        const normalized = await bakeGeometry(graded.uri, editor.state.transform, {
          quality: 0.92,
        });
        uploadUri = normalized.uri;
      } else if (editor.state.transform.rotation !== 0 || editor.state.transform.cropRatio !== 'original') {
        const normalized = await bakeGeometry(current.uri, editor.state.transform, { quality: 0.92 });
        uploadUri = normalized.uri;
      }

      const sizeBytes = await getFileSize(uploadUri);
      if (sizeBytes > LIMITS.maxUploadBytes) {
        setNotice(`Sobrang laki ng file (${formatBytes(sizeBytes)}). I-save muna sa device at i-share.`);
        return;
      }

      const visible = await import('../services/imagePipeline').then((m) => m.getImageDims(uploadUri));

      upload.enqueue({
        uri: uploadUri,
        filterId: editor.state.filterId,
        mode: photos.length > 1 ? 'burst' : 'single',
        visibility: 'private',
        width: visible.width,
        height: visible.height,
        sizeBytes,
        filterApplied: editor.isDirty,
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Nabigo ang paghanda ng litrato.');
    } finally {
      setBusy(false);
    }
  }, [current, user, editor, isCloudFilter, photos.length, upload]);

  const handleSaveAll = useCallback(async () => {
    setBusy(true);
    try {
      const first = photos[0];
      if (!first) return;
      const dims = await import('../services/imagePipeline').then((m) => m.getImageDims(first.uri));
      upload.enqueue({
        uri: first.uri,
        filterId: editor.state.filterId,
        mode: 'burst',
        visibility: 'private',
        width: dims.width,
        height: dims.height,
      });
    } finally {
      setBusy(false);
    }
  }, [photos, editor.state.filterId, upload]);

  if (!current) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[fonts.body, { color: colors.textSecondary }]}>
          Walang litratong ipinasa. Bumalik sa camera.
        </Text>
        <Pressable onPress={handleRetake} style={{ marginTop: spacing.md }}>
          <Text style={[fonts.body, { color: colors.primary }]}>Bumalik sa camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleRetake} accessibilityRole="button" accessibilityLabel="Bumalik sa camera" hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={[fonts.subheading, { color: colors.text }]}>Preview</Text>
          {photos.length > 1 && (
            <Text style={[fonts.caption, { color: colors.textSecondary }]}>
              {index + 1} / {photos.length} • burst
            </Text>
          )}
        </View>
        <Pressable
          onPress={() => setQueueOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Buksan ang upload queue"
          hitSlop={10}
        >
          <Ionicons
            name={upload.failedCount > 0 ? 'alert-circle-outline' : 'cloud-upload-outline'}
            size={24}
            color={upload.failedCount > 0 ? colors.error : colors.text}
          />
        </Pressable>
      </View>

      {/* Photo canvas — GPU preview for local presets, plain image for AI presets */}
      <View style={styles.canvasWrap}>
        {isCloudFilter ? (
          <View style={[styles.aiNotice, { backgroundColor: colors.surface, borderRadius: radius.md }]}>
            <Ionicons name="sparkles-outline" size={16} color={colors.secondary} />
            <Text style={[fonts.caption, { color: colors.textSecondary, flex: 1, marginLeft: 6 }]}>
              {preset.name} ay AI filter — hindi ma-preview sa device. Makikita ang resulta pagkatapos ng upload.
            </Text>
          </View>
        ) : (
          <FilterPreviewCanvas
            uri={current.uri}
            grade={editor.state.grade}
            aspectRatio={
              current.width && current.height ? current.width / current.height : 3 / 4
            }
            onError={(message) => setNotice(message)}
          />
        )}

        {photos.length > 1 && (
          <FlatList
            data={photos}
            horizontal
            keyExtractor={(item, i) => `${item.uri}-${i}`}
            showsHorizontalScrollIndicator={false}
            snapToInterval={72 + spacing.sm}
            decelerationRate="fast"
            contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.sm, paddingVertical: spacing.sm }}
            renderItem={({ item, index: i }: ListRenderItemInfo<typeof photos[number]>) => (
              <Pressable onPress={() => setIndex(i)} accessibilityRole="button" accessibilityLabel={`Kuha ${i + 1}`}>
                <View
                  style={[
                    styles.thumbWrap,
                    {
                      borderColor: i === index ? colors.primary : 'transparent',
                      borderRadius: radius.sm,
                    },
                  ]}
                >
                  <View style={[styles.thumbFallback, { backgroundColor: colors.card }]} />
                </View>
              </Pressable>
            )}
          />
        )}
      </View>

      {/* Filters */}
      <FilterPicker
        selectedId={editor.state.filterId}
        onSelect={(filterId) => editor.selectFilter(filterId)}
        previewUri={current.uri}
        isPremium={isPremium}
        onLockedPress={(filter) =>
          setNotice(`${filter.name} ay Premium filter. Buksan ang Premium para i-unlock.`)
        }
        style={{ marginTop: spacing.sm }}
      />

      {/* Edit shortcut + reset */}
      <View style={[styles.quickRow, { paddingHorizontal: spacing.md, marginTop: spacing.sm }]}>
        <Pressable
          onPress={handleOpenEditor}
          accessibilityRole="button"
          style={[styles.quickButton, { backgroundColor: colors.surface, borderRadius: radius.md }]}
        >
          <Ionicons name="options-outline" size={18} color={colors.text} />
          <Text style={[fonts.caption, { color: colors.text, marginLeft: 6 }]}>I-edit</Text>
        </Pressable>
        <Pressable
          onPress={editor.resetAll}
          accessibilityRole="button"
          style={[styles.quickButton, { backgroundColor: colors.surface, borderRadius: radius.md }]}
        >
          <Ionicons name="refresh-outline" size={18} color={colors.text} />
          <Text style={[fonts.caption, { color: colors.text, marginLeft: 6 }]}>Reset</Text>
        </Pressable>
        <Pressable
          onPress={handleRetake}
          accessibilityRole="button"
          style={[styles.quickButton, { backgroundColor: colors.surface, borderRadius: radius.md }]}
        >
          <Ionicons name="camera-reverse-outline" size={18} color={colors.text} />
          <Text style={[fonts.caption, { color: colors.text, marginLeft: 6 }]}>Retake</Text>
        </Pressable>
      </View>

      {notice && (
        <Text style={[fonts.caption, { color: colors.warning, paddingHorizontal: spacing.md, marginTop: spacing.xs }]}>
          {notice}
        </Text>
      )}

      {/* Upload status */}
      <View style={{ marginTop: spacing.sm }}>
        <UploadStatusBanner
          job={upload.activeJob}
          queuedCount={upload.queuedCount}
          failedCount={upload.failedCount}
          overallProgress={upload.overallProgress}
          onCancel={upload.cancel}
          onRetry={upload.retry}
          onOpenQueue={() => setQueueOpen(true)}
        />
      </View>

      {/* Actions */}
      <View style={[styles.actions, { paddingHorizontal: spacing.md, paddingBottom: insets.bottom + spacing.md }]}>
        <View style={{ flex: 1 }}>
          <SaveToDeviceButton
            localUri={current.uri}
            onSaved={() => setNotice('Naka-save sa camera roll.')}
            onError={(message) => setNotice(message)}
          />
        </View>

        <View style={{ width: spacing.md }} />

        <Pressable
          onPress={handleUpload}
          disabled={busy || upload.isBusy}
          accessibilityRole="button"
          accessibilityLabel="I-upload ang litrato"
          style={[
            styles.primaryButton,
            { backgroundColor: colors.primary, borderRadius: radius.lg, opacity: busy || upload.isBusy ? 0.6 : 1 },
          ]}
        >
          {busy ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={18} color={colors.text} />
              <Text style={[fonts.body, { color: colors.text, marginLeft: 6, fontWeight: '600' }]}>
                I-upload
              </Text>
            </>
          )}
        </Pressable>
      </View>

      {upload.jobs.length > 1 && (
        <Pressable onPress={handleSaveAll} style={{ alignItems: 'center', paddingBottom: spacing.sm }}>
          <Text style={[fonts.caption, { color: colors.textSecondary }]}>
            I-upload lahat ng {photos.length} kuha
          </Text>
        </Pressable>
      )}

      <UploadQueueSheet
        visible={queueOpen}
        jobs={upload.jobs}
        onClose={() => setQueueOpen(false)}
        onRetry={upload.retry}
        onCancel={upload.cancel}
        onRemove={(jobId) => {
          const job = upload.jobs.find((j) => j.id === jobId);
          if (job) void deleteLocal(job.uri);
          upload.remove(jobId);
        }}
        onClearFinished={upload.clearFinished}
        onRetryAllFailed={upload.retryAllFailed}
      />

      <ShareSheet
        visible={shareTarget != null}
        photoId={shareTarget}
        localUri={current.uri}
        isUploaded={Boolean(upload.jobs.find((j) => j.photoId === shareTarget)?.publicUrl)}
        sessionId={sessionId}
        onClose={() => setShareTarget(null)}
        onError={(message) => setNotice(message)}
      />

      {/* Thumbnail warm-up keeps the gallery grid fast right after upload. */}
      <ThumbWarmup uri={current.uri} />
    </View>
  );
}

/** Silently prepares a thumbnail so the gallery does not decode a 4K file. */
function ThumbWarmup({ uri }: { uri: string }) {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const thumb = await makeThumbnail(uri);
        if (cancelled) await deleteLocal(thumb);
      } catch {
        // Warm-up is opportunistic.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uri]);
  return null;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  canvasWrap: { flex: 1, justifyContent: 'center' },
  aiNotice: { flexDirection: 'row', alignItems: 'center', margin: 16, padding: 12 },
  thumbWrap: { width: 66, height: 66, borderWidth: 2, overflow: 'hidden' },
  thumbFallback: { flex: 1 },
  quickRow: { flexDirection: 'row', gap: 8 },
  quickButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 22, minWidth: 132 },
});