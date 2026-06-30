import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, useWindowDimensions, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode } from 'expo-av';
import type { KitchenMenuPromoVideo } from '@/lib/kitchenMenuPromoVideo';
import { resolvePromoVideoPlayUrl, resolvePromoVideoPoster } from '@/lib/kitchenMenuPromoVideo';
import { CachedImage } from '@/components/CachedImage';

const WELCOME_GOLD = '#c9a227';

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
};

function InlinePromoPlayer({ video, accent }: { video: KitchenMenuPromoVideo; accent: string }) {
  const playUrl = resolvePromoVideoPlayUrl(video);
  const poster = resolvePromoVideoPoster(video);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  if (!playUrl) {
    return (
      <View style={styles.playerPlaceholder}>
        <Ionicons name="videocam-off-outline" size={28} color="#94a3b8" />
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View style={styles.playerWrap}>
        {loading && !error ? (
          <View style={styles.playerOverlay}>
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
            style={{ width: '100%', height: '100%', minHeight: 140, objectFit: 'contain', backgroundColor: '#000' }}
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
    <View style={styles.playerWrap}>
      {poster && loading && !error ? (
        <CachedImage uri={poster} style={StyleSheet.absoluteFillObject} contentFit="cover" />
      ) : null}
      {loading && !error ? (
        <View style={styles.playerOverlay}>
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
          style={styles.video}
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
}: Props) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const stacked = width < 720;
  const [promoIndex, setPromoIndex] = useState(0);
  const accent = accentColor || WELCOME_GOLD;
  const activeVideo = promoVideos[promoIndex] ?? promoVideos[0] ?? null;

  useEffect(() => {
    if (!promoVideos.length) return;
    setPromoIndex(0);
  }, [promoVideos.length, orgName]);

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
            <CachedImage uri={heroImage} style={StyleSheet.absoluteFillObject} contentFit="cover" recyclingKey={`welcome-${orgName}`} />
            <LinearGradient colors={['rgba(8,6,2,0.55)', 'rgba(8,6,2,0.92)']} style={StyleSheet.absoluteFillObject} />
          </>
        ) : null}

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

        <View style={[styles.bodyRow, stacked && styles.bodyRowStack]}>
          <View style={[styles.copyCol, stacked && styles.copyColStack]}>
            <Text style={[styles.kicker, { color: accent }]}>{orgName.toUpperCase()}</Text>
            <Text style={styles.title}>{heroTitle}</Text>
            <Text style={styles.subtitle}>{heroSubtitle}</Text>

            {promoVideos.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.promoPick} contentContainerStyle={styles.promoPickInner}>
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
              </ScrollView>
            ) : activeVideo ? (
              <Text style={[styles.promoSingleTitle, { color: accent }]} numberOfLines={1}>
                {activeVideo.title}
              </Text>
            ) : null}
          </View>

          <View style={[styles.mediaCol, stacked && styles.mediaColStack]}>
            <LinearGradient colors={[accent, '#b8860b']} style={styles.sparkleBadge}>
              <Ionicons name="sparkles" size={20} color="#fff" />
            </LinearGradient>
            {activeVideo ? (
              <InlinePromoPlayer video={activeVideo} accent={accent} />
            ) : (
              <View style={styles.playerPlaceholder}>
                <Ionicons name="restaurant-outline" size={36} color={`${accent}88`} />
              </View>
            )}
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  cardOuter: { paddingHorizontal: 16, paddingTop: 8 },
  welcomeCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 18,
    minHeight: 220,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, zIndex: 2 },
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
  bodyRow: { flexDirection: 'row', gap: 16, alignItems: 'stretch', zIndex: 2 },
  bodyRowStack: { flexDirection: 'column' },
  copyCol: { flex: 1, minWidth: 0, justifyContent: 'center' },
  copyColStack: { width: '100%' },
  mediaCol: { width: '42%', maxWidth: 280, minWidth: 160, gap: 8 },
  mediaColStack: { width: '100%', maxWidth: '100%' },
  kicker: { fontSize: 10, fontWeight: '800', letterSpacing: 2.8, marginBottom: 6 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: -0.8, lineHeight: 32 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.74)', marginTop: 8, lineHeight: 20, fontWeight: '500' },
  promoPick: { marginTop: 12, maxHeight: 36 },
  promoPickInner: { gap: 6 },
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
    maxWidth: 160,
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
    flex: 1,
    minHeight: 140,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  video: { width: '100%', height: '100%', minHeight: 140 },
  playerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  playerPlaceholder: {
    flex: 1,
    minHeight: 140,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
