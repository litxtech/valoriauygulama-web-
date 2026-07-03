import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  ActivityIndicator,
  Alert,
  type LayoutChangeEvent,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import {
  loadStaffProfileFeedPreviews,
  type StaffProfileFeedPreview,
  type StaffProfileFeedFilter,
} from '@/lib/staffProfileFeedThumbnails';
import { loadFeedPostEngagementCounts } from '@/lib/feedPostEngagementCounts';
import { formatStatCompact } from '@/lib/modernProfileTenure';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { removeFeedMediaObjectsForPostUrls } from '@/lib/feedMediaStorageDelete';
import {
  hydrateStaffProfileFeedCache,
  peekStaffProfileFeedCache,
  writeStaffProfileFeedCache,
} from '@/lib/staffProfileFeedCache';
import { computeProfileFeedGridMetrics, profileFeedCellSize } from '@/lib/profileFeedGridLayout';

const GAP = 1;
/** TikTokProfileBody paddingHorizontal — edgeToEdge grid breaks out to full width */
const PROFILE_BODY_HPAD = 16;

type Props = {
  staffId: string;
  linkVariant: 'staff' | 'customer';
  /** İç scroll ile kullanım */
  maxPreview?: number;
  /** Yüklendikten sonra kaç önizleme var (0 ise dışarıda bölümü gizlemek için) */
  onPreviewCount?: (n: number) => void;
  /** false: gönderi yoksa hiçbir şey gösterme (kendi profilinde true: "henüz yok" metni) */
  showEmptyHint?: boolean;
  allowOwnPostDelete?: boolean;
  viewerStaffId?: string | null;
  /** Instagram-style edge-to-edge: no border-radius, uses full screen width */
  edgeToEdge?: boolean;
  feedFilter?: StaffProfileFeedFilter;
  showEngagementOverlay?: boolean;
};

