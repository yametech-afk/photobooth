/**
 * Edit toolbar + grade sliders.
 *
 * Geometry actions (rotate/flip/crop) re-bake through expo-image-manipulator, so
 * they are debounced behind a "processing" flag. Grade sliders are pure uniforms —
 * they never touch the file until the user saves.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useTheme } from '../../../theme/ThemeContext';
import { clamp } from '../utils/format';
import type { ColorGrade, CropRatio } from '../types';

type ToolbarProps = {
  onRotate: (direction: 'cw' | 'ccw') => void;
  onFlip: (axis: 'h' | 'v') => void;
  onReset: () => void;
  onEquals?: () => void;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function EditToolbar({
  onRotate,
  onFlip,
  onReset,
  onEquals,
  busy = false,
  style,
}: ToolbarProps) {
  const { colors, fonts, spacing, radius } = useTheme();

  const buttons = [
    { key: 'rotate-ccw', icon: 'rotate-left-outline', label: 'Kaliwa', onPress: () => onRotate('ccw') },
    { key: 'rotate-cw', icon: 'rotate-right-outline', label: 'Kanan', onPress: () => onRotate('cw') },
    { key: 'flip-h', icon: 'swap-horizontal-outline', label: 'Salamin', onPress: () => onFlip('h') },
    { key: 'flip-v', icon: 'swap-vertical-outline', label: 'Baliktad', onPress: () => onFlip('v') },
    ...(onEquals
      ? [{ key: 'equals', icon: 'contract-outline' as const, label: 'Gawing square', onPress: onEquals }]
      : []),
    { key: 'reset', icon: 'refresh-outline', label: 'Reset', onPress: onReset },
  ];

  return (
    <View style={style}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.sm }}
      >
        {buttons.map((button) => (
          <Pressable
            key={button.key}
            accessibilityRole="button"
            accessibilityLabel={button.label}
            disabled={busy}
            onPress={button.onPress}
            style={[
              styles.toolButton,
              {
                backgroundColor: colors.surface,
                borderRadius: radius.md,
                opacity: busy ? 0.5 : 1,
              },
            ]}
          >
            <Ionicons name={button.icon as never} size={22} color={colors.text} />
            <Text style={[fonts.caption, { color: colors.textSecondary, marginTop: 2 }]}>
              {button.label}
            </Text>
          </Pressable>
        ))}
        {busy && (
          <View style={styles.busyWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

type CropRowProps = {
  value: CropRatio;
  onChange: (ratio: CropRatio) => void;
  onApply: () => void;
};

export function CropRow({ value, onChange, onApply }: CropRowProps) {
  const { colors, fonts, spacing, radius } = useTheme();
  const ratios: CropRatio[] = ['original', '1:1', '4:5', '16:9', '9:16'];

  return (
    <View style={{ paddingHorizontal: spacing.md }}>
      <Text style={[fonts.caption, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
        Crop / aspect ratio
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {ratios.map((ratio) => {
          const active = ratio === value;
          return (
            <Pressable
              key={ratio}
              accessibilityRole="button"
              accessibilityLabel={`Crop ${ratio}`}
              onPress={() => {
                onChange(ratio);
                onApply();
              }}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: radius.round,
                backgroundColor: active ? colors.primary : colors.surface,
              }}
            >
              <Text style={[fonts.caption, { color: active ? colors.text : colors.textSecondary }]}>
                {ratio === 'original' ? 'Orihinal' : ratio}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

type SliderRowProps = {
  grade: ColorGrade;
  onChange: (patch: Partial<ColorGrade>) => void;
  onCommit?: () => void;
  onReset: () => void;
};

type SliderSpec = {
  key: keyof ColorGrade;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Formats the raw uniform value for the label. */
  format: (value: number) => string;
};

const SLIDERS: SliderSpec[] = [
  {
    key: 'brightness',
    label: 'Brightness',
    min: -0.5,
    max: 0.5,
    step: 0.01,
    format: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`,
  },
  {
    key: 'contrast',
    label: 'Contrast',
    min: 0.5,
    max: 2,
    step: 0.01,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: 'saturation',
    label: 'Saturation',
    min: 0,
    max: 2,
    step: 0.01,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: 'vignette',
    label: 'Vignette',
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => `${Math.round(v * 100)}%`,
  },
];

export function GradeSliders({ grade, onChange, onCommit, onReset }: SliderRowProps) {
  const { colors, fonts, spacing } = useTheme();
  const [openAdvanced, setOpenAdvanced] = useState(false);

  const handle = useCallback(
    (spec: SliderSpec, raw: number) => {
      const value = clamp(raw, spec.min, spec.max);
      if (spec.key === 'brightness' || spec.key === 'contrast' || spec.key === 'saturation' || spec.key === 'vignette') {
        onChange({ [spec.key]: value } as Partial<ColorGrade>);
      }
    },
    [onChange]
  );

  const visible = useMemo(
    () => (openAdvanced ? SLIDERS : SLIDERS.filter((s) => s.key !== 'vignette')),
    [openAdvanced]
  );

  return (
    <View style={{ paddingHorizontal: spacing.md }}>
      <View style={styles.sliderHeader}>
        <Text style={[fonts.caption, { color: colors.textSecondary }]}>Manual adjustments</Text>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Pressable onPress={() => setOpenAdvanced((v) => !v)} accessibilityRole="button">
            <Text style={[fonts.caption, { color: colors.secondary }]}>
              {openAdvanced ? 'Tago' : 'Higit pa'}
            </Text>
          </Pressable>
          <Pressable onPress={onReset} accessibilityRole="button" accessibilityLabel="Reset adjustments">
            <Text style={[fonts.caption, { color: colors.primary }]}>Reset</Text>
          </Pressable>
        </View>
      </View>

      {visible.map((spec) => {
        const raw = grade[spec.key];
        const value = typeof raw === 'number' ? raw : 0;
        return (
          <View key={String(spec.key)} style={{ marginBottom: spacing.xs }}>
            <View style={styles.sliderLabelRow}>
              <Text style={[fonts.caption, { color: colors.text }]}>{spec.label}</Text>
              <Text style={[fonts.caption, { color: colors.textSecondary }]}>{spec.format(value)}</Text>
            </View>
            <Slider
              minimumValue={spec.min}
              maximumValue={spec.max}
              step={spec.step}
              value={value}
              onValueChange={(next: number) => handle(spec, next)}
              onSlidingComplete={() => onCommit?.()}
              minimumTrackTintColor={colors.primary}
              maximumTrackTintColor={colors.card}
              thumbTintColor={colors.primary}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  toolButton: {
    width: 74,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
  },
  busyWrap: { justifyContent: 'center', paddingHorizontal: 12 },
  sliderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sliderLabelRow: { flexDirection: 'row', justifyContent: 'space-between' },
});