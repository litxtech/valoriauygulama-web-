import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  Pressable,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode } from 'expo-av';
import type { KitchenMenuPromoVideo } from '@/lib/kitchenMenuPromoVideo';
import { resolvePromoVideoPlayUrl, resolvePromoVideoPoster } from '@/lib/kitchenMenuPromoVideo';
import { CachedImage } from '@/components/CachedImage';

const WELCOME_GOLD = '#c9a227';
const VIDEO_ASPECT = 16 / 9;

type Props = {
  orgName: string;
  heroTitle: string;
  heroSubtitle: string;
  accentColor: string;
  heroImage?: string | null;
  promoVideos: KitchenMenuPromoVideo[];
  liveBadge: string;
  langToggle?: React.ReactNode;
  onOrdersPress?: () => void;
  ordersLabel?: string;
  /** Web: tam ekran karşılama (sabit viewport, kayma yok) */
  fullScreen?: boolean;
  onEnterMenu?: () => void;
  safeTopInset?: number;
};

function promoMediaHeight(width: number, fullScreen?: boolean): number {
  if (fullScreen) {
    return Math.min(Math.round(width * 0.36), width < 560 ? 140 : 168);
  }
  return Math.min(Math.round(width / VIDEO_ASPECT), width < 560 ? 180 : 220);
}

function PromoSlide({
  video,
  accent,
  width,
  height,
  isActive,
  edgeToEdge,
}: {
  video: KitchenMenuPromoVideo;
  accent: string;
  width: number;
  height: number;
  isActive: boolean;
  edgeToEdge?: boolean;
}) {
  const playUrl = resolvePromoVideoPlayUrl(video);
  const poster = resolvePromoVideoPoster(video);
  const posterOnly = !playUrl && !!poster;
  const [videoLoading, setVideoLoading] = useState(!!playUrl && !poster);
  const [error, setError] = useState(false);
  const webVideoRef = useRef<HTMLVideoElement | null>(null);

  const finishVideoLoading = useCallback(() => setVideoLoading(false), []);

  useEffect(() => {
    if (!playUrl) {
      setVideoLoading(false);
      setError(false);
      return;
    }
    setVideoLoading(!poster);
    setError(false);
    if (poster) return;
    const t = setTimeout(finishVideoLoading, 6000);
    return () => clearTimeout(t);
  }, [playUrl, poster, finishVideoLoading]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !isActive || !playUrl) return;
    const el = webVideoRef.current;
    if (!el) return;
    el.muted = true;
    const attempt = () => {
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    };
    attempt();
  }, [isActive, playUrl]);

  const boxStyle = useMemo(
    () => ({
      width,
      height,
      maxWidth: '100%' as const,
    }),
    [width, height]
  );

  const wrapStyle = [styles.playerWrap, boxStyle, edgeToEdge && styles.playerWrapEdge];

  if (posterOnly) {
    return (
      <View style={wrapStyle}>
        <CachedImage uri={poster} style={StyleSheet.absoluteFillObject} contentFit="cover" />
      </View>
    );
  }

  if (!playUrl) {
    return (
      <View style={[styles.playerPlaceholder, boxStyle, edgeToEdge && styles.playerPlaceholderEdge]}>
        <Ionicons name="videocam-off-outline" size={28} color="#94a3b8" />
      </View>
    );
  }

  const showVideoSpinner = videoLoading && !error && !poster;

  if (Platform.OS === 'web') {
    return (
      <View style={wrapStyle}>
        {poster ? (
          <CachedImage
            uri={poster}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            onLoad={finishVideoLoading}
            onError={finishVideoLoading}
          />
        ) : null}
        {showVideoSpinner ? (
          <View style={styles.playerOverlay} pointerEvents="none">
            <ActivityIndicator color={accent} />
          </View>
        ) : null}
        {error ? (
          <View style={styles.playerOverlay}>
            <Ionicons name="alert-circle-outline" size={24} color="#f87171" />
          </View>
        ) : (
          <video
            ref={webVideoRef}
            key={playUrl}
            src={playUrl}
            poster={poster ?? undefined}
            autoPlay={isActive}
            muted
            playsInline
            loop
            controls
            preload="auto"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              backgroundColor: '#000',
              display: 'block',
              opacity: videoLoading && poster ? 0 : 1,
            }}
            onLoadedMetadata={finishVideoLoading}
            onCanPlay={finishVideoLoading}
            onPlaying={finishVideoLoading}
            onLoadedData={finishVideoLoading}
            onError={() => {
              finishVideoLoading();
              setError(true);
            }}
          />
        )}
      </View>
    );
  }

  return (
    <View style={wrapStyle}>
      {poster ? (
        <CachedImage
          uri={poster}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          onLoad={finishVideoLoading}
          onError={finishVideoLoading}
        />
      ) : null}
      {showVideoSpinner ? (
        <View style={styles.playerOverlay} pointerEvents="none">
          <ActivityIndicator color={accent} />
        </View>
      ) : null}
      {error ? (
        <View style={styles.playerOverlay}>
          <Ionicons name="alert-circle-outline" size={24} color="#f87171" />
        </View>
      ) : (
        <Video
          key={playUrl}
          style={[styles.videoFill, poster && videoLoading ? { opacity: 0 } : null]}
          source={{ uri: playUrl }}
          useNativeControls
          resizeMode={ResizeMode.COVER}
          shouldPlay={isActive}
          isMuted
          isLooping
          posterSource={poster ? { uri: poster } : undefined}
          usePoster={!!poster}
          onLoad={finishVideoLoading}
          onReadyForDisplay={finishVideoLoading}
          onError={() => {
            finishVideoLoading();
            setError(true);
          }}
        />
      )}
    </View>
  );
}

