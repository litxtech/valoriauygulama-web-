import { useCallback, useEffect, useRef } from 'react';
import { useCachedList } from '@/hooks/useCachedList';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { prefetchImageUrls } from '@/lib/prefetchImageUrls';

export type LocalAreaGuideListRow = {
  id: string;
  title: string;
  image_urls: string[] | null;
  updated_at: string;
};

export default function LocalAreaGuideListScreen() {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { t } = useTranslation();
  const basePath = segments[0] === 'staff' ? '/staff/local-area-guide' : '/customer/local-area-guide';
  const reloadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchItems = useCallback(async () => {
    const { data, error } = await supabase
      .from('local_area_guide_entries')
      .select('id, title, image_urls, updated_at')
      .eq('is_published', true)
      .order('sort_order', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(80);
    if (error) return [];
    const list = (data ?? []) as LocalAreaGuideListRow[];
    prefetchImageUrls(
      list.map((r) => r.image_urls?.[0] ?? null),
      20
    );
    return list;
  }, []);

  const { items: rows, loading, refreshing, refresh, load } = useCachedList<LocalAreaGuideListRow>({
    cacheKey: `${basePath}-list`,
    fetchItems,
  });

  const scheduleReload = useCallback(() => {
    if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current);
    reloadDebounceRef.current = setTimeout(() => {
      reloadDebounceRef.current = null;
      void load({ silent: true });
    }, 300);
  }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel('local-area-guide-list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'local_area_guide_entries' },
        () => {
          scheduleReload();
        }
      )
      .subscribe();
    return () => {
      if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current);
      supabase.removeChannel(ch);
    };
  }, [scheduleReload]);

  const PAD = 16;
  const GAP = 14;
  const numCols = width > 600 ? 2 : 1;
  const cardW = numCols === 2 ? (width - PAD * 2 - GAP) / 2 : width - PAD * 2;
  const CARD_IMG_H = numCols === 2 ? 180 : 210;

  const renderItem = useCallback(
    ({ item, index }: { item: LocalAreaGuideListRow; index: number }) => {
      const cover = item.image_urls?.[0] ?? null;
      const photoCount = item.image_urls?.length ?? 0;
      return (
        <TouchableOpacity
          style={[styles.card, { width: cardW }]}
          onPress={() => router.push(`${basePath}/${item.id}` as never)}
          activeOpacity={0.92}
        >
          <View style={[styles.imgWrap, { height: CARD_IMG_H }]}>
            {cover ? (
              <CachedImage
                uri={cover}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                contentPosition="center"
                priority={index < 6 ? 'high' : 'normal'}
                recyclingKey={cover}
              />
            ) : (
              <View style={styles.imgPlaceholder}>
                <Ionicons name="map-outline" size={48} color={theme.colors.primaryLight} />
              </View>
            )}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.65)']}
              style={styles.gradient}
            />
            {photoCount > 1 && (
              <View style={styles.photoBadge}>
                <Ionicons name="images-outline" size={13} color="#fff" />
                <Text style={styles.photoBadgeText}>{photoCount}</Text>
              </View>
            )}
            <Text style={styles.cardTitleOverlay} numberOfLines={2}>
              {item.title}
            </Text>
          </View>
          <View style={styles.cardFooter}>
            <Text style={styles.cardDate}>
              {new Date(item.updated_at).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </Text>
            <Ionicons name="arrow-forward-circle" size={22} color={theme.colors.primary} />
          </View>
        </TouchableOpacity>
      );
    },
    [CARD_IMG_H, basePath, cardW, router]
  );

  return (
    <View style={styles.root}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        renderItem={renderItem}
        numColumns={numCols}
        key={numCols}
        columnWrapperStyle={numCols === 2 ? { gap: GAP } : undefined}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 24, paddingHorizontal: PAD },
        ]}
        ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
        ListHeaderComponent={
          <Text style={styles.intro}>{t('localAreaGuideListIntro')}</Text>
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyWrap}>
              <View style={[styles.skelCard, { width: cardW, height: CARD_IMG_H + 50 }]} />
              <View style={[styles.skelCard, { width: cardW, height: CARD_IMG_H + 50 }]} />
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="compass-outline" size={56} color={theme.colors.borderLight} />
              <Text style={styles.emptyText}>{t('localAreaGuideListEmpty')}</Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  intro: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 16,
    marginTop: 8,
    lineHeight: 20,
  },
  list: { paddingTop: 8 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    overflow: 'hidden',
    ...theme.shadows.md,
  },
  imgWrap: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: theme.colors.borderLight,
    position: 'relative',
    justifyContent: 'flex-end',
  },
  imgPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.borderLight,
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '60%',
  },
  photoBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  photoBadgeText: { fontSize: 12, color: '#fff', fontWeight: '600' },
  cardTitleOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 14,
    right: 14,
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: 23,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cardDate: { fontSize: 12, color: theme.colors.textMuted },
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 16 },
  emptyText: { fontSize: 15, color: theme.colors.textMuted, textAlign: 'center' },
  skelCard: {
    backgroundColor: theme.colors.borderLight,
    borderRadius: 20,
    opacity: 0.7,
  },
});
