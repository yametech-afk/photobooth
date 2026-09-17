/**
 * Share sheet.
 *
 * Local share (native sheet + file uri) and link share (revocable server token) sit
 * side by side because they fail differently: the file path works offline but lands
 * in the target app's inbox; the link works anywhere but depends on the network and
 * on the photo already being uploaded.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../theme/ThemeContext';
import { LIMITS } from '../constants';
import { copyToClipboard, createShareLink, revokeShareLink, shareFileNatively } from '../services/shareService';
import { formatRelativeTime } from '../utils/format';
import type { ShareChannel, ShareResult } from '../types';

type Props = {
  visible: boolean;
  photoId: string | null;
  /** Local file uri — when present the "I-share ang file" row is enabled. */
  localUri?: string | null;
  /** Server-side upload state; link sharing needs a finalized photo. */
  isUploaded: boolean;
  caption?: string | null;
  sessionId: string;
  onClose: () => void;
  /** Called when a link is minted so the parent can offer a revoke action. */
  onLinkCreated?: (share: ShareResult) => void;
  onError?: (message: string) => void;
}

const CHANNELS: { id: ShareChannel; label: string; icon: string; fileFirst: boolean }[] = [
  { id: 'instagram', label: 'Instagram', icon: 'logo-instagram', fileFirst: true },
  { id: 'tiktok', label: 'TikTok', icon: 'musical-notes-outline', fileFirst: true },
  { id: 'facebook', label: 'Facebook', icon: 'logo-facebook', fileFirst: true },
  { id: 'email', label: 'Email', icon: 'mail-outline', fileFirst: false },
  { id: 'qr', label: 'QR / link', icon: 'qr-code-outline', fileFirst: false },
];

