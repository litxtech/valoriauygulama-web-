import { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

type Props = {
  text: string | null | undefined;
  videoUrl: string | null | undefined;
};

export function TechAssetUsageGuide({ text, videoUrl }: Props) {
  const { t } = useTranslation();
  const videoRef = useRef<Video>(null);
  const [videoReady, setVideoReady] = useState(false);
  const body = text?.trim() ?? '';
  const url = videoUrl?.trim() ?? '';

  if (!body && !url) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Ionicons name="school-outline" size={22} color="#1a365d" />
        <Text style={styles.title}>{t('techUsageGuideTitle')}</Text>
      </View>

      {url ? (
        <View style={styles.videoBox}>
          <Video
            ref={videoRef}
            source={{ uri: url }}
            style={styles.video}
            resizeMode={ResizeMode.CONTAIN}
            useNativeControls
            shouldPlay={false}
            isLooping={false}
            onLoad={() => setVideoReady(true)}
          />
          {!videoReady ? (
            <View style={styles.videoLoading}>
              <ActivityIndicator color="#1a365d" />
            </View>
          ) : null}
        </View>
      ) : null}

      {body ? <Text style={styles.body}>{body}</Text> : null}

      {url ? (
        <TouchableOpacity
          style={styles.fullscreenHint}
          onPress={() => videoRef.current?.presentFullscreenPlayer?.()}
          accessibilityRole="button"
          accessibilityLabel={t('techUsageGuideFullscreen')}
        >
          <Ionicons name="expand-outline" size={18} color="#1a365d" />
          <Text style={styles.fullscreenHintText}>{t('techUsageGuideFullscreen')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 18,
    backgroundColor: '#eff6ff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '800', color: '#1a365d' },
  videoBox: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    marginBottom: 12,
  },
  video: { width: '100%', height: '100%' },
  videoLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.4)',
  },
  body: { fontSize: 15, color: '#1e293b', lineHeight: 22 },
  fullscreenHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  fullscreenHintText: { fontSize: 13, fontWeight: '700', color: '#1a365d' },
});
