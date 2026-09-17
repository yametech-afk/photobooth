/**
 * CameraScreen — reference implementation wiring the whole module together.
 * Drop-in replacement for the mobile core's `Camera` placeholder
 * (route already registered in RootNavigator as 'Camera').
 *
 * Flow: permission -> preview (front/back toggle) -> filter select (premium
 * locks -> paywall) -> single/burst capture -> hand off to PhotoPreview
 * (upload happens there via UploadHandoff, per INTEGRATION_CHECKLIST §3).
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, type CameraViewHandle } from '../components/CameraView';
import { FilterPicker } from '../components/FilterPicker';
import { useCameraPermission } from '../hooks/useCameraPermission';
import { useCameraDirection } from '../hooks/useCameraDirection';
import { usePhotoCapture } from '../hooks/usePhotoCapture';
import { useFilterSelection } from '../hooks/useFilterSelection';
import { BURST_DEFAULT_COUNT } from '../constants';
import type {
  BurstProgress,
  CapturedPhoto,
  CaptureMode,
  PremiumFilterGate,
} from '../types';

interface CameraScreenProps {
  /** Real gate from createMonetizationGate(...) — fail-closed if omitted. */
  premiumGate?: PremiumFilterGate;
  onCaptureComplete: (mode: CaptureMode, photos: CapturedPhoto[]) => void;
  onCancel: () => void;
}

export function CameraScreen({ premiumGate, onCaptureComplete, onCancel }: CameraScreenProps) {
  const { status, request } = useCameraPermission();
  const { position, toggle } = useCameraDirection('front');
  const [burstMode, setBurstMode] = useState(false);

  // Lifted filter selection so the screen knows the active filterId per shot.
  const {
    catalog,
    selectedId: filterId,
    selectFilter,
    isFilterLocked,
  } = useFilterSelection(premiumGate);

  const handleRef = useRef(onCaptureComplete);
  handleRef.current = onCaptureComplete;

  const { cameraRef, isCapturing, burstProgress, captureSingle, captureBurst, cancelBurst } =
    usePhotoCapture({
      onComplete: (mode, photos) => handleRef.current(mode, photos),
      onError: (err) => Alert.alert('Camera error', err.message),
    });

  const handleCapture = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (burstMode) void captureBurst(filterId, { count: BURST_DEFAULT_COUNT });
    else void captureSingle(filterId);
  }, [burstMode, captureBurst, captureSingle, filterId]);

  const progress: BurstProgress | null = burstProgress;

  if (status === 'undetermined') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#FF4DA6" />
      </View>
    );
  }

  if (status === 'denied') {
    return (
      <View style={styles.centered}>
        <Text style={styles.deniedText}>Kailangan ng pahintulot sa camera.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => void request()}>
          <Text style={styles.retryText}>Bigyan ng pahintulot</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} position={position}>
        <View style={styles.overlay} pointerEvents="box-none">
          {/* Top bar */}
          <View style={styles.topBar} pointerEvents="auto">
            <TouchableOpacity onPress={onCancel}>
              <Ionicons name="close" size={30} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.title}>Photobooth</Text>
            <TouchableOpacity onPress={toggle}>
              <Ionicons name="camera-reverse" size={30} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Burst progress */}
          {progress && (
            <View style={styles.progressBadge} pointerEvents="none">
              <Text style={styles.progressText}>
                Burst {progress.index}/{progress.total}
              </Text>
            </View>
          )}

          <FilterPicker
            catalog={catalog}
            selectedId={filterId}
            onSelectFilter={selectFilter}
            isFilterLocked={isFilterLocked}
          />

          {/* Bottom controls */}
          <View style={styles.bottomControls} pointerEvents="auto">
            <TouchableOpacity
              style={styles.sideButton}
              onPress={() => setBurstMode((b) => !b)}
              disabled={isCapturing}
            >
              <Ionicons
                name={burstMode ? 'grid' : 'camera'}
                size={26}
                color={burstMode ? '#FF4DA6' : '#fff'}
              />
              <Text style={styles.sideLabel}>{burstMode ? '4-Burst' : 'Single'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.captureButton}
              onPress={isCapturing ? cancelBurst : handleCapture}
            >
              <View style={styles.captureInner}>
                {isCapturing && !progress && <ActivityIndicator color="#FF4DA6" />}
                {progress && <Ionicons name="stop" size={26} color="#FF4DA6" />}
              </View>
            </TouchableOpacity>

            <View style={styles.sideButton}>
              <Ionicons name="sparkles" size={26} color="#fff" />
              <Text style={styles.sideLabel}>AR soon</Text>
            </View>
          </View>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: '#0A0A1F' },
  deniedText: { color: '#fff', fontSize: 16 },
  retryButton: { backgroundColor: '#FF4DA6', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  retryText: { color: '#fff', fontWeight: '700' },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 20,
  },
  title: { color: '#fff', fontSize: 17, fontWeight: '700' },
  progressBadge: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  progressText: { color: '#fff', fontSize: 13 },
  bottomControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: 40,
  },
  sideButton: { alignItems: 'center', gap: 4, width: 80 },
  sideLabel: { color: '#fff', fontSize: 11 },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