export default function ShareSheet({
  visible,
  photoId,
  localUri,
  isUploaded,
  caption,
  sessionId,
  onClose,
  onLinkCreated,
  onError,
}: Props) {
  const { colors, fonts, spacing, radius } = useTheme();
  const [busy, setBusy] = useState<ShareChannel | 'file' | null>(null);
  const [longLived, setLongLived] = useState(false);
  const [activeLink, setActiveLink] = useState<ShareResult | null>(null);

  const fail = (error: unknown) => {
    const message = error instanceof Error ? error.message : 'Nabigo ang pag-share.';
    onError?.(message);
  };

  const run = async (channel: ShareChannel) => {
    if (!photoId) return;
    setBusy(channel);
    try {
      if (channel === 'qr' || channel === 'email' || !localUri) {
        const share = await createShareLink({
          photoId,
          channel,
          ttlHours: longLived ? LIMITS.shareTtlHours.max : LIMITS.shareTtlHours.default,
          sessionId,
        });
        setActiveLink(share);
        onLinkCreated?.(share);
      } else {
        await shareFileNatively({
          fileUri: localUri,
          message: caption ?? 'Gawa sa Photobooth 📸',
          fileName: `photobooth-${Date.now()}.jpg`,
        });
        // Still mint a link so the receiving app / user can grab a copy later.
        const share = await createShareLink({ photoId, channel, sessionId });
        setActiveLink(share);
        onLinkCreated?.(share);
      }
      onClose();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
    }
  };

  const shareNativeOnly = async () => {
    if (!localUri) {
      onError?.('Kailangan munang ma-upload ang litrato bago ito ma-share bilang file.');
      return;
    }
    setBusy('file');
    try {
      await shareFileNatively({
        fileUri: localUri,
        message: caption ?? 'Gawa sa Photobooth 📸',
        fileName: `photobooth-${Date.now()}.jpg`,
      });
      onClose();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
    }
  };

  const revoke = async () => {
    if (!activeLink) return;
    try {
      await revokeShareLink(activeLink.shareId);
      setActiveLink(null);
    } catch (error) {
      fail(error);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Isara ang share options" />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.background,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
          },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.card }]} />
        <Text style={[fonts.subheading, { color: colors.text, marginTop: spacing.md }]}>
          I-share ang litrato
        </Text>
        <Text style={[fonts.caption, { color: colors.textSecondary, marginTop: 4 }]}>
          {isUploaded
            ? 'Puwede ang file share at revocable link.'
            : 'Hindi pa naka-upload — file share lang ang available ngayon.'}
        </Text>

        <ScrollView contentContainerStyle={{ paddingVertical: spacing.lg }}>
          <Pressable
            onPress={shareNativeOnly}
            disabled={busy !== null}
            accessibilityRole="button"
            style={[styles.row, { backgroundColor: colors.surface, borderRadius: radius.md }]}
          >
            <Ionicons name="share-outline" size={22} color={colors.primary} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[fonts.body, { color: colors.text }]}>Buksan ang share sheet</Text>
              <Text style={[fonts.caption, { color: colors.textSecondary }]}>
                Anumang app na naka-install — offline-safe
              </Text>
            </View>
            {busy === 'file' ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />}
          </Pressable>

          {CHANNELS.map((channel) => {
            const disabled = channel.fileFirst ? !isUploaded : !isUploaded;
            return (
              <Pressable
                key={channel.id}
                onPress={() => run(channel.id)}
                disabled={disabled || busy !== null}
                accessibilityRole="button"
                accessibilityState={{ disabled }}
                style={[
                  styles.row,
                  {
                    backgroundColor: colors.surface,
                    borderRadius: radius.md,
                    opacity: disabled ? 0.45 : 1,
                  },
                ]}
              >
                <Ionicons name={channel.icon as never} size={22} color={colors.text} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[fonts.body, { color: colors.text }]}>{channel.label}</Text>
                  <Text style={[fonts.caption, { color: colors.textSecondary }]}>
                    {channel.id === 'qr' ? 'Revocable link + QR code' : 'May kasamang share link'}
                  </Text>
                </View>
                {busy === channel.id ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                )}
              </Pressable>
            );
          })}

          <View style={[styles.switchRow, { backgroundColor: colors.surface, borderRadius: radius.md }]}>
            <View style={{ flex: 1 }}>
              <Text style={[fonts.body, { color: colors.text }]}>Haba ng link</Text>
              <Text style={[fonts.caption, { color: colors.textSecondary }]}>
                {longLived ? `14 araw (${LIMITS.shareTtlHours.max}h)` : `3 araw (${LIMITS.shareTtlHours.default}h)`}
              </Text>
            </View>
            <Switch
              value={longLived}
              onValueChange={setLongLived}
              trackColor={{ false: colors.card, true: colors.secondary }}
              thumbColor={colors.text}
            />
          </View>

          {activeLink && (
            <View style={[styles.linkBox, { backgroundColor: colors.card, borderRadius: radius.md }]}>
              <Text style={[fonts.caption, { color: colors.textSecondary }]}>Aktibong link</Text>
              <Text style={[fonts.caption, { color: colors.text }]} numberOfLines={1}>
                {activeLink.url}
              </Text>
              <Text style={[fonts.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                Mag-e-expire {formatRelativeTime(new Date(activeLink.expiresAt).getTime())}
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: spacing.sm }}>
                <Pressable
                  onPress={() => void copyToClipboard(activeLink.url)}
                  accessibilityRole="button"
                  style={[styles.smallButton, { backgroundColor: colors.secondary, borderRadius: radius.round }]}
                >
                  <Ionicons name="copy-outline" size={14} color="#0A0A1F" />
                  <Text style={[fonts.caption, { color: '#0A0A1F', marginLeft: 4 }]}>Kopyahin</Text>
                </Pressable>
                <Pressable
                  onPress={revoke}
                  accessibilityRole="button"
                  style={[styles.smallButton, { backgroundColor: colors.surface, borderRadius: radius.round }]}
                >
                  <Ionicons name="close-circle-outline" size={14} color={colors.error} />
                  <Text style={[fonts.caption, { color: colors.error, marginLeft: 4 }]}>I-revoke</Text>
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { maxHeight: '80%', paddingHorizontal: 24, paddingBottom: 28 },
  handle: { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, marginTop: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginBottom: 10,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginBottom: 10,
  },
  linkBox: { padding: 14 },
  smallButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12 },
});