/**
 * Horizontal filter rail.
 *
 * Two chip styles, and the distinction matters to the user's wallet:
 *  - GPU presets preview instantly and are free.
 *  - AI (cloud) presets are rendered server-side, cost a credit, and are locked
 *    behind Premium — tapping one shows the lock badge and routes to the paywall.
 */
import React, { useMemo } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../theme/ThemeContext';
import { FILTER_PRESETS, getFilterPreset } from '../constants';
import { localId } from '../utils/format';
import type { FilterPreset } from '../types';

type Props = {
  selectedId: string;
  onSelect: (filterId: string) => void;
  /** Thumbnail source for the live previews. */
  previewUri?: string;
  /** Premium state supplied by the monetization module (never re-derived here). */
  isPremium: boolean;
  /** Called instead of `onSelect` when a locked AI filter is tapped. */
  onLockedPress?: (filter: FilterPreset) => void;
  /** Show only the free GPU presets (used by the strip composer). */
  basicOnly?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function FilterPicker({
  selectedId,
  onSelect,
  previewUri,
  isPremium,
  onLockedPress,
  basicOnly = false,
  style,
}: Props) {
  const { colors, fonts, spacing, radius } = useTheme();

  const presets = useMemo(
    () => (basicOnly ? FILTER_PRESETS.filter((p) => p.renderer === 'gpu') : FILTER_PRESETS),
    [basicOnly]
  );

  const selected = getFilterPreset(selectedId);

  return (
    <View style={style}>
      <FlatList
        horizontal
        data={presets}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.sm }}
        renderItem={({ item }) => {
          const locked = item.isPremium && !isPremium;
          const active = item.id === selectedId;
          const isAi = item.renderer === 'cloud';

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Filter ${item.name}${locked ? ' (premium, naka-lock)' : ''}`}
              accessibilityState={{ selected: active }}
              onPress={() => (locked ? onLockedPress?.(item) : onSelect(item.id))}
              style={styles.chip}
            >
              <View
                style={[
                  styles.thumb,
                  {
                    borderRadius: radius.md,
                    borderColor: active ? colors.primary : 'transparent',
                    backgroundColor: colors.surface,
                  },
                ]}
              >
                {previewUri ? (
                  <Image source={{ uri: previewUri }} style={styles.thumbImage} resizeMode="cover" />
                ) : (
                  <View style={[styles.thumbImage, { backgroundColor: item.color }]} />
                )}
                {/* Offline tint hint so the rail communicates the look without the GPU. */}
                <View
                  style={[
                    styles.tintOverlay,
                    {
                      backgroundColor: item.color,
                      opacity: item.id === 'none' ? 0 : 0.28,
                    },
                  ]}
                />
                {isAi && (
                  <View style={[styles.badge, { backgroundColor: colors.secondary }]}>
                    <Text style={[fonts.caption, styles.badgeText]}>AI</Text>
                  </View>
                )}
                {locked && (
                  <View style={[styles.badge, { backgroundColor: colors.warning, right: 6, left: undefined }]}>
                    <Ionicons name="lock-closed" size={11} color="#1A1A2E" />
                  </View>
                )}
              </View>
              <Text
                numberOfLines={1}
                style={[
                  fonts.caption,
                  {
                    color: active ? colors.primary : colors.textSecondary,
                    marginTop: 4,
                    textAlign: 'center',
                    maxWidth: 68,
                  },
                ]}
              >
                {item.name}
              </Text>
            </Pressable>
          );
        }}
      />

      <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.xs }}>
        <Text style={[fonts.caption, { color: colors.textSecondary }]}>
          {selected.renderer === 'cloud'
            ? `AI filter: ${selected.name} — 1 credit, nire-render sa server kapag nag-save ka.`
            : `Preset: ${selected.name} — agad na preview, walang credit.`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { width: 72, alignItems: 'center' },
  thumb: {
    width: 64,
    height: 64,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImage: { width: '100%', height: '100%' },
  tintOverlay: { ...StyleSheet.absoluteFillObject },
  badge: {
    position: 'absolute',
    top: 4,
    left: 4,
    paddingHorizontal: 5,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 16,
  },
  badgeText: { color: '#0A0A1F', fontWeight: '700', fontSize: 10 },
});

/** Stable key helper for tests / list reuse. */
export const filterChipKey = (preset: FilterPreset) => preset.id || localId('filter');