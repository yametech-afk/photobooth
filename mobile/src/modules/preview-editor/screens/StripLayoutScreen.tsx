/**
 * StripLayoutScreen — composes the captured burst into a printable strip.
 *
 * Route: `StripLayout` with `{ photos, filterId?, variant? }`.
 *
 * The strip is captured from a real view tree (StripCanvas) with
 * react-native-view-shot, so what the user sees is byte-for-byte what gets saved,
 * uploaded (mode: 'strip') and shared.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../../../theme/ThemeContext';
import { useAuth } from '../../../hooks/useAuth';
import { usePhotos } from '../../../contexts/PhotoContext';
import StripCanvas from '../components/StripCanvas';
import StripLayoutPicker from '../components/StripLayoutPicker';
import SaveToDeviceButton from '../components/SaveToDeviceButton';
import ShareSheet from '../components/ShareSheet';
import FilterPicker from '../components/FilterPicker';
import { usePhotoUpload } from '../hooks/usePhotoUpload';
import { getStripVariant, LIMITS, STRIP_VARIANTS } from '../constants';
import { formatBytes, localId } from '../utils/format';
import type { StripConfig, StripFrameId, StripVariantId } from '../types';
import type { MainStackParamList } from '../../../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'StripLayout'>;

const { width: SCREEN_W } = Dimensions.get('window');

export default function StripLayoutScreen({ route, navigation }: Props) {
  const { photos, filterId = 'none', variant = 'classic4' } = route.params;
  const insets = useSafeAreaInsets();
  const { colors, fonts, spacing, radius } = useTheme();
  const { user, profile } = useAuth();
  const { refreshRecentPhotos, clearPendingPhotos } = usePhotos();

  const canvasRef = useRef<View>(null);
  const sessionId = useRef(localId('session')).current;

  const [config, setConfig] = useState<StripConfig>({
    variant,
    frame: 'neon',
    caption: '',
    showDateStamp: true,
    photoUris: photos.map((p) => p.uri),
  });
  const [stripFilter, setStripFilter] = useState(filterId);
  const [exported, setExported] = useState<{ uri: string; sizeBytes: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const isPremium = profile?.plan === 'premium';
  const activeVariant = getStripVariant(config.variant);
  const sheetWidth = Math.min(SCREEN_W - spacing.xl * 2, 340);

  const upload = usePhotoUpload({
    uid: user?.uid ?? null,
    sessionId,
    onUploaded: async () => {
      await refreshRecentPhotos();
      clearPendingPhotos();
    },
  });

  const slotsFilled = useMemo(
    () => config.photoUris.filter(Boolean).length,
    [config.photoUris]
  );

  const patch = useCallback((next: Partial<StripConfig>) => {
    setConfig((prev) => ({ ...prev, ...next }));
  }, []);

  /**
   * Renders the strip view to a PNG/JPEG file.
   * `result: 'tmpfile'` keeps it out of the camera roll — the user decides when to save.
   */
  const exportStrip = useCallback(async (): Promise<{ uri: string; sizeBytes: number }> => {
    if (!canvasRef.current) throw new Error('Hindi pa handa ang strip canvas.');
    setBusy(true);
    try {
      const uri = await captureRef(canvasRef, {
        format: 'jpg',
        quality: LIMITS.stripCaptureQuality,
        result: 'tmpfile',
      });
      const { getFileSize } = await import('../services/imagePipeline');
      const sizeBytes = await getFileSize(uri);
      if (sizeBytes > LIMITS.maxUploadBytes) {
        throw new Error(`Sobrang laki ng strip (${formatBytes(sizeBytes)}). Bawasan ang layout slots.`);
      }
      setExported({ uri, sizeBytes });
      return { uri, sizeBytes };
    } finally {
      setBusy(false);
    }
  }, []);

  const handleUpload = useCallback(async () => {
    if (!user) {
      setNotice('Kailangan mag-login bago mag-upload.');
      return;
    }
    try {
      // Free plan gets the watermark burned in — the same rule the server applies.
      const { uri, sizeBytes } = exported ?? (await exportStrip());
      upload.enqueue({
        uri,
        filterId: stripFilter,
        mode: 'strip',
        visibility: 'private',
        caption: config.caption || undefined,
        sizeBytes,
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Nabigo ang pag-export ng strip.');
    }
  }, [user, exported, exportStrip, upload, stripFilter, config.caption]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Isara" hitSlop={10}>
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>
        <Text style={[fonts.subheading, { color: colors.text }]}>Photo Strip</Text>
        <Pressable onPress={() => setShareOpen(true)} accessibilityRole="button" accessibilityLabel="I-share" hitSlop={10}>
          <Ionicons name="share-outline" size={24} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        {/* Live strip preview — this exact view is what gets captured. */}
        <View style={{ alignItems: 'center', paddingVertical: spacing.md }}>
          <StripCanvas
            ref={canvasRef}
            config={config}
            width={sheetWidth}
            watermark={!isPremium}
          />
        </View>

        <View style={[styles.metaRow, { paddingHorizontal: spacing.md }]}>
          <Text style={[fonts.caption, { color: colors.textSecondary }]}>
            {slotsFilled} / {activeVariant.slots} slots • {activeVariant.name}
          </Text>
          {slotsFilled < activeVariant.slots && (
            <Text style={[fonts.caption, { color: colors.warning }]}>
              Kukulangin ang kuha — uulitin ang huling litrato.
            </Text>
          )}
        </View>

        <View style={{ marginTop: spacing.md }}>
          <StripLayoutPicker
            variant={config.variant}
            frame={config.frame}
            capturedCount={config.photoUris.length}
            onVariantChange={(next: StripVariantId) => patch({ variant: next })}
            onFrameChange={(next: StripFrameId) => patch({ frame: next })}
          />
        </View>

        <View style={{ marginTop: spacing.md }}>
          <FilterPicker
            selectedId={stripFilter}
            onSelect={setStripFilter}
            previewUri={config.photoUris[0]}
            isPremium={isPremium}
            onLockedPress={(filter) => setNotice(`${filter.name} ay Premium filter.`)}
            basicOnly
          />
        </View>

        {/* Caption + date stamp */}
        <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.md }}>
          <Text style={[fonts.caption, { color: colors.textSecondary }]}>Caption sa strip</Text>
          <TextInput
            value={config.caption}
            onChangeText={(text) => patch({ caption: text.slice(0, 60) })}
            placeholder="Hal. Happy Birthday, Ana!"
            placeholderTextColor={colors.textSecondary}
            maxLength={60}
            style={[
              styles.input,
              { backgroundColor: colors.surface, color: colors.text, borderRadius: radius.md },
            ]}
          />
          <View style={styles.switchRow}>
            <Text style={[fonts.body, { color: colors.text }]}>Ipakita ang petsa</Text>
            <Switch
              value={config.showDateStamp}
              onValueChange={(value) => patch({ showDateStamp: value })}
              trackColor={{ false: colors.card, true: colors.secondary }}
              thumbColor={colors.text}
            />
          </View>
        </View>

        {notice && (
          <Text style={[fonts.caption, { color: colors.warning, paddingHorizontal: spacing.md, marginTop: spacing.sm }]}>
            {notice}
          </Text>
        )}

        <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.lg, gap: spacing.sm }}>
          <Pressable
            onPress={() => void exportStrip()}
            disabled={busy}
            accessibilityRole="button"
            style={[styles.secondary, { backgroundColor: colors.surface, borderRadius: radius.lg }]}
          >
            {busy ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Ionicons name="image-outline" size={18} color={colors.primary} />
                <Text style={[fonts.body, { color: colors.text, marginLeft: 6 }]}>
                  I-render ang strip
                </Text>
              </>
            )}
          </Pressable>

          <SaveToDeviceButton
            localUri={exported?.uri ?? null}
            fileName={`photobooth-strip-${Date.now()}.jpg`}
            onSaved={() => setNotice('Naka-save ang strip sa camera roll.')}
            onError={setNotice}
          />

          <Pressable
            onPress={handleUpload}
            disabled={busy || upload.isBusy}
            accessibilityRole="button"
            style={[
              styles.primary,
              { backgroundColor: colors.primary, borderRadius: radius.lg, opacity: busy ? 0.6 : 1 },
            ]}
          >
            {upload.isBusy ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={18} color={colors.text} />
                <Text style={[fonts.body, { color: colors.text, marginLeft: 6, fontWeight: '600' }]}>
                  I-upload ang strip
                </Text>
              </>
            )}
          </Pressable>

          {!exported && (
            <Text style={[fonts.caption, { color: colors.textSecondary, textAlign: 'center' }]}>
              Awtomatikong ire-render ang strip bago mag-save o mag-upload.
            </Text>
          )}
        </View>
      </ScrollView>

      <ShareSheet
        visible={shareOpen}
        photoId={upload.jobs.find((job) => job.photoId)?.photoId ?? null}
        localUri={exported?.uri ?? null}
        isUploaded={Boolean(upload.jobs.find((job) => job.photoId)?.publicUrl)}
        caption={config.caption || null}
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
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' },
  input: { marginTop: 6, paddingHorizontal: 12, paddingVertical: 10 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
});

export { STRIP_VARIANTS };