import { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import { FeedVideoCardPreview } from '@/components/FeedVideoCardPreview';
import { FastPress } from '@/components/ui/FastPress';

export type FeedMediaItem = {
  id?: string;
  media_type: 'image' | 'video';
  media_url: string;
  thumbnail_url?: string | null;
};

type Props = {
  items: FeedMediaItem[];
  width: number;
  height: number;
  onPressItem?: (item: FeedMediaItem) => void;
  /** Eski API: video artık poster ile anında hazır; detay sayfası overlay’i için hemen çağrılır. */
  onFirstVideoReady?: () => void;
  /** @deprecated Her zaman poster kullanılır; tam video decode edilmez. */
  videoPosterOnly?: boolean;
};

export function FeedMediaCarousel({
  items,
  width,
  height,
  onPressItem,
  onFirstVideoReady,
}: Props) {
  const safeItems = useMemo(() => items.filter((x) => !!x.media_url), [items]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!onFirstVideoReady) return;
    if (safeItems.some((i) => i.media_type === 'video')) onFirstVideoReady();
  }, [onFirstVideoReady, safeItems]);

  if (safeItems.length === 0) return null;

  return (
    <View style={[styles.wrap, { width, height }]}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onMomentumScrollEnd={(e) => {
          const x = e.nativeEvent.contentOffset.x;
          const idx = Math.round(x / Math.max(1, width));
          setActiveIndex(Math.max(0, Math.min(safeItems.length - 1, idx)));
        }}
      >
        {safeItems.map((item, idx) => (
          <FastPress
            key={item.id ?? `${item.media_url}-${idx}`}
            activeOpacity={0.92}
            style={{ width, height }}
            onPress={() => onPressItem?.(item)}
            rippleColor="rgba(255,255,255,0.12)"
          >
            {item.media_type === 'video' ? (
              <View style={[styles.mediaClip, { width, height }]}>
                <FeedVideoCardPreview
                  item={item}
                  allowVideoFrameFallback={idx === activeIndex}
                />
                <View style={styles.playOverlay} pointerEvents="none">
                  <Ionicons name="play-circle" size={52} color="rgba(255,255,255,0.92)" />
                </View>
              </View>
            ) : (
              <CachedImage
                uri={item.thumbnail_url || item.media_url}
                style={{ width, height }}
                contentFit="cover"
                priority="high"
                recyclingKey={item.id ?? item.media_url}
              />
            )}
          </FastPress>
        ))}
      </ScrollView>
      {safeItems.length > 1 ? (
        <View style={styles.multiBadge}>
          <Ionicons name="copy-outline" size={12} color="#fff" />
          <Text style={styles.multiBadgeText}>{safeItems.length}</Text>
        </View>
      ) : null}
      {safeItems.length > 1 ? (
        <View style={styles.dots}>
          {safeItems.map((item, idx) => (
            <View
              key={(item.id ?? idx).toString()}
              style={[styles.dot, idx === activeIndex && styles.dotActive]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', overflow: 'hidden' },
  mediaClip: {
    overflow: 'hidden',
    backgroundColor: '#0a0a0a',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  multiBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  multiBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  dots: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.65)',
  },
  dotActive: {
    width: 16,
    borderRadius: 6,
    backgroundColor: '#fff',
  },
});
