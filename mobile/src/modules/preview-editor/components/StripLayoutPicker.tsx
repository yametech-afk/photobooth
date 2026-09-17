/**
 * Strip template + frame picker.
 * Shows the slot count up front so the user knows how many captures the burst needs.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../theme/ThemeContext';
import { STRIP_FRAMES, STRIP_VARIANTS } from '../constants';
import type { StripFrameId, StripVariantId } from '../types';

type Props = {
  variant: StripVariantId;
  frame: StripFrameId;
  capturedCount: number;
  onVariantChange: (variant: StripVariantId) => void;
  onFrameChange: (frame: StripFrameId) => void;
};

export default function StripLayoutPicker({
  variant,
  frame,
  capturedCount,
  onVariantChange,
  onFrameChange,
}: Props) {
  const { colors, fonts, spacing, radius } = useTheme();

  return (
    <View>
      <Text style={[fonts.caption, { color: colors.textSecondary, marginHorizontal: spacing.md }]}>
        Layout ng strip
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.sm, marginTop: spacing.sm }}
      >
        {STRIP_VARIANTS.map((item) => {
          const active = item.id === variant;
          const short = capturedCount < item.slots;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`Layout ${item.name}, ${item.slots} kuha`}
              onPress={() => onVariantChange(item.id)}
              style={[
                styles.card,
                {
                  backgroundColor: active ? 'rgba(255,77,166,0.16)' : colors.surface,
                  borderColor: active ? colors.primary : 'transparent',
                  borderRadius: radius.md,
                },
              ]}
            >
              <Ionicons
                name={item.slots > 3 ? 'grid-outline' : 'albums-outline'}
                size={20}
                color={active ? colors.primary : colors.textSecondary}
              />
              <Text style={[fonts.caption, { color: colors.text, marginTop: 4 }]}>{item.name}</Text>
              <Text style={[fonts.caption, { color: short ? colors.warning : colors.textSecondary }]}>
                {item.slots} slots
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text
        style={[
          fonts.caption,
          { color: colors.textSecondary, marginHorizontal: spacing.md, marginTop: spacing.sm },
        ]}
      >
        Frame
      </Text>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          marginTop: spacing.sm,
        }}
      >
        {STRIP_FRAMES.map((item) => {
          const active = item.id === frame;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`Frame ${item.name}`}
              onPress={() => onFrameChange(item.id)}
              style={[
                styles.frameChip,
                {
                  backgroundColor: item.background,
                  borderColor: active ? item.accent : 'transparent',
                  borderWidth: active ? 2 : 1,
                  borderRadius: radius.sm,
                },
              ]}
            >
              <View style={[styles.frameDot, { backgroundColor: item.accent }]} />
              <Text style={[fonts.caption, { color: item.textColor }]}>{item.name}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 104,
    padding: 10,
    borderWidth: 2,
    alignItems: 'center',
  },
  frameChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  frameDot: { width: 10, height: 10, borderRadius: 5 },
});