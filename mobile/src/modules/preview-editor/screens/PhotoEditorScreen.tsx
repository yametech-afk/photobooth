/**
 * PhotoEditorScreen — manual adjustments on one photo.
 *
 * Route: `PhotoEditor` with `{ uri, filterId, width?, height?, mode?, photoId? }`.
 *
 * Every action writes through `usePhotoEditor`; nothing is baked to disk until the
 * user leaves (or taps Apply), which keeps the interaction instant. Grade changes
 * are shader uniforms; geometry changes re-bake via expo-image-manipulator.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../../../theme/ThemeContext';
import { useAuth } from '../../../hooks/useAuth';
import { usePhotos } from '../../../contexts/PhotoContext';
import FilterPicker from '../components/FilterPicker';
import FilterPreviewCanvas from '../components/FilterPreviewCanvas';
import { CropRow, EditToolbar, GradeSliders } from '../components/EditToolbar';
import SaveToDeviceButton from '../components/SaveToDeviceButton';
import ShareSheet from '../components/ShareSheet';
import { usePhotoEditor } from '../hooks/usePhotoEditor';
import { usePhotoUpload } from '../hooks/usePhotoUpload';
import { bakeGeometry, deleteLocal, getFileSize, getImageDims } from '../services/imagePipeline';
import { bakeGrade } from '../services/filterRenderer';
import { getFilterPreset, LIMITS } from '../constants';
import { localId } from '../utils/format';
import type { MainStackParamList } from '../../../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'PhotoEditor'>;

const { height: SCREEN_H } = Dimensions.get('window');

export default function PhotoEditorScreen({ route, navigation }: Props) {
  const { uri, filterId, width, height, mode = 'single', photoId } = route.params;
  const insets = useSafeAreaInsets();
  const { colors, fonts, spacing, radius } = useTheme();
  const { user, profile } = useAuth();
  const { refreshRecentPhotos, clearPendingPhotos } = usePhotos();

  const [workingUri, setWorkingUri] = useState(uri);
  const [aspect, setAspect] = useState(width && height ? width / height : 3 / 4);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [existing, setExisting] = useState<{ photoId: string; url: string } | null>(
    photoId ? { photoId, url: '' } : null
  );

  const sessionId = useRef(localId('session')).current;
  const editor = usePhotoEditor({ initialFilterId: filterId });
  const isPremium = profile?.plan === 'premium';
  const preset = getFilterPreset(editor.state.filterId);
  const isCloudFilter = preset.renderer === 'cloud';

  const upload = usePhotoUpload({
    uid: user?.uid ?? null,
    sessionId,
    onUploaded: async (job) => {
      setExisting({ photoId: job.photoId ?? '', url: job.publicUrl ?? '' });
      await refreshRecentPhotos();
      clearPendingPhotos();
    },
  });

  useEffect(() => {
    if (width && height) return;
    void getImageDims(uri).then((dims) => {
      if (dims.width && dims.height) setAspect(dims.width / dims.height);
    });
  }, [uri, width, height]);

  /**
   * Geometry actions need a real file, so they re-bake. Colour isn't lost: the
   * canvas keeps applying the current grade to the newly baked file.
   */
  const applyGeometry = useCallback(async () => {
    setBusy(true);
    try {
      const result = await bakeGeometry(workingUri, editor.state.transform, {
        quality: 0.94,
        maxLongEdge: isPremium ? LIMITS.maxResizeLongEdge : LIMITS.defaultResizeLongEdge,
      });
      setWorkingUri(result.uri);
      setAspect(result.width / result.height);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Nabigo ang pag-edit ng litrato.');
    } finally {
      setBusy(false);
    }
  }, [workingUri, editor.state.transform, isPremium]);

  /** Final quality pass: bake the grade, then geometry, into one file. */
  const bakeFinal = useCallback(
    async (quality = 0.95) => {
      let output = workingUri;
      if (!isCloudFilter) {
        const graded = await bakeGrade(output, editor.state.grade, { quality });
        output = graded.uri;
      }
      const normalized = await bakeGeometry(output, { ...editor.state.transform }, {
        quality,
        maxLongEdge: isPremium ? LIMITS.maxResizeLongEdge : LIMITS.defaultResizeLongEdge,
      });
      return normalized;
    },
    [workingUri, editor.state.grade, editor.state.transform, isCloudFilter, isPremium]
  );

  const handleUpload = useCallback(async () => {
    if (!user) {
      setNotice('Kailangan mag-login bago mag-upload.');
      return;
    }
    if (existing && existing.url) {
      setNotice('Naka-upload na ang litratong ito.');
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const baked = await bakeFinal(0.93);
      const sizeBytes = await getFileSize(baked.uri);
      if (sizeBytes > LIMITS.maxUploadBytes) {
        throw new Error('Sobrang laki ng file (max 10MB). I-save na lang sa device.');
      }

      upload.enqueue({
        uri: baked.uri,
        filterId: editor.state.filterId,
        mode,
        visibility: 'private',
        width: baked.width,
        height: baked.height,
        sizeBytes,
        filterApplied: editor.isDirty || isCloudFilter,
      });
      // Keep the graded file around for the share sheet.
      setWorkingUri(baked.uri);
      setAspect(baked.width / baked.height);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Nabigo ang paghanda ng litrato.');
    } finally {
      setBusy(false);
    }
  }, [user, existing, bakeFinal, upload, editor.state.filterId, editor.isDirty, isCloudFilter, mode]);

  const handleSaveToDevice = useCallback(async () => {
    setBusy(true);
    try {
      const baked = await bakeFinal(0.98);
      setWorkingUri(baked.uri);
      // SaveToDeviceButton performs the MediaLibrary write; it is given the
      // freshly baked file via `localUri` below.
      return baked.uri;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Nabigo ang pag-bake ng litrato.');
      return null;
    } finally {
      setBusy(false);
    }
  }, [bakeFinal]);

  const bakedRef = useRef<string | null>(null);

  const visibleCanvasHeight = useMemo(
    () => Math.min(SCREEN_H * 0.42, 420),
    []
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            void deleteLocal(workingUri);
            navigation.goBack();
          }}
          accessibilityRole="button"
          accessibilityLabel="Bumalik"
          hitSlop={10}
        >
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>
        <Text style={[fonts.subheading, { color: colors.text }]}>Edit</Text>
        <Pressable onPress={() => setShareOpen(true)} accessibilityRole="button" accessibilityLabel="I-share" hitSlop={10}>
          <Ionicons name="share-outline" size={24} color={colors.text} />
        </Pressable>
      </View>

      <View style={{ alignItems: 'center', justifyContent: 'center', height: visibleCanvasHeight }}>
        {isCloudFilter ? (
          <View style={[styles.aiBox, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
            <Ionicons name="sparkles-outline" size={28} color={colors.secondary} />
            <Text style={[fonts.body, { color: colors.text, marginTop: spacing.sm, textAlign: 'center' }]}>
              {preset.name}
            </Text>
            <Text style={[fonts.caption, { color: colors.textSecondary, textAlign: 'center', marginTop: 6 }]}>
              AI filter na nire-render sa server. I-upload para makita ang resulta.
            </Text>
          </View>
        ) : (
          <FilterPreviewCanvas
            uri={workingUri}
            grade={editor.state.grade}
            aspectRatio={aspect}
            onError={(message) => setNotice(message)}
            style={{ maxHeight: visibleCanvasHeight }}
          />
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <FilterPicker
          selectedId={editor.state.filterId}
          onSelect={editor.selectFilter}
          previewUri={workingUri}
          isPremium={isPremium}
          onLockedPress={(filter) => setNotice(`${filter.name} ay Premium. Buksan ang Premium para i-unlock.`)}
          basicOnly
          style={{ marginTop: spacing.sm }}
        />

        <View style={{ marginTop: spacing.md }}>
          <EditToolbar
            busy={busy}
            onRotate={(direction) => {
              editor.rotate(direction);
              void applyGeometry();
            }}
            onFlip={(axis) => {
              editor.flip(axis);
              void applyGeometry();
            }}
            onEquals={() => {
              editor.setCropRatio('1:1');
              void applyGeometry();
            }}
            onReset={() => {
              editor.resetAll();
              setWorkingUri(uri);
              void getImageDims(uri).then((d) => d.width && setAspect(d.width / d.height));
            }}
          />
        </View>

        <View style={{ marginTop: spacing.md }}>
          <CropRow value={editor.state.transform.cropRatio} onChange={editor.setCropRatio} onApply={applyGeometry} />
        </View>

        <View style={{ marginTop: spacing.md }}>
          <GradeSliders grade={editor.state.grade} onChange={editor.setGrade} onReset={editor.resetGrade} />
        </View>

        {notice && (
          <Text style={[fonts.caption, { color: colors.warning, paddingHorizontal: spacing.md, marginTop: spacing.sm }]}>
            {notice}
          </Text>
        )}

        <View style={[styles.actions, { paddingHorizontal: spacing.md, marginTop: spacing.lg }]}>
          <SaveToDeviceButton
            localUri={bakedRef.current ?? workingUri}
            onSaved={() => setNotice('Naka-save sa camera roll.')}
            onError={setNotice}
          />
          <View style={{ height: spacing.sm }} />
          <Pressable
            onPress={handleUpload}
            disabled={busy || upload.isBusy}
            accessibilityRole="button"
            style={[
              styles.primary,
              { backgroundColor: colors.primary, borderRadius: radius.lg, opacity: busy ? 0.6 : 1 },
            ]}
          >
            {busy || upload.isBusy ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={18} color={colors.text} />
                <Text style={[fonts.body, { color: colors.text, marginLeft: 6, fontWeight: '600' }]}>
                  {upload.isBusy ? `Ina-upload ${Math.round(upload.overallProgress * 100)}%` : 'I-upload'}
                </Text>
              </>
            )}
          </Pressable>

          {upload.failedCount > 0 && (
            <Pressable onPress={upload.retryAllFailed} style={{ marginTop: spacing.sm, alignItems: 'center' }}>
              <Text style={[fonts.caption, { color: colors.error }]}>
                Retry {upload.failedCount} nabigong upload
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      <ShareSheet
        visible={shareOpen}
        photoId={existing?.photoId ?? upload.jobs.find((j) => j.photoId)?.photoId ?? null}
        localUri={workingUri}
        isUploaded={Boolean(existing?.url || upload.jobs.find((j) => j.photoId)?.publicUrl)}
        sessionId={sessionId}
        onClose={() => setShareOpen(false)}
        onError={setNotice}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  aiBox: { padding: 24, alignItems: 'center', maxWidth: 280 },
  actions: {},
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
});