/**
 * GPU preview canvas.
 *
 * Renders the live colour grade at 60fps through the expo-gl shader in
 * services/filterRenderer.ts. The photo is NOT re-encoded while the user scrubs
 * filters — the shader just receives new uniforms — so the preview stays fluid
 * and the device does no repeated JPEG work.
 *
 * Must be mounted for `bakeGrade()` to resolve: it publishes its renderer through
 * `renderBridge` as soon as the GL context is live.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, Text, type StyleProp, type ViewStyle } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { createFilterRenderer, renderBridge, type FilterRenderer } from '../services/filterRenderer';
import { useTheme } from '../../../theme/ThemeContext';
import type { ColorGrade } from '../types';

type Props = {
  uri: string;
  grade: ColorGrade;
  /** Called once the shader is live and the first frame is drawn. */
  onReady?: (renderer: FilterRenderer) => void;
  /** Called when the GL context could not be created (screen should fall back). */
  onError?: (message: string) => void;
  style?: StyleProp<ViewStyle>;
  /** Aspect ratio of the source image so the canvas does not letterbox oddly. */
  aspectRatio?: number;
};

export default function FilterPreviewCanvas({
  uri,
  grade,
  onReady,
  onError,
  style,
  aspectRatio = 3 / 4,
}: Props) {
  const { colors, fonts, radius } = useTheme();
  const rendererRef = useRef<FilterRenderer | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      rendererRef.current?.dispose();
      rendererRef.current = null;
      renderBridge.detach();
    };
  }, []);

  const handleContext = useCallback(
    async (gl: ExpoWebGLRenderingContext) => {
      try {
        const renderer = createFilterRenderer(gl);
        rendererRef.current = renderer;
        await renderer.loadAsset(uri);
        renderer.render(grade);
        renderBridge.attach(renderer);
        if (!mounted.current) return;
        setLoading(false);
        onReady?.(renderer);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Hindi ma-initialize ang GPU renderer.';
        console.warn('[preview-editor] GL init failed:', message);
        if (!mounted.current) return;
        setLoading(false);
        setFailed(message);
        onError?.(message);
      }
    },
    [uri, grade, onReady, onError]
  );

  // Push uniforms on every grade change — this is the cheap path (no I/O).
  useEffect(() => {
    if (!rendererRef.current) return;
    try {
      rendererRef.current.render(grade);
    } catch (error) {
      console.warn('[preview-editor] Render failed:', error);
    }
  }, [grade]);

  // Re-upload the texture when the photo itself changes (e.g. after a rotation bake).
  useEffect(() => {
    let cancelled = false;
    const renderer = rendererRef.current;
    if (!renderer) return;
    setLoading(true);
    void (async () => {
      try {
        await renderer.loadAsset(uri);
        renderer.render(grade);
      } catch (error) {
        if (!cancelled) {
          setFailed(error instanceof Error ? error.message : 'Hindi ma-load ang litrato.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  if (failed) {
    return (
      <View
        style={[
          styles.fallback,
          { backgroundColor: colors.surface, borderRadius: radius.lg },
          style,
        ]}
      >
        <Text style={[fonts.caption, { color: colors.textSecondary, textAlign: 'center' }]}>
          Hindi available ang live GPU preview sa device na ito.
          {'\n'}Gagana pa rin ang filter — ma-a-apply ito pag-save.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { aspectRatio, borderRadius: radius.lg }, style]}>
      <GLView style={StyleSheet.absoluteFill} onContextCreate={handleContext} />
      {loading && (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallback: {
    width: '100%',
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});