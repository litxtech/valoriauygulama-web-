import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  FlatList,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookingMediaLightbox } from '@/components/booking/BookingMediaLightbox';

export type HeroMediaItem =
  | { kind: 'image'; uri: string }
  | { kind: 'video'; uri: string };

type Props = {
  images: string[];
  videoUrl?: string | null;
  title: string;
  subtitle?: string;
  priceLabel?: string;
  onBack?: () => void;
};

export function BookingHeroGallery({
  images,
  videoUrl,
  title,
  subtitle,
  priceLabel,
  onBack,
}: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 768;
  /** Masaüstünde geniş yatay hero; mobilde dikey vitrin */
  const heroH = wide
    ? Math.round(Math.min(Math.max(width * 0.48, 440), 720))
    : Math.round(Math.min(width * 1.05, 520));
  const [index, setIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const videoRef = useRef<Video>(null);

  const items = useMemo<HeroMediaItem[]>(() => {
    const list: HeroMediaItem[] = [];
    if (videoUrl) list.push({ kind: 'video', uri: videoUrl });
    for (const uri of images) {
      if (uri) list.push({ kind: 'image', uri });
    }
    return list;
  }, [images, videoUrl]);

  const imageOnlyUris = useMemo(
    () => items.filter((i) => i.kind === 'image').map((i) => i.uri),
    [items]
  );

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / Math.max(width, 1));
    if (next !== index) {
      setIndex(next);
      if (videoPlaying) {
        void videoRef.current?.pauseAsync();
        setVideoPlaying(false);
      }
    }
  };

  const openLightbox = (item: HeroMediaItem) => {
    if (item.kind !== 'image') return;
    setLightboxOpen(true);
  };

  const lightboxIndex = useMemo(() => {
    const cur = items[index];
    if (!cur || cur.kind !== 'image') return 0;
    const i = imageOnlyUris.indexOf(cur.uri);
    return i >= 0 ? i : 0;
  }, [items, index, imageOnlyUris]);

  const renderItem = useCallback(
    ({ item }: { item: HeroMediaItem }) => {
      if (item.kind === 'video') {
        return (
          <View style={{ width, height: heroH }}>
            <Video
              ref={videoRef}
              source={{ uri: item.uri }}
              style={StyleSheet.absoluteFillObject}
              resizeMode={ResizeMode.COVER}
              isLooping
              isMuted={!videoPlaying}
              shouldPlay={videoPlaying}
              useNativeControls={false}
            />
            <TouchableOpacity
              style={styles.playFab}
              activeOpacity={0.9}
              onPress={async () => {
                if (videoPlaying) {
                  await videoRef.current?.pauseAsync();
                  setVideoPlaying(false);
                } else {
                  await videoRef.current?.playAsync();
                  setVideoPlaying(true);
                }
              }}
            >
              <Ionicons name={videoPlaying ? 'pause' : 'play'} size={26} color="#fff" />
            </TouchableOpacity>
          </View>
        );
      }
      return (
        <TouchableOpacity
          activeOpacity={0.96}
          onPress={() => openLightbox(item)}
          style={{ width, height: heroH }}
        >
          <Image source={{ uri: item.uri }} style={styles.heroImg} resizeMode="cover" />
          <View style={styles.zoomHint}>
            <Ionicons name="expand-outline" size={14} color="#fff" />
          </View>
        </TouchableOpacity>
      );
    },
    [width, heroH, videoPlaying]
  );

  if (items.length === 0) {
    return (
      <View style={[styles.emptyHero, { height: heroH * 0.55, paddingTop: insets.top }]}>
        <LinearGradient colors={['#1e293b', '#0f172a']} style={StyleSheet.absoluteFillObject} />
        {onBack ? (
          <TouchableOpacity style={[styles.backGlass, { top: insets.top + 10 }]} onPress={onBack}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
        ) : null}
        <View style={styles.emptyCopy}>
          <Text style={styles.titleOnHero}>{title}</Text>
          {subtitle ? <Text style={styles.subOnHero}>{subtitle}</Text> : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { height: heroH }]}>
      <FlatList
        data={items}
        keyExtractor={(item, i) => `${item.kind}-${item.uri}-${i}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        renderItem={renderItem}
        bounces={false}
        decelerationRate="fast"
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
      />

      <LinearGradient
        colors={['rgba(0,0,0,0.45)', 'transparent', 'transparent', 'rgba(0,0,0,0.72)']}
        locations={[0, 0.22, 0.55, 1]}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />

      {onBack ? (
        <TouchableOpacity
          style={[styles.backGlass, { top: insets.top + 10 }]}
          onPress={onBack}
          activeOpacity={0.88}
        >
          {Platform.OS === 'ios' ? (
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFillObject} />
          ) : (
            <View style={[StyleSheet.absoluteFillObject, styles.androidGlassDark]} />
          )}
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
      ) : null}

      <View style={styles.bottomMeta} pointerEvents="none">
        <Text style={styles.kickerOnHero}>Oda deneyimi</Text>
        <Text style={styles.titleOnHero} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subOnHero} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {priceLabel ? <Text style={styles.priceOnHero}>{priceLabel}</Text> : null}
        {items.length > 1 ? (
          <View style={styles.dots}>
            {items.map((_, i) => (
              <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>
        ) : null}
      </View>

      <BookingMediaLightbox
        visible={lightboxOpen}
        uris={imageOnlyUris}
        initialIndex={lightboxIndex}
        onClose={() => setLightboxOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    backgroundColor: '#0f172a',
    overflow: 'hidden',
  },
  emptyHero: {
    width: '100%',
    justifyContent: 'flex-end',
    paddingHorizontal: 22,
    paddingBottom: 28,
  },
  emptyCopy: { gap: 6 },
  heroImg: {
    width: '100%',
    height: '100%',
    ...(Platform.OS === 'web' ? ({ objectFit: 'cover' } as Record<string, string>) : {}),
  },
  backGlass: {
    position: 'absolute',
    left: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
    zIndex: 4,
  },
  androidGlassDark: { backgroundColor: 'rgba(15,23,42,0.55)' },
  playFab: {
    position: 'absolute',
    alignSelf: 'center',
    top: '44%',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(15,23,42,0.48)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    left: '50%',
    marginLeft: -32,
  },
  zoomHint: {
    position: 'absolute',
    right: 16,
    bottom: 96,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomMeta: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 22,
    paddingBottom: 28,
    gap: 4,
  },
  kickerOnHero: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: 'rgba(94,234,212,0.95)',
    marginBottom: 4,
  },
  titleOnHero: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: Platform.OS === 'ios' ? -0.6 : 0,
  },
  subOnHero: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.72)',
    marginTop: 2,
  },
  priceOnHero: {
    marginTop: 8,
    fontSize: 17,
    fontWeight: '700',
    color: '#5eead4',
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 14,
    alignItems: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dotActive: {
    width: 18,
    backgroundColor: '#fff',
  },
});
