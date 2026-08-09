import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Modal,
  FlatList,
  Platform,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { Video, ResizeMode, type AVPlaybackStatus } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { BookingHotelShowcaseItem } from '@/lib/onlineBooking';
import { trackBookingEvent } from '@/lib/onlineBooking';

type Props = {
  items: BookingHotelShowcaseItem[];
};

/** Rezervasyon: Oteli gezelim — sayfa girince video bir kez oynar, bitince durur */
export function BookingHotelExplore({ items }: Props) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const wide = width >= 768;
  const [open, setOpen] = useState(false);
  const [startIndex, setStartIndex] = useState(0);

  if (!items.length) return null;

  const peek = items.slice(0, wide ? 6 : 5);
  const thumbW = wide ? 200 : 148;
  const thumbH = wide ? 260 : 196;

  const openAt = (idx: number) => {
    setStartIndex(idx);
    setOpen(true);
    void trackBookingEvent('hotel_showcase_open', { meta: { index: idx, count: items.length } });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>{t('bookingExploreKicker')}</Text>
          <Text style={styles.title}>{t('bookingExploreTitle')}</Text>
          <Text style={styles.hint}>{t('bookingExploreHint', { count: items.length })}</Text>
        </View>
        <TouchableOpacity style={styles.openChip} onPress={() => openAt(0)} activeOpacity={0.9}>
          <Ionicons name="expand-outline" size={15} color="#fff" />
          <Text style={styles.openChipText}>{t('bookingExploreOpen')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        decelerationRate="fast"
      >
        {peek.map((item, i) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.thumb, { width: thumbW, height: thumbH }]}
            onPress={() => openAt(i)}
            activeOpacity={0.92}
          >
            <ShowcaseThumb item={item} autoPlay />
            <LinearGradient
              colors={['transparent', 'rgba(15,23,42,0.7)']}
              style={styles.thumbFade}
              pointerEvents="none"
            />
            {item.media_kind === 'video' ? (
              <View style={styles.videoBadge}>
                <Ionicons name="play" size={12} color="#fff" />
              </View>
            ) : null}
            {item.title || item.category ? (
              <Text style={styles.thumbCaption} numberOfLines={2}>
                {item.title || item.category}
              </Text>
            ) : null}
          </TouchableOpacity>
        ))}
        {items.length > peek.length ? (
          <TouchableOpacity
            style={[styles.moreCard, { width: thumbW * 0.7, height: thumbH }]}
            onPress={() => openAt(peek.length)}
            activeOpacity={0.9}
          >
            <Text style={styles.moreCount}>+{items.length - peek.length}</Text>
            <Text style={styles.moreLabel}>{t('bookingExploreMore')}</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      <HotelShowcaseGallery
        visible={open}
        items={items}
        initialIndex={startIndex}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}

/**
 * Sayfa açılınca sessiz oynat; bitince dur (loop yok).
 * Poster varsa altında durur, video üstte bir kez akar.
 */
function ShowcaseThumb({
  item,
  autoPlay = false,
}: {
  item: BookingHotelShowcaseItem;
  autoPlay?: boolean;
}) {
  const videoRef = useRef<Video>(null);
  const [ended, setEnded] = useState(false);
  const poster = item.thumbnail_url?.trim() || null;
  const isVideo = item.media_kind === 'video';

  useEffect(() => {
    if (!isVideo || !autoPlay) return;
    setEnded(false);
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      void videoRef.current?.playAsync().catch(() => undefined);
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
      void videoRef.current?.pauseAsync().catch(() => undefined);
    };
  }, [isVideo, autoPlay, item.media_url]);

  if (!isVideo) {
    return (
      <Image source={{ uri: item.media_url }} style={styles.thumbImg} resizeMode="cover" />
    );
  }

  const onStatus = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    if (status.didJustFinish) {
      setEnded(true);
      void videoRef.current?.pauseAsync().catch(() => undefined);
    }
  };

  return (
    <View style={styles.thumbImg}>
      <View style={styles.videoThumbFallback} />
      {poster ? (
        <Image source={{ uri: poster }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
      ) : null}
      <Video
        ref={videoRef}
        source={{ uri: item.media_url }}
        style={StyleSheet.absoluteFillObject}
        resizeMode={ResizeMode.COVER}
        isMuted
        isLooping={false}
        shouldPlay={autoPlay && !ended}
        useNativeControls={false}
        onPlaybackStatusUpdate={onStatus}
        onLoad={async () => {
          if (!autoPlay || ended) return;
          try {
            await videoRef.current?.setPositionAsync(0);
            await videoRef.current?.playAsync();
          } catch {
            /* ignore */
          }
        }}
      />
      {ended ? (
        <View style={styles.endedOverlay} pointerEvents="none">
          <Ionicons name="play-circle" size={28} color="rgba(255,255,255,0.92)" />
        </View>
      ) : null}
    </View>
  );
}

