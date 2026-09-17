/**
 * GalleryScreen (module version) — replaces the lighter list from the mobile-core
 * module while keeping the exact same data source (`PhotoContext.recentPhotos` is
 * refreshed, not replaced).
 *
 * Adds: paginated Firestore loading, visual filters, multi-select + bulk delete,
 * per-photo detail sheet (save / share / edit / delete), cache-first offline paint,
 * and a dedicated empty/error state for every case.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../../theme/ThemeContext';
import { useAuth } from '../../../hooks/useAuth';
import { usePhotos } from '../../../contexts/PhotoContext';
import GalleryTile from '../components/GalleryTile';
import EmptyState, { type EmptyStateKind } from '../components/EmptyState';
import SaveToDeviceButton from '../components/SaveToDeviceButton';
import ShareSheet from '../components/ShareSheet';
import { useGallery } from '../hooks/useGallery';
import { formatBytes, humanStatus, localId, formatRelativeTime } from '../utils/format';
import type { GalleryItem, GalleryVisualFilter } from '../types';
import type { MainStackParamList } from '../../../navigation/types';

const { width: SCREEN_W } = Dimensions.get('window');

const VISUAL_FILTERS: { id: GalleryVisualFilter; label: string }[] = [
  { id: 'all', label: 'Lahat' },
  { id: 'favorites', label: 'Paborito' },
  { id: 'public', label: 'Public' },
  { id: 'private', label: 'Private' },
  { id: 'strips', label: 'Strips' },
];

export default function GalleryScreen() {
  const insets = useSafeAreaInsets();
  const { colors, fonts, spacing, radius } = useTheme();
  const { user } = useAuth();
  const { refreshRecentPhotos } = usePhotos();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  const gallery = useGallery({ uid: user?.uid ?? null });

  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<GalleryItem | null>(null);
  const [shareItem, setShareItem] = useState<GalleryItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sessionId = useMemo(() => localId('session'), []);
  const columns = 3;
  const tileGap = 6;
  const tileSize = (SCREEN_W - spacing.md * 2 - tileGap * (columns - 1)) / columns;

  const onPressTile = useCallback(
    (item: GalleryItem) => {
      if (selectionMode) {
        setSelected((prev) =>
          prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
        );
        return;
      }
      setDetail(item);
    },
    [selectionMode]
  );

  const onLongPressTile = useCallback((item: GalleryItem) => {
    setSelectionMode(true);
    setSelected((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]));
  }, []);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelected([]);
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selected.length === 0) return;
    const result = await gallery.removeMany(selected);
    await refreshRecentPhotos();
    setNotice(
      result.failed.length > 0
        ? `${result.deleted} na-delete, ${result.failed.length} ang nabigo.`
        : `${result.deleted} litrato ang na-delete.`
    );
    exitSelection();
  }, [selected, gallery, refreshRecentPhotos, exitSelection]);

  const handleDeleteOne = useCallback(
    async (photoId: string) => {
      const ok = await gallery.removeItem(photoId);
      if (ok) {
        await refreshRecentPhotos();
        setDetail(null);
        setNotice('Na-delete ang litrato. Naibalik ang credit kung AI filter ang ginamit.');
      }
    },
    [gallery, refreshRecentPhotos]
  );

  const emptyKind: EmptyStateKind | null = useMemo(() => {
    if (gallery.error) return 'error';
    if (gallery.loading && gallery.items.length === 0) return null;
    if (gallery.items.length === 0) return 'no-photos';
    if (gallery.visibleItems.length === 0) return 'no-results';
    if (gallery.fromCache) return 'offline';
    return null;
  }, [gallery.error, gallery.loading, gallery.items.length, gallery.visibleItems.length, gallery.fromCache]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<GalleryItem>) => (
      <GalleryTile
        item={item}
        size={tileSize}
        selected={selected.includes(item.id)}
        selectionMode={selectionMode}
        favorited={gallery.favoriteIds.includes(item.id)}
        onPress={onPressTile}
        onLongPress={onLongPressTile}
        onToggleFavorite={gallery.toggleFavorite}
      />
    ),
    [tileSize, selected, selectionMode, gallery.favoriteIds, gallery.toggleFavorite, onPressTile, onLongPressTile]
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: spacing.md }]}>
        {selectionMode ? (
          <>
            <Pressable onPress={exitSelection} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cancel">
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
            <Text style={[fonts.subheading, { color: colors.text }]}>{selected.length} napili</Text>
            <Pressable
              onPress={handleBulkDelete}
              hitSlop={10}
              disabled={selected.length === 0}
              accessibilityRole="button"
              accessibilityLabel="Delete selected"
            >
              <Ionicons
                name="trash-outline"
                size={22}
                color={selected.length === 0 ? colors.textSecondary : colors.error}
              />
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[fonts.heading, { color: colors.text }]}>Gallery</Text>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Pressable
                onPress={() => void gallery.refresh()}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="I-refresh"
              >
                <Ionicons name="refresh" size={22} color={colors.text} />
              </Pressable>
              <Pressable
                onPress={() => navigation.navigate('Camera')}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Bagong kuha"
              >
                <Ionicons name="camera-outline" size={24} color={colors.text} />
              </Pressable>
            </View>
          </>
        )}
      </View>

      {/* Visual filters */}
      {!selectionMode && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.sm, paddingVertical: spacing.sm }}
        >
          {VISUAL_FILTERS.map((filter) => {
            const active = filter.id === gallery.visualFilter;
            return (
              <Pressable
                key={filter.id}
                onPress={() => gallery.setVisualFilter(filter.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 14,
                  borderRadius: radius.round,
                  backgroundColor: active ? colors.primary : colors.surface,
                }}
              >
                <Text style={[fonts.caption, { color: active ? colors.text : colors.textSecondary }]}>
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {notice && (
        <Text style={[fonts.caption, { color: colors.secondary, paddingHorizontal: spacing.md, marginBottom: spacing.xs }]}>
          {notice}
        </Text>
      )}

      {/* Grid */}
      {emptyKind ? (
        <EmptyState
          kind={emptyKind}
          message={gallery.error ?? undefined}
          onPrimary={
            emptyKind === 'no-photos'
              ? () => navigation.navigate('Camera')
              : emptyKind === 'no-results'
              ? () => gallery.setVisualFilter('all')
              : () => void gallery.retry()
          }
          onSecondary={emptyKind === 'no-photos' ? () => navigation.navigate('Premium') : undefined}
        />
      ) : (
        <FlatList
          data={gallery.visibleItems}
          keyExtractor={(item) => item.id}
          numColumns={columns}
          renderItem={renderItem}
          columnWrapperStyle={{ gap: tileGap, paddingHorizontal: spacing.md }}
          contentContainerStyle={{ gap: tileGap, paddingBottom: insets.bottom + 90 }}
          refreshControl={
            <RefreshControl
              refreshing={gallery.refreshing}
              onRefresh={() => void gallery.refresh()}
              tintColor={colors.primary}
            />
          }
          onEndReachedThreshold={0.4}
          onEndReached={() => void gallery.loadMore()}
          ListFooterComponent={
            gallery.loadingMore ? (
              <View style={{ paddingVertical: spacing.lg }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : gallery.hasMore ? (
              <Text style={[fonts.caption, { color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.md }]}>
                Mag-scroll para sa iba pa
              </Text>
            ) : null
          }
        />
      )}

      {/* Detail sheet */}
      <Modal visible={detail != null} animationType="slide" transparent onRequestClose={() => setDetail(null)}>
        <Pressable style={styles.backdrop} onPress={() => setDetail(null)} accessibilityLabel="Isara" />
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.card }]} />
          {detail && (
            <>
              <Text style={[fonts.subheading, { color: colors.text, marginTop: spacing.md }]}>
                {detail.filterId === 'none' ? 'Original' : detail.filterId}
              </Text>
              <Text style={[fonts.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                {formatRelativeTime(detail.createdAtMs)} • {detail.visibility} • {humanStatus(detail.status)}
                {detail.sizeBytes ? ` • ${formatBytes(detail.sizeBytes)}` : ''}
              </Text>

              <ScrollView contentContainerStyle={{ paddingVertical: spacing.lg, gap: spacing.sm }}>
                <Pressable
                  onPress={() => {
                    setDetail(null);
                    navigation.navigate('PhotoEditor', {
                      uri: detail.url,
                      filterId: detail.filterId,
                      photoId: detail.id,
                      mode: detail.mode,
                    });
                  }}
                  style={[styles.row, { backgroundColor: colors.surface, borderRadius: radius.md }]}
                >
                  <Ionicons name="options-outline" size={20} color={colors.text} />
                  <Text style={[fonts.body, { color: colors.text, marginLeft: 12 }]}>I-edit</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    const item = detail;
                    setDetail(null);
                    setShareItem(item);
                  }}
                  style={[styles.row, { backgroundColor: colors.surface, borderRadius: radius.md }]}
                >
                  <Ionicons name="share-outline" size={20} color={colors.text} />
                  <Text style={[fonts.body, { color: colors.text, marginLeft: 12 }]}>I-share</Text>
                </Pressable>

                <View style={[styles.row, { backgroundColor: colors.surface, borderRadius: radius.md }]}>
                  <Ionicons name="download-outline" size={20} color={colors.text} />
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <SaveToDeviceButton
                      compact
                      remoteUrl={detail.url}
                      fileName={`photobooth-${detail.id}.jpg`}
                      onSaved={() => setNotice('Naka-save sa camera roll.')}
                      onError={setNotice}
                    />
                  </View>
                </View>

                <Pressable
                  onPress={() => void handleDeleteOne(detail.id)}
                  style={[
                    styles.row,
                    { backgroundColor: 'rgba(255,82,82,0.12)', borderRadius: radius.md },
                  ]}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                  <Text style={[fonts.body, { color: colors.error, marginLeft: 12 }]}>I-delete</Text>
                </Pressable>
              </ScrollView>
            </>
          )}
        </View>
      </Modal>

      <ShareSheet
        visible={shareItem != null}
        photoId={shareItem?.id ?? null}
        localUri={null}
        isUploaded={Boolean(shareItem?.url)}
        caption={shareItem?.caption ?? null}
        sessionId={sessionId}
        onClose={() => setShareItem(null)}
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
    paddingTop: 8,
    paddingBottom: 4,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { maxHeight: '72%', paddingHorizontal: 24, paddingBottom: 28 },
  handle: { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, marginTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14 },
});