export function StaffProfileFeedGrid({
  staffId,
  linkVariant,
  maxPreview,
  onPreviewCount,
  showEmptyHint = true,
  allowOwnPostDelete = false,
  viewerStaffId = null,
  edgeToEdge = false,
  feedFilter = 'all',
  showEngagementOverlay = true,
}: Props) {
  const { width: winW } = useWindowDimensions();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'tr';
  const [items, setItems] = useState<StaffProfileFeedPreview[]>(
    () => peekStaffProfileFeedCache(staffId, feedFilter) ?? []
  );
  const [loading, setLoading] = useState(() => (peekStaffProfileFeedCache(staffId, feedFilter)?.length ?? 0) === 0);
  const [err, setErr] = useState<string | null>(null);
  const [gridW, setGridW] = useState(0);
  const loadSeqRef = useRef(0);

  const gridWidth = edgeToEdge ? winW : gridW > 0 ? gridW : Math.max(0, winW - PROFILE_BODY_HPAD * 2);
  const gridMetrics = computeProfileFeedGridMetrics(gridWidth, GAP);

  const onGridLayout = useCallback((e: LayoutChangeEvent) => {
    if (!edgeToEdge) setGridW(e.nativeEvent.layout.width);
  }, [edgeToEdge]);

  const load = useCallback(async () => {
    if (!staffId) return;
    const seq = ++loadSeqRef.current;
    const cached = peekStaffProfileFeedCache(staffId, feedFilter);
    if (!cached?.length) setLoading(true);
    setErr(null);
    const lim = maxPreview != null ? Math.max(maxPreview, 30) : 30;
    const { items: row, error } = await loadStaffProfileFeedPreviews(staffId, lim, feedFilter, false);
    if (seq !== loadSeqRef.current) return;
    if (error) {
      setErr(error.message);
      if (!cached?.length) {
        setItems([]);
        onPreviewCount?.(0);
      }
      setLoading(false);
      return;
    }
    const slice = maxPreview != null ? row.slice(0, maxPreview) : row;
    setItems(slice);
    writeStaffProfileFeedCache(staffId, feedFilter, slice);
    onPreviewCount?.(slice.length);
    setLoading(false);

    if (showEngagementOverlay && slice.length > 0) {
      const ids = slice.map((it) => it.id);
      const counts = await loadFeedPostEngagementCounts(ids);
      if (seq !== loadSeqRef.current) return;
      setItems((prev) => {
        const next = prev.map((it) => {
          const c = counts.get(it.id);
          return c
            ? { ...it, likesCount: c.likes, commentsCount: c.comments, viewsCount: c.views }
            : it;
        });
        writeStaffProfileFeedCache(staffId, feedFilter, next);
        return next;
      });
    }
  }, [staffId, maxPreview, onPreviewCount, feedFilter, showEngagementOverlay]);

  useEffect(() => {
    let cancelled = false;
    void hydrateStaffProfileFeedCache(staffId, feedFilter).then((cached) => {
      if (cancelled || !cached?.length) return;
      setItems(cached);
      onPreviewCount?.(cached.length);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [staffId, feedFilter, onPreviewCount]);

  useEffect(() => {
    load();
  }, [load]);

  const onOpen = (id: string) => {
    if (linkVariant === 'staff') {
      router.push({ pathname: '/staff', params: { openPostId: id } } as Href);
    } else {
      router.push({ pathname: '/customer/feed/[id]', params: { id } } as Href);
    }
  };

  const onLongPressItem = (item: StaffProfileFeedPreview) => {
    if (!allowOwnPostDelete) return;
    Alert.alert('Gonderi sil', 'Bu gonderiyi silmek istiyor musunuz?', [
      { text: 'Iptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          const { data: row } = await supabase
            .from('feed_posts')
            .select('id, staff_id, media_url, thumbnail_url')
            .eq('id', item.id)
            .maybeSingle();
          if (!row || (viewerStaffId && row.staff_id !== viewerStaffId)) {
            Alert.alert('Hata', 'Bu gonderiyi silme yetkiniz yok.');
            return;
          }
          const { data, error } = await supabase.from('feed_posts').delete().eq('id', item.id).select('id');
          if (error || !data?.length) {
            Alert.alert('Hata', error?.message ?? 'Gonderi silinemedi.');
            return;
          }
          await removeFeedMediaObjectsForPostUrls([row.media_url, row.thumbnail_url]);
          setItems((prev) => {
            const next = prev.filter((x) => x.id !== item.id);
            writeStaffProfileFeedCache(staffId, feedFilter, next);
            return next;
          });
        },
      },
    ]);
  };

  if (loading && items.length === 0) {
    return (
      <View style={styles.loadWrap} accessibilityLabel={t('profileFeedPostsSection')}>
        <ActivityIndicator color={theme.colors.primary} size="small" />
      </View>
    );
  }
  if (err) {
    return null;
  }
  if (items.length === 0) {
    if (!showEmptyHint) return null;
    return (
      <View style={styles.emptyBlock}>
        <Text style={styles.emptyText}>
          {t(feedFilter === 'media' ? 'modernProfileMediaEmpty' : 'profileFeedPostsEmpty')}
        </Text>
      </View>
    );
  }

  return (
    <View
      onLayout={onGridLayout}
      style={[
        styles.gridOuter,
        edgeToEdge && styles.gridOuterEdge,
        edgeToEdge ? { width: winW } : null,
      ]}
      accessibilityLabel={t('profileFeedPostsSection')}
    >
      <View style={[styles.grid, { width: gridMetrics.width }]}>
        {items.map((it, i) => {
          const cellStyle = profileFeedCellSize(i, gridMetrics);
          return (
        <TouchableOpacity
          key={it.id}
          activeOpacity={0.86}
          onPress={() => onOpen(it.id)}
          onLongPress={() => onLongPressItem(it)}
          delayLongPress={280}
          style={[
            styles.cell,
            cellStyle,
          ]}
        >
          {it.kind === 'text' ? (
            <View style={styles.textCell}>
              <Text style={styles.textCellContent} numberOfLines={4}>
                {it.textPreview}
              </Text>
            </View>
          ) : it.thumbUrl ? (
            <CachedImage uri={it.thumbUrl} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.fallbackBox]} />
          )}
          {it.kind === 'video' ? (
            <View style={styles.playBadge} pointerEvents="none">
              <Ionicons name="play" size={18} color="#fff" />
            </View>
          ) : null}
          {showEngagementOverlay && (it.likesCount || it.commentsCount || it.viewsCount) ? (
            <View style={styles.engagementOverlay} pointerEvents="none">
              {it.likesCount ? (
                <Text style={styles.engagementText}>❤️ {formatStatCompact(it.likesCount, lang)}</Text>
              ) : null}
              {it.commentsCount ? (
                <Text style={styles.engagementText}>💬 {formatStatCompact(it.commentsCount, lang)}</Text>
              ) : null}
              {it.viewsCount ? (
                <Text style={styles.engagementText}>👁 {formatStatCompact(it.viewsCount, lang)}</Text>
              ) : null}
            </View>
          ) : null}
        </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadWrap: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyBlock: {
    paddingVertical: 8,
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.textMuted,
  },
  gridOuter: { width: '100%' },
  gridOuterEdge: { marginHorizontal: -PROFILE_BODY_HPAD },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: theme.colors.borderLight,
  },
  textCell: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
    padding: 8,
    justifyContent: 'center',
  },
  textCellContent: {
    fontSize: 12,
    lineHeight: 16,
    color: theme.colors.text,
    fontWeight: '500',
  },
  fallbackBox: {
    backgroundColor: theme.colors.borderLight,
  },
  playBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  engagementOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 5,
    paddingVertical: 5,
    backgroundColor: 'rgba(0,0,0,0.45)',
    gap: 1,
  },
  engagementText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 12,
  },
});
