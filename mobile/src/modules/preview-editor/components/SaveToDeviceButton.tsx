/**
 * Save-to-device button.
 *
 * Renders three distinct states so the camera-roll prompt is never a surprise:
 *   ready      -> normal save
 *   undetermined -> "Payagan" (fires the OS dialog)
 *   denied     -> "Buksan ang Settings" (the OS dialog will not show again)
 */
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../theme/ThemeContext';
import { permissionCopy, useMediaPermission } from '../hooks/useMediaPermission';
import { saveLocalFileToDevice, saveRemoteFileToDevice } from '../services/mediaLibrary';

type Props = {
  /** Local file to save, preferred when available. */
  localUri?: string | null;
  /** Remote url fallback (gallery flow). */
  remoteUrl?: string | null;
  onSaved?: (assetUri: string, album: string | null) => void;
  onError?: (message: string) => void;
  compact?: boolean;
  fileName?: string;
};

export default function SaveToDeviceButton({
  localUri,
  remoteUrl,
  onSaved,
  onError,
  compact = false,
  fileName,
}: Props) {
  const { colors, fonts, spacing, radius } = useTheme();
  const permission = useMediaPermission();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const copy = permissionCopy(permission.status);

  const handle = async () => {
    if (copy && permission.status === 'denied') {
      await permission.openSettings();
      return;
    }

    const granted = await permission.ensure();
    if (!granted) {
      onError?.('Hindi pinayagan ang photo library access.');
      return;
    }

    setBusy(true);
    try {
      const result = localUri
        ? await saveLocalFileToDevice(localUri)
        : remoteUrl
        ? await saveRemoteFileToDevice(remoteUrl, fileName)
        : null;

      if (!result) {
        throw new Error('Walang file na ma-save.');
      }
      setSaved(true);
      onSaved?.(result.assetUri, result.album);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Hindi na-save sa device.';
      onError?.(message);
      Alert.alert('Save failed', message);
    } finally {
      setBusy(false);
    }
  };

  const label = saved
    ? 'Naka-save na'
    : busy
    ? 'Sine-save…'
    : copy
    ? copy.action
    : 'I-save sa device';

  const icon = saved
    ? 'checkmark-circle'
    : busy
    ? 'cloud-download-outline'
    : copy
    ? copy.action === 'Buksan ang Settings'
      ? 'settings-outline'
      : 'lock-open-outline'
    : 'download-outline';

  return (
    <View>
      <Pressable
        onPress={handle}
        disabled={busy || permission.checking}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[
          compact ? styles.compact : styles.button,
          {
            backgroundColor: saved ? 'rgba(0,230,118,0.16)' : colors.surface,
            borderRadius: compact ? radius.round : radius.lg,
            borderColor: saved ? colors.success : 'transparent',
            borderWidth: 1,
          },
        ]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Ionicons name={icon as never} size={compact ? 18 : 20} color={saved ? colors.success : colors.primary} />
        )}
        <Text
          style={[
            compact ? fonts.caption : fonts.body,
            { color: saved ? colors.success : colors.text, marginLeft: spacing.sm },
          ]}
        >
          {label}
        </Text>
      </Pressable>

      {copy && !compact && (
        <Text style={[fonts.caption, { color: colors.textSecondary, marginTop: spacing.xs, maxWidth: 260 }]}>
          {copy.body}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
});