function HotelShowcaseGallery({
  visible,
  items,
  initialIndex,
  onClose,
}: {
  visible: boolean;
  items: BookingHotelShowcaseItem[];
  initialIndex: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<BookingHotelShowcaseItem>>(null);
  const videoRef = useRef<Video>(null);
  const [index, setIndex] = useState(initialIndex);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!visible) {
      setPlaying(false);
      void videoRef.current?.pauseAsync().catch(() => undefined);
      return;
    }
    setIndex(initialIndex);
    const tmr = setTimeout(() => {
      listRef.current?.scrollToIndex({ index: initialIndex, animated: false });
    }, 40);
    return () => clearTimeout(tmr);
  }, [visible, initialIndex]);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / Math.max(width, 1));
    if (next !== index) {
      setIndex(next);
      setPlaying(false);
      void videoRef.current?.pauseAsync().catch(() => undefined);
    }
  };

  const current = items[index];

  const renderItem = useCallback(
    ({ item, index: i }: { item: BookingHotelShowcaseItem; index: number }) => {
      if (item.media_kind === 'video') {
        const active = i === index;
        return (
          <View style={{ width, height, justifyContent: 'center', backgroundColor: '#000' }}>
            <Video
              ref={active ? videoRef : undefined}
              source={{ uri: item.media_url }}
              style={{ width, height: height * 0.72 }}
              resizeMode={ResizeMode.CONTAIN}
              isLooping={false}
              isMuted={!playing || !active}
              shouldPlay={playing && active}
              useNativeControls={false}
              posterSource={item.thumbnail_url ? { uri: item.thumbnail_url } : undefined}
              usePoster={!!item.thumbnail_url && !(playing && active)}
              onPlaybackStatusUpdate={(status) => {
                if (status.isLoaded && status.didJustFinish && active) {
                  setPlaying(false);
                }
              }}
            />
            <TouchableOpacity
              style={styles.playFab}
              activeOpacity={0.9}
              onPress={async () => {
                if (!active) return;
                if (playing) {
                  await videoRef.current?.pauseAsync();
                  setPlaying(false);
                } else {
                  await videoRef.current?.replayAsync();
                  setPlaying(true);
                }
              }}
            >
              <Ionicons name={playing && active ? 'pause' : 'play'} size={28} color="#fff" />
            </TouchableOpacity>
          </View>
        );
      }
      return (
        <View style={{ width, height, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
          <Image
            source={{ uri: item.media_url }}
            style={{ width, height: height * 0.78 }}
            resizeMode="contain"
          />
        </View>
      );
    },
    [width, height, index, playing]
  );

  if (!items.length) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.galleryRoot}>
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(it) => it.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          initialScrollIndex={Math.min(initialIndex, items.length - 1)}
          onScrollToIndexFailed={({ index: failIdx }) => {
            setTimeout(() => listRef.current?.scrollToIndex({ index: failIdx, animated: false }), 80);
          }}
          renderItem={renderItem}
          windowSize={3}
          maxToRenderPerBatch={3}
          initialNumToRender={2}
        />

        <View style={[styles.galleryTop, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <View style={styles.counter}>
            <Ionicons name="images-outline" size={14} color="rgba(255,255,255,0.9)" />
            <Text style={styles.counterText}>
              {index + 1} / {items.length}
            </Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.85}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={[styles.captionBar, { paddingBottom: insets.bottom + 18 }]}>
          {current?.category ? <Text style={styles.captionCat}>{current.category}</Text> : null}
          {current?.title ? <Text style={styles.captionTitle}>{current.title}</Text> : null}
          <Text style={styles.captionSwipe}>{t('bookingExploreSwipe')}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 28,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerText: { flex: 1, gap: 4 },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: '#0f766e',
  },
  title: { fontSize: 24, fontWeight: '900', color: '#0b1220', letterSpacing: -0.4 },
  hint: { fontSize: 14, fontWeight: '500', color: '#64748b', lineHeight: 20 },
  openChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0f766e',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    marginTop: 4,
  },
  openChipText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  row: { gap: 12, paddingRight: 4 },
  thumb: {
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
  },
  thumbImg: {
    ...StyleSheet.absoluteFillObject,
    ...(Platform.OS === 'web' ? ({ objectFit: 'cover' } as Record<string, string>) : {}),
  },
  videoThumbFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0f172a',
  },
  endedOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.22)',
  },
  thumbFade: { ...StyleSheet.absoluteFillObject },
  videoBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbCaption: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
  moreCard: {
    borderRadius: 22,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  moreCount: { color: '#5eead4', fontSize: 24, fontWeight: '900' },
  moreLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '700' },
  galleryRoot: { flex: 1, backgroundColor: '#000' },
  galleryTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15,23,42,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  counterText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playFab: {
    position: 'absolute',
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    gap: 4,
  },
  captionCat: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#5eead4',
  },
  captionTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  captionSwipe: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.65)', marginTop: 4 },
});
