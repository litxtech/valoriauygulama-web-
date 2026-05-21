import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import type { FeedMediaItem } from '@/components/FeedMediaCarousel';

function resolvePosterUri(item: FeedMediaItem): string | null {
  const thumb = (item.thumbnail_url ?? '').trim();
  if (thumb.length > 4) return thumb;
  const url = (item.media_url ?? '').trim();
  if (/\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(url)) return url;
  return null;
}

type Props = {
  item: FeedMediaItem;
  /** Poster yoksa yalnızca aktif slaytta video karesi decode et (liste performansı). */
  allowVideoFrameFallback: boolean;
};

/**
 * Feed kartı video önizlemesi: önce JPEG poster, yoksa duraklatılmış video karesi.
 */
export function FeedVideoCardPreview({ item, allowVideoFrameFallback }: Props) {
  const poster = resolvePosterUri(item);
  const videoUri = (item.media_url ?? '').trim();
  const [posterFailed, setPosterFailed] = useState(false);

  if (poster && !posterFailed) {
    return (
      <CachedImage
        uri={poster}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
        priority="high"
        recyclingKey={item.id ?? poster}
        onError={() => setPosterFailed(true)}
      />
    );
  }

  if (allowVideoFrameFallback && videoUri.length > 4) {
    return (
      <Video
        source={{ uri: videoUri }}
        style={StyleSheet.absoluteFillObject}
        resizeMode={ResizeMode.COVER}
        shouldPlay={false}
        isMuted
        isLooping={false}
        useNativeControls={false}
      />
    );
  }

  return (
    <View style={[StyleSheet.absoluteFillObject, styles.placeholder]}>
      <Ionicons name="videocam-outline" size={44} color="rgba(255,255,255,0.55)" />
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1c1c22',
  },
});
