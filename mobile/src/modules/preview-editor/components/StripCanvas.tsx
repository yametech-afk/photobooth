/**
 * Composes a photo strip as a real view tree, then captures it to an image file.
 *
 * Why a view instead of canvas drawing: the strip has to include the *graded*
 * images the user just previewed, plus caption/date typography that must match the
 * app's design tokens. Rendering it in RN and capturing with react-native-view-shot
 * guarantees pixel parity with what the user saw on screen.
 *
 * The captured file is what gets saved to the camera roll, uploaded (mode: 'strip')
 * and shared — nothing downstream needs to know how it was composed.
 */
import React, { forwardRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getStripFrame, getStripVariant } from '../constants';
import { formatDateStamp } from '../utils/format';
import type { StripConfig } from '../types';

type Props = {
  config: StripConfig;
  /** Logical strip width in px; height is derived from the variant. */
  width?: number;
  /** Applied to the composite file — keep in sync with what is on screen. */
  watermark?: boolean;
  appName?: string;
};

export const StripCanvas = forwardRef<View, Props>(function StripCanvas(
  { config, width = 320, watermark = false, appName = 'PHOTOBOOTH' },
  ref
) {
  const variant = getStripVariant(config.variant);
  const frame = getStripFrame(config.frame);

  // Fit as many captured photos as the variant has slots; repeat the last one when
  // the burst produced fewer frames so the strip never has holes.
  const photos = Array.from({ length: variant.slots }, (_, index) => {
    const source = config.photoUris[index] ?? config.photoUris[config.photoUris.length - 1];
    return source ?? null;
  });

  const gap = 8;
  const padding = 14;
  const columns = variant.columns;
  const rows = Math.ceil(variant.slots / columns);
  const cellWidth = (width - padding * 2 - gap * (columns - 1)) / columns;
  const cellHeight = cellWidth / variant.cellRatio;
  const isPolaroid = config.variant === 'polaroid1';
  const bottomBand = isPolaroid ? 84 : 58;

  return (
    <View
      ref={ref}
      collapsable={false}
      style={[
        styles.sheet,
        {
          width,
          backgroundColor: frame.background,
          paddingHorizontal: padding,
          paddingTop: padding,
          paddingBottom: padding,
          borderRadius: isPolaroid ? 6 : 14,
        },
      ]}
    >
      {/* Header */}
      <View style={[styles.header, { marginBottom: 10 }]}>
        <Text
          style={[styles.brand, { color: frame.accent }]}
          numberOfLines={1}
        >
          {appName}
        </Text>
        {config.showDateStamp && (
          <Text style={[styles.stamp, { color: frame.textColor, opacity: 0.75 }]}>
            {formatDateStamp()}
          </Text>
        )}
      </View>

      {/* Photo cells */}
      <View style={{ gap }}>
        {Array.from({ length: rows }, (_, row) => (
          <View key={`row-${row}`} style={{ flexDirection: 'row', gap }}>
            {Array.from({ length: columns }, (_, col) => {
              const index = row * columns + col;
              if (index >= variant.slots) {
                return <View key={`empty-${index}`} style={{ width: cellWidth }} />;
              }
              const uri = photos[index];
              return (
                <View
                  key={`cell-${index}`}
                  style={[
                    styles.cell,
                    {
                      width: cellWidth,
                      height: cellHeight,
                      borderColor: frame.accent,
                      backgroundColor: 'rgba(0,0,0,0.15)',
                    },
                  ]}
                >
                  {uri ? (
                    <Image source={{ uri }} style={styles.cellImage} resizeMode="cover" />
                  ) : (
                    <View style={styles.cellEmpty}>
                      <Ionicons name="image-outline" size={22} color={frame.textColor} />
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </View>

      {/* Footer: caption + watermark */}
      <View style={[styles.footer, { minHeight: bottomBand, marginTop: 12 }]}>
        {config.caption ? (
          <Text
            style={[styles.caption, { color: frame.textColor }]}
            numberOfLines={2}
          >
            {config.caption}
          </Text>
        ) : null}
        <View style={styles.footerBottom}>
          <View style={[styles.rule, { backgroundColor: frame.accent }]} />
          {watermark && (
            <Text style={[styles.watermark, { color: frame.textColor }]}>
              {appName} • free plan
            </Text>
          )}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  sheet: {
    alignSelf: 'center',
    // A quiet drop shadow so the strip reads as a physical print on the preview screen.
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { fontSize: 13, fontWeight: '700', letterSpacing: 2 },
  stamp: { fontSize: 10, fontWeight: '600', letterSpacing: 1 },
  cell: { borderRadius: 4, borderWidth: 1, overflow: 'hidden' },
  cellImage: { width: '100%', height: '100%' },
  cellEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footer: { justifyContent: 'flex-end' },
  caption: { fontSize: 12, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  footerBottom: { alignItems: 'center' },
  rule: { width: 42, height: 3, borderRadius: 2, marginBottom: 6 },
  watermark: { fontSize: 9, fontWeight: '600', letterSpacing: 1, opacity: 0.8 },
});

export default StripCanvas;