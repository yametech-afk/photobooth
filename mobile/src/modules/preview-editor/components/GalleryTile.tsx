/**
 * A single gallery cell.
 *
 * Long-press enters selection mode (multi-select delete/save), which is the gesture
 * users already expect from the system photo app.
 */
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../theme/ThemeContext';
import { formatRelativeTime } from '../utils/format';
import type { GalleryItem } from '../types';

type Props = {
  item: GalleryItem;
  size: number;
  selected?: boolean;
  selectionMode?: boolean;
  favorited?: boolean;
  onPress: (item: GalleryItem) => void;
  onLongPress: (item: GalleryItem) => void;
  onToggleFavorite?: (photoId: string) => void;
};

export default function GalleryTile({
  item,
  size,
  selected = false,
  selectionMode = false,
  favorited = false,
  onPress,
  onLongPress,
  onToggleFavorite,
}: Props) {
  const { colors, fonts, spacing, radius } = useTheme();

  const badge = item.visibility === 'public' ? 'globe-outline' : item.visibility === 'event' ? 'people-outline' : 'lock-closed-outline';

  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={`Litrato ${formatRelativeTime(item.createdAtMs)}, filter ${item.filterId}`}
      accessibilityState={{ selected }}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
      delayLongPress={280}
      style={{ width: size, height: size }}
    >
      <View
        style={[
          styles.tile,
          {
            borderRadius: radius.md,
            borderColor: selected ? colors.primary : 'transparent',
            borderWidth: selected ? 2 : 0,
            backgroundColor: colors.surface,
          },
        ]}
      >
        <Image
          source={{ uri: item.thumbUrl ?? item.url }}
          style={styles.image}
          resizeMode="cover"
        />

        {/* Bottom scrim keeps the caption legible over any photo. */}
        <View style={styles.scrim}>
          <Text style={[fonts.caption, { color: '#FFFFFF' }]} numberOfLines={1}>
            {item.filterId === 'none' ? 'Original' : item.filterId}
          </Text>
          <View style={styles.metaRow}>
            <Ionicons name={badge as never} size={11} color="rgba(255,255,255,0.9)" />
            <Text style={[fonts.caption, { color: 'rgba(255,255,255,0.85)', marginLeft: 3 }]}>
              {formatRelativeTime(item.createdAtMs)}
            </Text>
          </View>
        </View>

        {item.mode === 'strip' && (
          <View style={[styles.modeChip, { backgroundColor: colors.secondary }]}>
            <Text style={[fonts.caption, { color: '#0A0A1F', fontWeight: '700', fontSize: 9 }]}>STRIP</Text>
          </View>
        )}

        {item.status !== 'ready' && (
          <View style={[styles.processing, { backgroundColor: 'rgba(10,10,31,0.7)' }]}>
            <Ionicons
              name={item.status === 'failed' ? 'alert-circle' : 'hourglass-outline'}
              size={18}
              color={item.status === 'failed' ? colors.error : colors.warning}
            />
          </View>
        )}

        {!selectionMode && onToggleFavorite && (
          <Pressable
            onPress={() => onToggleFavorite(item.id)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={favorited ? 'Alisin sa paborito' : 'Idagdag sa paborito'}
            style={styles.favorite}
          >
            <Ionicons
              name={favorited ? 'heart' : 'heart-outline'}
              size={16}
              color={favorited ? colors.primary : 'rgba(255,255,255,0.9)'}
            />
          </Pressable>
        )}

        {selectionMode && (
          <View style={[styles.checkbox, { borderColor: '#FFFFFF' }]}>
            {selected && (
              <View style={[styles.checkboxFill, { backgroundColor: colors.primary }]}>
                <Ionicons name="checkmark" size={14} color="#FFFFFF" />
              </View>
            )}
          </View>
        )}
      </View>
      {item.isFlagged && (
        <Text style={[fonts.caption, { color: colors.warning, marginTop: spacing.xs }]}>
          Naka-flag para sa review
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(10,10,31,0.55)',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  modeChip: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  processing: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favorite: {
    position: 'absolute',
    top: 6,
    right: 6,
    padding: 4,
  },
  checkbox: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    overflow: 'hidden',
  },
  checkboxFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});