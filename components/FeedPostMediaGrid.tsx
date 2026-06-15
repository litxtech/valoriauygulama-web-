import { useMemo } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import { FeedVideoCardPreview } from '@/components/FeedVideoCardPreview';
import { FastPress } from '@/components/ui/FastPress';
import type { FeedMediaItem } from '@/components/FeedMediaCarousel';

const GAP = 3;

type Props = {
  items: FeedMediaItem[];
  width: number;
  onPressItem?: (item: FeedMediaItem) => void;
};

function gridHeight(width: number, count: number): number {
  if (count <= 1) return Math.round(width * 1.15);
  if (count === 2) return Math.round(width * 0.52);
  if (count === 3) return Math.round(width * 0.72);
  return Math.round(width * 0.72);
}

function MediaCell({
  item,
  w,
  h,
  onPress,
}: {
  item: FeedMediaItem;
  w: number;
  h: number;
  onPress?: () => void;
}) {
  const isVideo = item.media_type === 'video';
  return (
    <FastPress
      activeOpacity={0.92}
      style={{ width: w, height: h }}
      onPress={onPress}
      rippleColor="rgba(255,255,255,0.12)"
    >
      {isVideo ? (
        <View style={[styles.clip, { width: w, height: h }]}>
          <FeedVideoCardPreview item={item} allowVideoFrameFallback />
          <View style={styles.playOverlay} pointerEvents="none">
            <Ionicons name="play" size={28} color="#fff" />
          </View>
        </View>
      ) : (
        <CachedImage
          uri={item.thumbnail_url || item.media_url}
          style={{ width: w, height: h }}
          contentFit="cover"
          priority="high"
          recyclingKey={item.id ?? item.media_url}
        />
      )}
    </FastPress>
  );
}

export function FeedPostMediaGrid({ items, width, onPressItem }: Props) {
  const safeItems = useMemo(() => items.filter((x) => !!x.media_url), [items]);
  if (safeItems.length === 0) return null;

  const height = gridHeight(width, safeItems.length);

  if (safeItems.length === 1) {
    const item = safeItems[0]!;
    return (
      <View style={[styles.wrap, { width, height }]}>
        <MediaCell item={item} w={width} h={height} onPress={() => onPressItem?.(item)} />
      </View>
    );
  }

  if (safeItems.length === 2) {
    const cellW = (width - GAP) / 2;
    return (
      <View style={[styles.wrap, styles.row, { width, height }]}>
        {safeItems.map((item, i) => (
          <MediaCell
            key={item.id ?? i}
            item={item}
            w={cellW}
            h={height}
            onPress={() => onPressItem?.(item)}
          />
        ))}
      </View>
    );
  }

  if (safeItems.length === 3) {
    const leftW = Math.round((width - GAP) * 0.58);
    const rightW = width - GAP - leftW;
    const rightH = (height - GAP) / 2;
    return (
      <View style={[styles.wrap, styles.row, { width, height }]}>
        <MediaCell item={safeItems[0]!} w={leftW} h={height} onPress={() => onPressItem?.(safeItems[0]!)} />
        <View style={{ gap: GAP }}>
          <MediaCell item={safeItems[1]!} w={rightW} h={rightH} onPress={() => onPressItem?.(safeItems[1]!)} />
          <MediaCell item={safeItems[2]!} w={rightW} h={rightH} onPress={() => onPressItem?.(safeItems[2]!)} />
        </View>
      </View>
    );
  }

  const cellW = (width - GAP) / 2;
  const cellH = (height - GAP) / 2;
  const visible = safeItems.slice(0, 4);
  const extra = safeItems.length - 4;

  return (
    <View style={[styles.wrap, { width, height }]}>
      <View style={styles.grid2x2}>
        {visible.map((item, i) => (
          <View key={item.id ?? i} style={{ position: 'relative' }}>
            <MediaCell item={item} w={cellW} h={cellH} onPress={() => onPressItem?.(item)} />
            {i === 3 && extra > 0 ? (
              <View style={[styles.moreOverlay, { width: cellW, height: cellH }]} pointerEvents="none">
                <Text style={styles.moreText}>+{extra}</Text>
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

export function feedPostMediaGridHeight(width: number, itemCount: number): number {
  return gridHeight(width, Math.max(1, itemCount));
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', borderRadius: 12, backgroundColor: '#0f172a' },
  row: { flexDirection: 'row', gap: GAP },
  grid2x2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  clip: { overflow: 'hidden', backgroundColor: '#0a0a0a' },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  moreOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  moreText: { color: '#fff', fontSize: 22, fontWeight: '800' },
});
