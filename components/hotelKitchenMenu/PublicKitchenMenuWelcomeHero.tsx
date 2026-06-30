import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  Pressable,
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
};

function InlinePromoPlayer({
  video,
  accent,
  fullScreen,
  playerWidth,
}: {
  video: KitchenMenuPromoVideo;
  accent: string;
  fullScreen?: boolean;
  playerWidth: number;
}) {
  const playUrl = resolvePromoVideoPlayUrl(video);
  const poster = resolvePromoVideoPoster(video);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const boxH = Math.round(playerWidth / VIDEO_ASPECT);
  const boxStyle = useMemo(
    () => ({
      width: playerWidth,
      height: boxH,
      maxWidth: '100%' as const,
    }),
    [playerWidth, boxH]
  );

  if (!playUrl) {
    return (
      <View style={[styles.playerPlaceholder, boxStyle, fullScreen && styles.playerPlaceholderFull]}>
        <Ionicons name="videocam-off-outline" size={28} color="#94a3b8" />
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.playerWrap, boxStyle, fullScreen && styles.playerWrapFull]}>
        {loading && !error ? (
          <View style={styles.playerOverlay} pointerEvents="none">
            {poster ? (
              <CachedImage uri={poster} style={StyleSheet.absoluteFillObject} contentFit="cover" />
            ) : null}
            <ActivityIndicator color={accent} />
          </View>
        ) : null}
        {error ? (
          <View style={styles.playerOverlay}>
            <Ionicons name="alert-circle-outline" size={24} color="#f87171" />
          </View>
        ) : (
          <video
            key={playUrl}
            src={playUrl}
            poster={poster ?? undefined}
            controls
            playsInline
            preload="metadata"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              backgroundColor: '#000',
              display: 'block',
            }}
            onLoadedData={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setError(true);
            }}
          />
        )}
      </View>
    );
  }

  return (
    <View style={[styles.playerWrap, boxStyle]}>
      {poster && loading && !error ? (
        <CachedImage uri={poster} style={StyleSheet.absoluteFillObject} contentFit="cover" />
      ) : null}
      {loading && !error ? (
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
          style={styles.videoFill}
          source={{ uri: playUrl }}
          useNativeControls
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay={false}
          posterSource={poster ? { uri: poster } : undefined}
          usePoster={!!poster}
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setError(true);
          }}
        />
      )}
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
}: Props) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const stacked = width < 900;
  const [promoIndex, setPromoIndex] = useState(0);
  const accent = accentColor || WELCOME_GOLD;
  const activeVideo = promoVideos[promoIndex] ?? promoVideos[0] ?? null;

  const playerWidth = useMemo(() => {
    if (fullScreen) {
      if (stacked) return Math.min(width - 48, 520);
      return Math.min(Math.round(width * 0.38), 480);
    }
    if (stacked) return Math.min(width - 64, 400);
    return Math.min(Math.round(width * 0.34), 280);
  }, [fullScreen, stacked, width]);

  useEffect(() => {
    if (!promoVideos.length) return;
    setPromoIndex(0);
  }, [promoVideos.length, orgName]);

  const promoPicker =
    promoVideos.length > 1 ? (
      <View style={[styles.promoPickRow, fullScreen && styles.promoPickRowFull]}>
        {promoVideos.map((video, i) => (
          <TouchableOpacity
            key={video.id}
            style={[styles.promoChip, i === promoIndex && { borderColor: accent, backgroundColor: `${accent}22` }]}
            onPress={() => setPromoIndex(i)}
          >
            <Ionicons name="play" size={12} color={i === promoIndex ? accent : '#94a3b8'} />
            <Text style={[styles.promoChipText, i === promoIndex && { color: accent }]} numberOfLines={1}>
              {video.title}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    ) : activeVideo ? (
      <Text style={[styles.promoSingleTitle, { color: accent }]} numberOfLines={1}>
        {activeVideo.title}
      </Text>
    ) : null;

  return (
    <View style={[styles.cardOuter, fullScreen && styles.cardOuterFull]}>
      <LinearGradient
        colors={fullScreen ? ['#0c0a06', '#1a1508', '#0a0906'] : ['#1a1508', '#2a2210', '#12100a']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.welcomeCard,
          fullScreen && styles.welcomeCardFull,
          !fullScreen && { borderColor: `${accent}44` },
        ]}
      >
        {heroImage ? (
          <>
            <CachedImage
              uri={heroImage}
              style={StyleSheet.absoluteFillObject}
              contentFit="cover"
              recyclingKey={`welcome-${orgName}`}
            />
            <LinearGradient
              colors={
                fullScreen
                  ? ['rgba(6,4,1,0.72)', 'rgba(6,4,1,0.88)', 'rgba(6,4,1,0.96)']
                  : ['rgba(8,6,2,0.55)', 'rgba(8,6,2,0.92)']
              }
              style={StyleSheet.absoluteFillObject}
            />
          </>
        ) : null}

        {fullScreen ? (
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.35)']}
            style={styles.fullScreenVignette}
            pointerEvents="none"
          />
        ) : null}

        <View style={[styles.inner, fullScreen && styles.innerFull]}>
          <View style={styles.topRow}>
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

          <View style={[styles.bodyRow, stacked && styles.bodyRowStack, fullScreen && styles.bodyRowFull]}>
            <View style={[styles.copyCol, stacked && styles.copyColStack, fullScreen && styles.copyColFull]}>
              <Text style={[styles.kicker, { color: accent }, fullScreen && styles.kickerFull]}>
                {orgName.toUpperCase()}
              </Text>
              <Text style={[styles.title, fullScreen && styles.titleFull]}>{heroTitle}</Text>
              <Text style={[styles.subtitle, fullScreen && styles.subtitleFull]}>{heroSubtitle}</Text>
              {promoPicker}
            </View>

            <View style={[styles.mediaCol, stacked && styles.mediaColStack, fullScreen && styles.mediaColFull]}>
              {!stacked && fullScreen ? (
                <LinearGradient colors={[accent, '#b8860b']} style={styles.sparkleBadge}>
                  <Ionicons name="sparkles" size={20} color="#fff" />
                </LinearGradient>
              ) : null}
              {activeVideo ? (
                <InlinePromoPlayer
                  video={activeVideo}
                  accent={accent}
                  fullScreen={fullScreen}
                  playerWidth={playerWidth}
                />
              ) : (
                <View
                  style={[
                    styles.playerPlaceholder,
                    { width: playerWidth, height: Math.round(playerWidth / VIDEO_ASPECT) },
                    fullScreen && styles.playerPlaceholderFull,
                  ]}
                >
                  <Ionicons name="restaurant-outline" size={36} color={`${accent}88`} />
                </View>
              )}
            </View>
          </View>

          {fullScreen && onEnterMenu ? (
            <Pressable style={[styles.enterMenuBtn, { borderColor: `${accent}66` }]} onPress={onEnterMenu}>
              <Text style={[styles.enterMenuText, { color: accent }]}>{t('publicKitchenMenuEnterMenu')}</Text>
              <Ionicons name="chevron-down" size={18} color={accent} />
            </Pressable>
          ) : null}
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
    minHeight: undefined,
    width: '100%',
    height: '100%',
    flex: 1,
    justifyContent: 'center',
  },
  fullScreenVignette: {
    ...StyleSheet.absoluteFillObject,
    top: '55%',
  },
  inner: { zIndex: 2 },
  innerFull: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
    maxWidth: 1200,
    width: '100%',
    alignSelf: 'center',
  },
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
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
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  ordersBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  bodyRow: { flexDirection: 'row', gap: 20, alignItems: 'center', zIndex: 2 },
  bodyRowStack: { flexDirection: 'column', alignItems: 'stretch' },
  bodyRowFull: { flex: 1, justifyContent: 'center' },
  copyCol: { flex: 1, minWidth: 0, justifyContent: 'center' },
  copyColStack: { width: '100%' },
  copyColFull: { justifyContent: 'flex-end', paddingBottom: 8 },
  mediaCol: { alignItems: 'center', gap: 8 },
  mediaColStack: { width: '100%', maxWidth: '100%' },
  mediaColFull: { justifyContent: 'center' },
  kicker: { fontSize: 10, fontWeight: '800', letterSpacing: 2.8, marginBottom: 6 },
  kickerFull: { fontSize: 11, letterSpacing: 3.2, marginBottom: 10 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: -0.8, lineHeight: 32 },
  titleFull: { fontSize: 42, lineHeight: 46, letterSpacing: -1.2, maxWidth: 640 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.74)', marginTop: 8, lineHeight: 20, fontWeight: '500' },
  subtitleFull: { fontSize: 16, lineHeight: 24, marginTop: 12, maxWidth: 520 },
  promoPickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  promoPickRowFull: { marginTop: 16 },
  promoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    maxWidth: 180,
  },
  promoChipText: { color: '#cbd5e1', fontSize: 11, fontWeight: '700', flexShrink: 1 },
  promoSingleTitle: { marginTop: 12, fontSize: 12, fontWeight: '700' },
  sparkleBadge: {
    alignSelf: 'flex-end',
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    position: 'relative',
  },
  playerWrapFull: {
    borderRadius: 20,
    borderColor: 'rgba(255,255,255,0.16)',
    ...Platform.select({
      web: {
        boxShadow: '0 24px 48px rgba(0,0,0,0.45)',
      } as object,
      default: {},
    }),
  },
  videoFill: { width: '100%', height: '100%' },
  playerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 2,
  },
  playerPlaceholder: {
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerPlaceholderFull: {
    borderRadius: 20,
  },
  enterMenuBtn: {
    marginTop: 28,
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
  enterMenuText: { fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
});
