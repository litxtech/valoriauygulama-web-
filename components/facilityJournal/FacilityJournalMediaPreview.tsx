import { useState } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import { facilityJournalPreviewUri } from '@/lib/facilityJournalListUi';
import type { FacilityJournalMediaRow } from '@/lib/facilityJournal';

type Props = {
  media: Pick<FacilityJournalMediaRow, 'public_url' | 'media_type' | 'thumbnail_url' | 'id' | 'record_id' | 'sort_order'>;
  style?: StyleProp<ViewStyle>;
  recyclingKey?: string;
  /** Poster yoksa videodan tek kare (liste performansı için kapakta açık). */
  allowVideoFrameFallback?: boolean;
};

/**
 * Eşya kullanım medyası önizlemesi: fotoğraf URL veya video posteri; gerekirse duraklatılmış video karesi.
 */
export function FacilityJournalMediaPreview({
  media,
  style,
  recyclingKey,
  allowVideoFrameFallback = false,
}: Props) {
  const poster = facilityJournalPreviewUri(media as FacilityJournalMediaRow);
  const videoUri = (media.public_url ?? '').trim();
  const isVideo = media.media_type === 'video';
  const [posterFailed, setPosterFailed] = useState(false);

  if (!isVideo) {
    if (poster) {
      return (
        <CachedImage
          uri={poster}
          style={style}
          contentFit="cover"
          recyclingKey={recyclingKey ?? poster}
        />
      );
    }
    return (
      <View style={[style, styles.placeholder]}>
        <Ionicons name="image-outline" size={32} color="#94a3b8" />
      </View>
    );
  }

  if (poster && !posterFailed) {
    return (
      <CachedImage
        uri={poster}
        style={style}
        contentFit="cover"
        priority="high"
        recyclingKey={recyclingKey ?? poster}
        onError={() => setPosterFailed(true)}
      />
    );
  }

  if (allowVideoFrameFallback && videoUri.length > 4) {
    return (
      <Video
        source={{ uri: videoUri }}
        style={style}
        resizeMode={ResizeMode.COVER}
        shouldPlay={false}
        isMuted
        isLooping={false}
        useNativeControls={false}
      />
    );
  }

  return (
    <View style={[style, styles.placeholder]}>
      <Ionicons name="videocam-outline" size={32} color="#94a3b8" />
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
  },
});
