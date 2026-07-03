import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import { supabase } from '@/lib/supabase';
import { removeFeedMediaObjectsForPostUrls } from '@/lib/feedMediaStorageDelete';
import { CachedImage } from '@/components/CachedImage';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { useCachedList } from '@/hooks/useCachedList';

type MyFeedPost = {
  id: string;
  title: string | null;
  created_at: string;
  media_type: string;
  media_url: string | null;
  thumbnail_url: string | null;
};

function previewImageUri(post: MyFeedPost): string | null {
  if (post.media_type === 'text') return null;
  if (post.thumbnail_url) return post.thumbnail_url;
  if (post.media_type === 'image' && post.media_url) return post.media_url;
  return null;
}

export default function CustomerMyPostsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { width: windowW } = useWindowDimensions();
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);

  const horizontalPad = theme.spacing.lg * 2;
  const previewWidth = useMemo(() => Math.max(0, windowW - horizontalPad), [windowW]);

  const fetchItems = useCallback(async () => {
    const guest = await getOrCreateGuestForCurrentSession();
    if (!guest?.guest_id) return [];
    const { data } = await supabase
      .from('feed_posts')
      .select('id, title, created_at, media_type, media_url, thumbnail_url')
      .eq('guest_id', guest.guest_id)
      .order('created_at', { ascending: false })
      .limit(120);
    return (data ?? []) as MyFeedPost[];
  }, []);

  const {
    items: myPosts,
    setItems: setMyPosts,
    loading,
    refreshing,
    refresh,
  } = useCachedList<MyFeedPost>({
    cacheKey: 'customer-my-posts',
    fetchItems,
  });

  const deletePost = (post: MyFeedPost) => {
    Alert.alert(t('deletePostTitle'), t('deletePostMessage'), [
      { text: t('cancelAction'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          setDeletingPostId(post.id);
          const { error } = await supabase.from('feed_posts').delete().eq('id', post.id);
          setDeletingPostId(null);
          if (error) {
            Alert.alert(t('error'), error.message || t('postDeleteFailed'));
            return;
          }
          await removeFeedMediaObjectsForPostUrls([post.media_url, post.thumbnail_url]);
          setMyPosts((prev) => prev.filter((p) => p.id !== post.id));
        },
      },
    ]);
  };

  if (loading && myPosts.length === 0) {
    return (
      <View style={styles.centered}>
        <View style={styles.centerBlock}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.hint}>{t('loadingSub')}</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior={Platform.OS === 'ios' ? 'never' : undefined}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.primary} />}
    >
      {myPosts.length === 0 ? (
        <Text style={styles.emptyText}>{t('myPostsEmpty')}</Text>
      ) : (
        myPosts.map((post) => {
          const uri = previewImageUri(post);
          const isVideo = post.media_type === 'video';
          const isText = post.media_type === 'text';
          const titleLine =
            (post.title ?? '').trim() || (isText ? t('myPostsTextPost') : t('myPostsGenericPost'));
          const rawLang = (i18n.language || 'tr').split('-')[0];
          const localeTag =
            rawLang === 'ar' ? 'ar-SA' : rawLang === 'en' ? 'en-GB' : rawLang === 'de' ? 'de-DE' : rawLang === 'fr' ? 'fr-FR' : rawLang === 'ru' ? 'ru-RU' : rawLang === 'es' ? 'es-ES' : 'tr-TR';
          const subtitle = new Date(post.created_at).toLocaleString(localeTag);

          return (
            <View key={post.id} style={styles.postCard}>
              <TouchableOpacity
                activeOpacity={0.92}
                onPress={() => router.push('/customer/feed/' + post.id)}
                style={[styles.previewTouchable, { width: previewWidth }]}
              >
                <View style={[styles.previewClip, { width: previewWidth }]}>
                  {isText ? (
                    <View style={styles.textPreview}>
                      <Ionicons name="document-text-outline" size={32} color={theme.colors.primary} />
                      <Text style={styles.textPreviewTitle} numberOfLines={5}>
                        {titleLine}
                      </Text>
                    </View>
                  ) : uri ? (
                    <View style={styles.previewImgWrap}>
                      <CachedImage uri={uri} style={StyleSheet.absoluteFill} contentFit="cover" />
                      {isVideo ? (
                        <View style={styles.playOverlay} pointerEvents="none">
                          <Ionicons name="play-circle" size={52} color="rgba(255,255,255,0.92)" />
                        </View>
                      ) : null}
                    </View>
                  ) : (
                    <View style={styles.placeholderPreview}>
                      <Ionicons name={isVideo ? 'videocam-outline' : 'image-outline'} size={40} color={theme.colors.textMuted} />
                      <Text style={styles.placeholderLabel}>{t('myPostsNoPreview')}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>

              <View style={styles.cardFooter}>
                <View style={styles.cardTextCol}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {titleLine}
                  </Text>
                  <Text style={styles.cardDate}>{subtitle}</Text>
                </View>
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    onPress={() => router.push('/customer/feed/' + post.id)}
                    style={styles.actionBtn}
                    activeOpacity={0.75}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="open-outline" size={22} color={theme.colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => deletePost(post)}
                    disabled={deletingPostId === post.id}
                    style={styles.actionBtn}
                    activeOpacity={0.75}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {deletingPostId === post.id ? (
                      <Text style={styles.busyText}>…</Text>
                    ) : (
                      <Ionicons name="trash-outline" size={22} color={theme.colors.error} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const PREVIEW_HEIGHT = 168;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.xxl,
    flexGrow: 1,
  },
  centered: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  centerBlock: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  hint: { fontSize: 14, color: theme.colors.textSecondary },
  emptyText: { fontSize: 15, color: theme.colors.textSecondary, lineHeight: 22, marginTop: theme.spacing.sm },
  postCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    marginBottom: theme.spacing.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  previewTouchable: {
    alignSelf: 'center',
  },
  previewClip: {
    height: PREVIEW_HEIGHT,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    overflow: 'hidden',
    backgroundColor: theme.colors.borderLight,
  },
  previewImgWrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1a1a1a',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  textPreview: {
    flex: 1,
    padding: theme.spacing.md,
    justifyContent: 'flex-start',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  textPreviewTitle: {
    fontSize: 15,
    lineHeight: 22,
    color: theme.colors.text,
    fontWeight: '600',
  },
  placeholderPreview: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  placeholderLabel: { fontSize: 13, color: theme.colors.textMuted, fontWeight: '600' },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  cardTextCol: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  cardDate: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundSecondary,
  },
  busyText: { color: theme.colors.textMuted, fontWeight: '800', fontSize: 16 },
});
