import { useMemo } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import { FeedVideoCardPreview } from '@/components/FeedVideoCardPreview';
import { FastPress } from '@/components/ui/FastPress';
import type { FeedMediaItem } from '@/components/FeedMediaCarousel';
import {
  FEED_POST_MEDIA_HEIGHT_RATIO,
  FEED_VIDEO_MEDIA_HEIGHT_RATIO,
} from '@/constants/personelDesignSystem';
import { usePersonelDesign } from '@/hooks/usePersonelDesign';

const GAP = 2;
/** Tam genişlik medya — köşe yuvarlaklığı kart overflow keser */
const MEDIA_RADIUS = 0;

type Props = {
  items: FeedMediaItem[];
  width: number;
  onPressItem?: (item: FeedMediaItem) => void;
};

function gridHeight(width: number, count: number, hasVideoSingle = false): number {
  if (count <= 1) {
    // Tek video: 16:9; tek foto: 4:5 (büyük)
    return Math.round(width * (hasVideoSingle ? FEED_VIDEO_MEDIA_HEIGHT_RATIO : FEED_POST_MEDIA_HEIGHT_RATIO));
  }
  if (count === 2) return Math.round(width * 0.62);
  if (count === 3) return Math.round(width * 0.78);
  return Math.round(width * 0.78);
}

function MediaCell({
  item,
  w,
  h,
  onPress,
  round,
}: {
  item: FeedMediaItem;
  w: number;
  h: number;
  onPress?: () => void;
  /** Tek hücrede tam radius; grid’de dış wrap keser */
  round?: boolean;
}) {
  const isVideo = item.media_type === 'video';
  return (
    <FastPress
      activeOpacity={0.92}
      style={[styles.cell, { width: w, height: h }, round && styles.cellRound]}
      onPress={onPress}
      rippleColor="rgba(255,255,255,0.12)"
    >
      {isVideo ? (
        <View style={[styles.clip, { width: w, height: h }]}>
          <FeedVideoCardPreview item={item} allowVideoFrameFallback />
          <View style={styles.playOverlay} pointerEvents="none">
            <View style={styles.playCircle}>
              <Ionicons name="play" size={22} color="#fff" style={styles.playIcon} />
            </View>
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
  const palette = usePersonelDesign();
  const safeItems = useMemo(() => items.filter((x) => !!x.media_url), [items]);
  if (safeItems.length === 0) return null;

  const singleVideo = safeItems.length === 1 && safeItems[0]!.media_type === 'video';
  const height = gridHeight(width, safeItems.length, singleVideo);
  const frameStyle = [styles.wrap, { width, height, borderColor: palette.cardBorder }];

  if (safeItems.length === 1) {
    const item = safeItems[0]!;
    return (
      <View style={frameStyle}>
        <MediaCell item={item} w={width} h={height} round onPress={() => onPressItem?.(item)} />
      </View>
    );
  }

  if (safeItems.length === 2) {
    const cellW = (width - GAP) / 2;
    return (
      <View style={[frameStyle, styles.row]}>
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
      <View style={[frameStyle, styles.row]}>
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
    <View style={frameStyle}>
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

/** Yükseklik: sayı veya medya listesi (tek video → 16:9). */
export function feedPostMediaGridHeight(
  width: number,
  itemCountOrItems: number | { media_type: string }[]
): number {
  if (typeof itemCountOrItems === 'number') {
    return gridHeight(width, Math.max(1, itemCountOrItems), false);
  }
  const items = itemCountOrItems;
  const count = Math.max(1, items.length);
  const singleVideo = items.length === 1 && items[0]?.media_type === 'video';
  return gridHeight(width, count, singleVideo);
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    borderRadius: MEDIA_RADIUS,
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: { flexDirection: 'row', gap: GAP },
  grid2x2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  cell: { overflow: 'hidden', backgroundColor: '#000' },
  cellRound: { borderRadius: MEDIA_RADIUS },
  clip: { overflow: 'hidden', backgroundColor: '#000' },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: { marginLeft: 3 },
  moreOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  moreText: { color: '#fff', fontSize: 22, fontWeight: '800' },
});
