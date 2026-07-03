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
  loadGuestProfileFeedPreviews,
  type GuestProfileFeedFilter,
  type GuestFeedVisibility,
  type GuestProfileFeedPreview,
} from '@/lib/guestProfileFeedThumbnails';
import { loadFeedPostEngagementCounts } from '@/lib/feedPostEngagementCounts';
import { formatStatCompact } from '@/lib/modernProfileTenure';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { removeFeedMediaObjectsForPostUrls } from '@/lib/feedMediaStorageDelete';
import { computeProfileFeedGridMetrics, profileFeedCellSize } from '@/lib/profileFeedGridLayout';

const GAP = 1;
/** TikTokProfileBody paddingHorizontal — edgeToEdge grid breaks out to full width */
const PROFILE_BODY_HPAD = 16;

type Props = {
  guestId: string;
  visibility?: GuestFeedVisibility;
  showEmptyHint?: boolean;
  allowOwnPostDelete?: boolean;
  viewerGuestId?: string | null;
  edgeToEdge?: boolean;
  feedFilter?: GuestProfileFeedFilter;
  showEngagementOverlay?: boolean;
};

export function GuestProfileFeedGrid({
  guestId,
  visibility = 'own',
  showEmptyHint = true,
  allowOwnPostDelete = false,
  viewerGuestId = null,
  edgeToEdge = false,
  feedFilter = 'all',
  showEngagementOverlay = true,
}: Props) {
  const { width: winW } = useWindowDimensions();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'tr';
  const [items, setItems] = useState<GuestProfileFeedPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [gridW, setGridW] = useState(0);
  const loadSeqRef = useRef(0);

  const gridWidth = edgeToEdge ? winW : gridW > 0 ? gridW : Math.max(0, winW - PROFILE_BODY_HPAD * 2);
  const gridMetrics = computeProfileFeedGridMetrics(gridWidth, GAP);

  const onGridLayout = useCallback((e: LayoutChangeEvent) => {
    if (!edgeToEdge) setGridW(e.nativeEvent.layout.width);
  }, [edgeToEdge]);

  const load = useCallback(async () => {
    if (!guestId) return;
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setErr(null);
    const { items: row, error } = await loadGuestProfileFeedPreviews(guestId, 30, feedFilter, visibility, false);
    if (seq !== loadSeqRef.current) return;
    if (error) {
      setErr(error.message);
      setItems([]);
      setLoading(false);
      return;
    }
    setItems(row);
    setLoading(false);

    if (showEngagementOverlay && row.length > 0) {
      const ids = row.map((it) => it.id);
      const counts = await loadFeedPostEngagementCounts(ids);
      if (seq !== loadSeqRef.current) return;
      setItems((prev) =>
        prev.map((it) => {
          const c = counts.get(it.id);
          return c
            ? { ...it, likesCount: c.likes, commentsCount: c.comments, viewsCount: c.views }
            : it;
        })
      );
    }
  }, [guestId, feedFilter, visibility, showEngagementOverlay]);

  useEffect(() => {
    load();
  }, [load]);

  const onOpen = (id: string) => {
    router.push({ pathname: '/customer/feed/[id]', params: { id } } as Href);
  };

  const onLongPressItem = (item: GuestProfileFeedPreview) => {
    if (!allowOwnPostDelete) return;
    Alert.alert(t('deletePostTitle'), t('deletePostMessage'), [
      { text: t('cancelAction'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          const { data: row } = await supabase
            .from('feed_posts')
            .select('id, guest_id, media_url, thumbnail_url')
            .eq('id', item.id)
            .maybeSingle();
          if (!row || (viewerGuestId && row.guest_id !== viewerGuestId)) {
            Alert.alert(t('error'), t('recordError'));
            return;
          }
          const { data, error } = await supabase.from('feed_posts').delete().eq('id', item.id).select('id');
          if (error || !data?.length) {
            Alert.alert(t('error'), error?.message ?? t('recordError'));
            return;
          }
          await removeFeedMediaObjectsForPostUrls([row.media_url, row.thumbnail_url]);
          setItems((prev) => prev.filter((x) => x.id !== item.id));
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadWrap}>
        <ActivityIndicator color={theme.colors.primary} size="small" />
      </View>
    );
  }
  if (err) return null;
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
  loadWrap: { paddingVertical: 32, alignItems: 'center' },
  emptyBlock: { paddingVertical: 32, paddingHorizontal: 24 },
  emptyText: { textAlign: 'center', fontSize: 14, color: theme.colors.textMuted },
  gridOuter: { width: '100%' },
  gridOuterEdge: { marginHorizontal: -PROFILE_BODY_HPAD },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { backgroundColor: theme.colors.borderLight, overflow: 'hidden' },
  textCell: {
    flex: 1,
    padding: 8,
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  textCellContent: { fontSize: 11, color: theme.colors.text, lineHeight: 15 },
  fallbackBox: { backgroundColor: theme.colors.borderLight },
  playBadge: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  engagementOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 4,
    backgroundColor: 'rgba(0,0,0,0.35)',
    gap: 2,
  },
  engagementText: { fontSize: 9, fontWeight: '700', color: '#fff' },
});
