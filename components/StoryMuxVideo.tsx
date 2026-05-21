import { useMemo, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Video, ResizeMode, type AVPlaybackStatus } from 'expo-av';
import { CachedImage } from '@/components/CachedImage';
import {
  getMuxHlsPlaybackUrl,
  getMuxThumbnailFromMessage,
  isMuxPendingMediaUrl,
} from '@/lib/muxChat';

type Props = {
  mediaUrl: string;
  thumbnailUrl?: string | null;
  style?: StyleProp<ViewStyle>;
  shouldPlay?: boolean;
  resizeMode?: ResizeMode;
  useNativeControls?: boolean;
  isLooping?: boolean;
  isMuted?: boolean;
  onLoad?: () => void;
  videoRef?: React.Ref<Video>;
};

/** Story oynatıcı: Mux HLS + eski Supabase mp4 URL uyumu. */
export function StoryMuxVideo({
  mediaUrl,
  thumbnailUrl,
  style,
  shouldPlay = true,
  resizeMode = ResizeMode.COVER,
  useNativeControls = false,
  isLooping = false,
  isMuted = false,
  onLoad,
  videoRef,
}: Props) {
  const [ready, setReady] = useState(false);
  const hls = getMuxHlsPlaybackUrl(mediaUrl);
  const pending = isMuxPendingMediaUrl(mediaUrl);
  const playbackUri = useMemo(() => {
    if (hls) return hls;
    if (!pending && mediaUrl && !mediaUrl.startsWith('mux://')) return mediaUrl;
    return null;
  }, [hls, pending, mediaUrl]);

  const poster =
    (thumbnailUrl ?? '').trim() ||
    getMuxThumbnailFromMessage(mediaUrl, thumbnailUrl) ||
    null;

  const handleStatus = (status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      setReady(true);
      onLoad?.();
    }
  };

  if (!playbackUri) {
    return (
      <View style={[styles.wrap, style]}>
        {poster ? (
          <CachedImage uri={poster} style={StyleSheet.absoluteFillObject} contentFit="cover" />
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color="#fff" size="large" />
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.wrap, style]}>
      <Video
        ref={videoRef}
        source={{ uri: playbackUri }}
        style={StyleSheet.absoluteFillObject}
        resizeMode={resizeMode}
        shouldPlay={shouldPlay}
        isLooping={isLooping}
        isMuted={isMuted}
        useNativeControls={useNativeControls}
        onPlaybackStatusUpdate={handleStatus}
      />
      {poster && !ready ? (
        <CachedImage uri={poster} style={[StyleSheet.absoluteFillObject, styles.poster]} contentFit="cover" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  poster: {
    backgroundColor: '#000',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