function PromoCarousel({
  videos,
  accent,
  pageWidth,
  mediaHeight,
  promoIndex,
  onIndexChange,
  edgeToEdge,
  safeTopInset = 0,
}: {
  videos: KitchenMenuPromoVideo[];
  accent: string;
  pageWidth: number;
  mediaHeight: number;
  promoIndex: number;
  onIndexChange: (i: number) => void;
  edgeToEdge?: boolean;
  safeTopInset?: number;
}) {
  const scrollRef = useRef<ScrollView>(null);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / Math.max(pageWidth, 1));
    if (idx >= 0 && idx < videos.length) onIndexChange(idx);
  };

  return (
    <View style={[styles.carouselWrap, edgeToEdge && styles.carouselWrapEdge, { width: pageWidth }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        scrollEventThrottle={16}
        style={[
          { width: pageWidth },
          Platform.OS === 'web' ? ({ scrollSnapType: 'x mandatory' } as object) : null,
        ]}
        contentContainerStyle={{ alignItems: 'stretch' }}
      >
        {videos.map((video, i) => (
          <View key={video.id} style={{ width: pageWidth, height: mediaHeight }}>
            <PromoSlide
              video={video}
              accent={accent}
              width={pageWidth}
              height={mediaHeight}
              isActive={i === promoIndex}
              edgeToEdge={edgeToEdge}
            />
          </View>
        ))}
      </ScrollView>

      {videos.length > 1 ? (
        <View style={[styles.carouselChrome, { paddingTop: safeTopInset + 8 }]}>
          <View style={styles.dotRow}>
            {videos.map((v, i) => (
              <View
                key={v.id}
                style={[styles.dot, i === promoIndex && { backgroundColor: accent, width: 18 }]}
              />
            ))}
          </View>
          <Text style={styles.swipeHint}>Kaydır</Text>
        </View>
      ) : null}

      {videos.length > 1 ? (
        <View style={styles.carouselTitleBar} pointerEvents="none">
          <Text style={[styles.carouselTitle, { color: accent }]} numberOfLines={1}>
            {videos[promoIndex]?.title}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function PublicKitchenMenuWelcomeHero({
  orgName,
  heroTitle,
  heroSubtitle,
  accentColor,
  heroImage,
  promoVideos,
  liveBadge,
  langToggle,
  onOrdersPress,
  ordersLabel,
  fullScreen = false,
  onEnterMenu,
  safeTopInset = 0,
}: Props) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const stacked = width < 900;
  const [promoIndex, setPromoIndex] = useState(0);
  const accent = accentColor || WELCOME_GOLD;
  const mediaH = promoMediaHeight(width, fullScreen);
  const carouselWidth = fullScreen ? width : Math.min(width - 32, 400);

  useEffect(() => {
    if (!promoVideos.length) return;
    setPromoIndex(0);
  }, [promoVideos.length, orgName]);

  const hasPromo = promoVideos.length > 0;

  const topChrome = (
    <View style={[styles.topRow, fullScreen && styles.topRowOverMedia, { paddingTop: fullScreen ? safeTopInset + 8 : 0 }]}>
      <View style={styles.livePill}>
        <View style={[styles.liveDot, { backgroundColor: accent }]} />
        <Text style={[styles.liveText, { color: accent }]}>{liveBadge}</Text>
      </View>
      <View style={styles.topActions}>
        {onOrdersPress ? (
          <TouchableOpacity style={styles.ordersBtn} onPress={onOrdersPress}>
            <Ionicons name="receipt-outline" size={16} color="#fff" />
            <Text style={styles.ordersBtnText}>{ordersLabel ?? t('publicKitchenMenuOrderHistory')}</Text>
          </TouchableOpacity>
        ) : null}
        {langToggle}
      </View>
    </View>
  );

  const copyBlock = (
    <>
      <Text style={[styles.kicker, { color: accent }, fullScreen && styles.kickerFull]}>
        {orgName.toUpperCase()}
      </Text>
      <Text style={[styles.title, fullScreen && styles.titleFull]}>{heroTitle}</Text>
      <Text style={[styles.subtitle, fullScreen && styles.subtitleFull]}>{heroSubtitle}</Text>
      {!fullScreen && promoVideos.length === 1 ? (
        <Text style={[styles.promoSingleTitle, { color: accent }]} numberOfLines={1}>
          {promoVideos[0]?.title}
        </Text>
      ) : null}
    </>
  );

  if (fullScreen) {
    return (
      <View style={styles.cardOuterFull}>
        <LinearGradient
          colors={['#0c0a06', '#1a1508', '#0a0906']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.welcomeCardFull}
        >
          {heroImage && !hasPromo ? (
            <>
              <CachedImage uri={heroImage} style={StyleSheet.absoluteFillObject} contentFit="cover" />
              <LinearGradient
                colors={['rgba(6,4,1,0.55)', 'rgba(6,4,1,0.92)']}
                style={StyleSheet.absoluteFillObject}
              />
            </>
          ) : null}

          {hasPromo ? (
            <View style={styles.topMediaSlot}>
              <PromoCarousel
                videos={promoVideos}
                accent={accent}
                pageWidth={carouselWidth}
                mediaHeight={mediaH}
                promoIndex={promoIndex}
                onIndexChange={setPromoIndex}
                edgeToEdge
                safeTopInset={safeTopInset}
              />
              <View style={styles.topChromeOverlay} pointerEvents="box-none">
                {topChrome}
              </View>
            </View>
          ) : (
            <View style={{ paddingTop: safeTopInset + 12 }}>{topChrome}</View>
          )}

          <View style={[styles.innerFull, { paddingBottom: 18 }]}>
            <View style={styles.copyColFull}>{copyBlock}</View>
            {onEnterMenu ? (
              <Pressable style={[styles.enterMenuBtn, styles.enterMenuBtnFull, { borderColor: `${accent}66` }]} onPress={onEnterMenu}>
                <Text style={[styles.enterMenuText, { color: accent }]}>{t('publicKitchenMenuEnterMenu')}</Text>
                <Ionicons name="chevron-down" size={18} color={accent} />
              </Pressable>
            ) : null}
          </View>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.cardOuter}>
      <LinearGradient
        colors={['#1a1508', '#2a2210', '#12100a']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.welcomeCard, { borderColor: `${accent}44` }]}
      >
        {heroImage ? (
          <>
            <CachedImage uri={heroImage} style={StyleSheet.absoluteFillObject} contentFit="cover" />
            <LinearGradient colors={['rgba(8,6,2,0.55)', 'rgba(8,6,2,0.92)']} style={StyleSheet.absoluteFillObject} />
          </>
        ) : null}

        <View style={styles.inner}>
          {topChrome}

          <View style={[styles.bodyRow, stacked && styles.bodyRowStack]}>
            <View style={[styles.copyCol, stacked && styles.copyColStack]}>{copyBlock}</View>

            <View style={[styles.mediaCol, stacked && styles.mediaColStack]}>
              {hasPromo ? (
                <PromoCarousel
                  videos={promoVideos}
                  accent={accent}
                  pageWidth={carouselWidth}
                  mediaHeight={mediaH}
                  promoIndex={promoIndex}
                  onIndexChange={setPromoIndex}
                />
              ) : (
                <View style={[styles.playerPlaceholder, { width: carouselWidth, height: mediaH }]}>
                  <Ionicons name="restaurant-outline" size={36} color={`${accent}88`} />
                </View>
              )}
            </View>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  cardOuter: { paddingHorizontal: 16, paddingTop: 8 },
  cardOuterFull: { paddingHorizontal: 0, paddingTop: 0, width: '100%', flex: 1, height: '100%' },
  welcomeCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 18,
    minHeight: 220,
  },
  welcomeCardFull: {
    borderRadius: 0,
    borderWidth: 0,
    padding: 0,
    width: '100%',
    height: '100%',
    justifyContent: 'flex-start',
  },
  topMediaSlot: { width: '100%', position: 'relative' },
  topChromeOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
  },
  inner: { zIndex: 2 },
  innerFull: {
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 10,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, paddingHorizontal: 4 },
  topRowOverMedia: { marginBottom: 0, paddingHorizontal: 16 },
  topActions: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  ordersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  ordersBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  bodyRow: { flexDirection: 'row', gap: 20, alignItems: 'center', zIndex: 2 },
  bodyRowStack: { flexDirection: 'column', alignItems: 'stretch' },
  copyCol: { flex: 1, minWidth: 0, justifyContent: 'center' },
  copyColStack: { width: '100%' },
  copyColFull: { justifyContent: 'center' },
  mediaCol: { alignItems: 'center', gap: 8 },
  mediaColStack: { width: '100%', maxWidth: '100%' },
  kicker: { fontSize: 10, fontWeight: '800', letterSpacing: 2.8, marginBottom: 6 },
  kickerFull: { fontSize: 10, letterSpacing: 2.4, marginBottom: 6 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: -0.8, lineHeight: 32 },
  titleFull: { fontSize: 26, lineHeight: 30, letterSpacing: -0.6, maxWidth: 480 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.74)', marginTop: 8, lineHeight: 20, fontWeight: '500' },
  subtitleFull: { fontSize: 13, lineHeight: 19, marginTop: 6, maxWidth: 420 },
  promoSingleTitle: { marginTop: 12, fontSize: 12, fontWeight: '700' },
  carouselWrap: { position: 'relative', overflow: 'hidden' },
  carouselWrapEdge: { borderRadius: 0 },
  carouselChrome: {
    position: 'absolute',
    top: 0,
    right: 12,
    alignItems: 'flex-end',
    gap: 4,
    zIndex: 2,
  },
  dotRow: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  swipeHint: {
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  carouselTitleBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  carouselTitle: { fontSize: 12, fontWeight: '800' },
  playerWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    position: 'relative',
  },
  playerWrapEdge: { borderRadius: 0, borderWidth: 0 },
  videoFill: { width: '100%', height: '100%' },
  playerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 2,
  },
  playerPlaceholder: {
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerPlaceholderEdge: { borderRadius: 0, borderWidth: 0 },
  enterMenuBtn: {
    marginTop: 22,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  enterMenuBtnFull: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  enterMenuText: { fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
});
