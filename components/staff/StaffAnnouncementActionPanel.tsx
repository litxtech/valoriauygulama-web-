import { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { isDirectVideoUrl, videoEmbedHtml } from '@/lib/staffNotificationActions';

type Props = {
  title?: string | null;
  body?: string | null;
  videoUrl?: string | null;
  videoTitle?: string | null;
  openScreen?: string | null;
  actionLabel?: string | null;
  onOpenScreen?: (href: string) => void;
  compact?: boolean;
};

export function StaffAnnouncementActionPanel({
  title,
  body,
  videoUrl,
  videoTitle,
  openScreen,
  actionLabel,
  onOpenScreen,
  compact = false,
}: Props) {
  const trimmedVideo = videoUrl?.trim() || '';
  const trimmedScreen = openScreen?.trim() || '';
  const embedHtml = useMemo(() => (trimmedVideo ? videoEmbedHtml(trimmedVideo) : null), [trimmedVideo]);
  const directVideo = trimmedVideo && isDirectVideoUrl(trimmedVideo);

  const openExternalVideo = () => {
    if (!trimmedVideo) return;
    if (Platform.OS === 'web') window.open(trimmedVideo, '_blank');
    else void Linking.openURL(trimmedVideo);
  };

  const handleOpenScreen = () => {
    if (!trimmedScreen || !onOpenScreen) return;
    onOpenScreen(trimmedScreen);
  };

  if (!trimmedVideo && !trimmedScreen) return null;

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {!compact && title?.trim() ? <Text style={styles.title}>{title.trim()}</Text> : null}
      {!compact && body?.trim() ? <Text style={styles.body}>{body.trim()}</Text> : null}

      {trimmedVideo ? (
        <View style={styles.videoBlock}>
          {videoTitle?.trim() ? <Text style={styles.videoTitle}>{videoTitle.trim()}</Text> : null}
          {embedHtml ? (
            <View style={styles.videoFrame}>
              <WebView
                source={{ html: embedHtml }}
                style={styles.webView}
                allowsFullscreenVideo
                mediaPlaybackRequiresUserAction={false}
                javaScriptEnabled
              />
            </View>
          ) : directVideo ? (
            <Video
              source={{ uri: trimmedVideo }}
              style={styles.videoFrame}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={false}
            />
          ) : (
            <TouchableOpacity style={styles.externalVideoBtn} onPress={openExternalVideo} activeOpacity={0.88}>
              <Ionicons name="play-circle-outline" size={22} color={theme.colors.primary} />
              <Text style={styles.externalVideoText}>Videoyu aç</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      {trimmedScreen && onOpenScreen ? (
        <TouchableOpacity style={styles.ctaBtn} onPress={handleOpenScreen} activeOpacity={0.88}>
          <Ionicons name="open-outline" size={18} color="#fff" />
          <Text style={styles.ctaText}>{actionLabel?.trim() || 'Modülü aç'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, gap: 12 },
  wrapCompact: { marginTop: 8 },
  title: { fontSize: 17, fontWeight: '800', color: '#1a202c' },
  body: { fontSize: 14, color: '#4a5568', lineHeight: 21 },
  videoBlock: { gap: 8 },
  videoTitle: { fontSize: 13, fontWeight: '700', color: '#475569' },
  videoFrame: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
  },
  webView: { flex: 1, backgroundColor: '#000' },
  externalVideoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  externalVideoText: { fontSize: 15, fontWeight: '700', color: theme.colors.primary },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
  },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
