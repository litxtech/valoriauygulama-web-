import { useCallback, useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  ActivityIndicator,
  Modal,
  Pressable,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { LinkifiedText } from '@/components/LinkifiedText';
import { prefetchImageUrls } from '@/lib/prefetchImageUrls';

type Row = {
  id: string;
  title: string;
  body: string | null;
  image_urls: string[] | null;
  updated_at: string;
};

export default function LocalAreaGuideDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width, height: windowHeight } = useWindowDimensions();
  const { t } = useTranslation();
  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const detailReloadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from('local_area_guide_entries')
      .select('id, title, body, image_urls, updated_at')
      .eq('id', id)
      .eq('is_published', true)
      .maybeSingle();
    if (error || !data) {
      setRow(null);
      return;
    }
    setRow(data as Row);
  }, [id]);

  useEffect(() => {
    setRow(null);
  }, [id]);

  useEffect(() => {
    if (row?.title) {
      navigation.setOptions({ title: row.title });
    } else if (!loading) {
      navigation.setOptions({ title: t('localAreaGuideScreenTitle') });
    }
  }, [navigation, row?.title, loading, t]);

  useEffect(() => {
    if (row?.image_urls && row.image_urls.length > 0) {
      prefetchImageUrls(row.image_urls, 24);
    }
  }, [row?.id, row?.updated_at]);

  const scheduleDetailReload = useCallback(() => {
    if (detailReloadDebounceRef.current) clearTimeout(detailReloadDebounceRef.current);
    detailReloadDebounceRef.current = setTimeout(() => {
      detailReloadDebounceRef.current = null;
      load();
    }, 250);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load().finally(() => {
      if (!cancelled) setLoading(false);
    });
    const ch = supabase
      .channel(`local-area-guide-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'local_area_guide_entries', filter: `id=eq.${id}` },
        () => {
          scheduleDetailReload();
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      if (detailReloadDebounceRef.current) clearTimeout(detailReloadDebounceRef.current);
      supabase.removeChannel(ch);
    };
  }, [id, load, scheduleDetailReload]);

  const HERO_H = Math.min(320, width * 0.7);
  const lightboxW = Math.min(width - 32, 720);
  const lightboxH = windowHeight * 0.88;

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / width);
      setActiveSlide(idx);
    },
    [width]
  );

  if (loading && !row) {
    return (
      <View style={styles.root}>
        <View style={[styles.skelHero, { width, height: HERO_H }]}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
        <View style={styles.skelBody}>
          <View style={styles.skelLine1} />
          <View style={styles.skelLine2} />
          <View style={styles.skelLine3} />
        </View>
      </View>
    );
  }

  if (!row) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={theme.colors.borderLight} />
        <Text style={styles.muted}>{t('localAreaGuideNotFound')}</Text>
      </View>
    );
  }

  const images = row.image_urls?.filter(Boolean) ?? [];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
    >
      {images.length > 0 ? (
        <View style={[styles.heroWrap, { height: HERO_H }]}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
          >
            {images.map((uri, i) => (
              <Pressable key={uri} onPress={() => setLightboxUri(uri)} style={{ width, height: HERO_H }}>
                <CachedImage
                  uri={uri}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  contentPosition="center"
                  priority={i === 0 ? 'high' : 'low'}
                  recyclingKey={uri}
                />
              </Pressable>
            ))}
          </ScrollView>
          <LinearGradient
            colors={['rgba(0,0,0,0.35)', 'transparent', 'transparent', 'rgba(0,0,0,0.25)']}
            locations={[0, 0.3, 0.7, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {images.length > 1 && (
            <View style={styles.dotsRow}>
              {images.map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i === activeSlide && styles.dotActive]}
                />
              ))}
            </View>
          )}
          {images.length > 1 && (
            <View style={styles.counterBadge}>
              <Text style={styles.counterText}>
                {activeSlide + 1}/{images.length}
              </Text>
            </View>
          )}
        </View>
      ) : null}

      <View style={styles.content}>
        <Text style={styles.title}>{row.title}</Text>
        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={14} color={theme.colors.textMuted} />
          <Text style={styles.meta}>
            {t('localAreaGuideUpdated')}{' '}
            {new Date(row.updated_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
          </Text>
        </View>

        {row.body?.trim() ? (
          <View style={styles.bodyWrap}>
            <LinkifiedText text={row.body.trim()} textStyle={styles.bodyText} linkStyle={styles.bodyLink} />
          </View>
        ) : null}
      </View>

      <Modal
        visible={!!lightboxUri}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxUri(null)}
        statusBarTranslucent
      >
        <Pressable style={styles.lbOverlay} onPress={() => setLightboxUri(null)} accessibilityLabel={t('close')}>
          {lightboxUri ? (
            <View style={styles.lbContent} pointerEvents="box-none">
              <View style={[styles.lbFrame, { width: lightboxW, height: lightboxH, borderRadius: 12 }]}>
                <CachedImage
                  uri={lightboxUri}
                  style={StyleSheet.absoluteFill}
                  contentFit="contain"
                  contentPosition="center"
                />
              </View>
              <View style={styles.lbClose}>
                <Ionicons name="close-circle" size={36} color="rgba(255,255,255,0.85)" />
              </View>
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  muted: { fontSize: 15, color: theme.colors.textMuted, textAlign: 'center' },
  heroWrap: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: theme.colors.borderLight,
    position: 'relative',
  },
  dotsRow: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  dotActive: {
    backgroundColor: '#ffffff',
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  counterBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  counterText: { fontSize: 12, color: '#fff', fontWeight: '600' },
  content: { paddingHorizontal: 20, paddingTop: 20 },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.colors.text,
    lineHeight: 30,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    opacity: 0.8,
  },
  meta: { fontSize: 13, color: theme.colors.textMuted },
  bodyWrap: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderLight,
  },
  bodyText: { fontSize: 16, lineHeight: 26, color: theme.colors.text },
  bodyLink: { color: theme.colors.primary, textDecorationLine: 'underline' },
  lbOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lbContent: { justifyContent: 'center', alignItems: 'center', padding: 16 },
  lbFrame: { overflow: 'hidden', backgroundColor: '#0d0d0d' },
  lbClose: { position: 'absolute', top: 16, right: 16 },
  skelHero: {
    backgroundColor: theme.colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skelBody: { paddingHorizontal: 20, paddingTop: 20, gap: 12 },
  skelLine1: { height: 22, width: '80%', borderRadius: 8, backgroundColor: theme.colors.borderLight },
  skelLine2: { height: 14, width: '55%', borderRadius: 6, backgroundColor: theme.colors.borderLight, opacity: 0.7 },
  skelLine3: { height: 14, width: '90%', borderRadius: 6, backgroundColor: theme.colors.borderLight, opacity: 0.5, marginTop: 16 },
});
