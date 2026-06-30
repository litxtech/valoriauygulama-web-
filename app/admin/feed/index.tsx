import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard } from '@/components/admin';
import { CachedImage } from '@/components/CachedImage';
import { removeFeedMediaObjectsForPostUrls } from '@/lib/feedMediaStorageDelete';

type FeedPostRow = {
  id: string;
  title: string | null;
  media_type: 'image' | 'video' | 'text';
  media_url: string | null;
  thumbnail_url: string | null;
  created_at: string;
  staff: { full_name: string | null; department: string | null } | null;
};

export default function AdminFeedScreen() {
  const router = useRouter();
  const [feedPosts, setFeedPosts] = useState<FeedPostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [visibleFeedCount, setVisibleFeedCount] = useState(30);

  const load = async () => {
    setRefreshing(true);
    const { data, error } = await supabase
      .from('feed_posts')
      .select('id, title, media_type, media_url, thumbnail_url, created_at, staff:staff_id(full_name, department)')
      .order('created_at', { ascending: false })
      .limit(50);
    // Geçici hatada mevcut listeyi silme (boş ekran flaşını önler).
    if (!error) setFeedPosts((data ?? []) as FeedPostRow[]);
    setRefreshing(false);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setVisibleFeedCount(30);
  }, [feedPosts]);

  const handleDeletePost = (post: FeedPostRow) => {
    Alert.alert(
      'Paylaşımı sil',
      'Bu paylaşım kalıcı olarak silinecek. Emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('feed_posts').delete().eq('id', post.id);
            if (error) {
              Alert.alert('Hata', error.message);
              return;
            }
            await removeFeedMediaObjectsForPostUrls([post.media_url, post.thumbnail_url]);
            setFeedPosts((prev) => prev.filter((p) => p.id !== post.id));
          },
        },
      ]
    );
  };

  const feedPreviewUri = (p: FeedPostRow) =>
    p.thumbnail_url || (p.media_type === 'image' ? p.media_url : null);

  if (loading && feedPosts.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={adminTheme.colors.accent} />
      }
    >
      <AdminCard>
        <View style={styles.sectionHeadRow}>
          <TouchableOpacity
            onPress={() => router.push('/customer')}
            activeOpacity={0.8}
            style={styles.sectionLinkBtn}
          >
            <Text style={styles.sectionLink}>Misafir uygulamasında aç</Text>
            <Ionicons name="open-outline" size={18} color={adminTheme.colors.accent} />
          </TouchableOpacity>
        </View>
        {feedPosts.length === 0 ? (
          <Text style={styles.feedEmpty}>Henüz paylaşım yok.</Text>
        ) : (
          feedPosts.slice(0, visibleFeedCount).map((p, idx) => {
            const previewUri = feedPreviewUri(p);
            let previewContent: React.ReactNode;
            if (p.media_type === 'image' && previewUri) {
              previewContent = (
                <CachedImage uri={previewUri} style={styles.feedPreviewImage} contentFit="cover" />
              );
            } else if (p.media_type === 'video') {
              previewContent = previewUri ? (
                <CachedImage uri={previewUri} style={styles.feedPreviewImage} contentFit="cover" />
              ) : (
                <View style={styles.feedPreviewPlaceholder}>
                  <Ionicons name="videocam" size={24} color={adminTheme.colors.accent} />
                </View>
              );
            } else {
              previewContent = (
                <View style={styles.feedPreviewPlaceholder}>
                  <Ionicons name="document-text" size={24} color={adminTheme.colors.textMuted} />
                </View>
              );
            }
            const title =
              p.title ||
              (p.media_type === 'video'
                ? 'Video'
                : p.media_type === 'image'
                  ? 'Fotoğraf'
                  : 'Metin paylaşımı');
            const author = (p.staff as { full_name?: string } | null)?.full_name ?? 'Personel';
            const dept = (p.staff as { department?: string } | null)?.department ?? null;
            const date = new Date(p.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
            return (
              <View key={p.id} style={styles.feedCard}>
                <View pointerEvents="none" style={styles.feedCardTopAccent} />
                <View style={styles.feedMediaWrap}>{previewContent}</View>
                <View style={styles.feedCardBody}>
                  <Text style={styles.feedCardTitle} numberOfLines={2}>
                    {title}
                  </Text>
                  <Text style={styles.feedCardMeta} numberOfLines={2}>
                    {author}
                    {dept ? ` · ${dept}` : ''} · {date}
                  </Text>
                  <View style={styles.feedCardActions}>
                    <TouchableOpacity onPress={() => handleDeletePost(p)} style={styles.dangerPill} activeOpacity={0.8}>
                      <Ionicons name="trash-outline" size={18} color={adminTheme.colors.error} />
                      <Text style={styles.dangerPillText}>Sil</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })
        )}
        {feedPosts.length > visibleFeedCount ? (
          <TouchableOpacity style={styles.moreBtn} onPress={() => setVisibleFeedCount((c) => c + 30)} activeOpacity={0.85}>
            <Text style={styles.moreBtnText}>Daha fazla göster</Text>
          </TouchableOpacity>
        ) : null}
      </AdminCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 20, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 15, color: adminTheme.colors.textMuted },
  sectionHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 16,
  },
  sectionLinkBtn: { flexDirection: 'row', alignItems: 'center' },
  sectionLink: {
    fontSize: 14,
    color: adminTheme.colors.accent,
    fontWeight: '600',
    marginRight: 6,
  },
  feedEmpty: {
    fontSize: 14,
    color: adminTheme.colors.textMuted,
    textAlign: 'center',
    paddingVertical: 24,
  },
  feedCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: `${adminTheme.colors.accent}22`,
    marginBottom: 10,
    overflow: 'hidden',
    ...Platform.select({
      ios: adminTheme.shadow.sm,
      android: { elevation: 2 },
    }),
  },
  feedCardTopAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: adminTheme.colors.accent,
    opacity: 0.9,
  },
  feedMediaWrap: {
    width: 72,
    height: 72,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: adminTheme.colors.surfaceTertiary,
  },
  feedPreviewImage: { width: 72, height: 72 },
  feedPreviewPlaceholder: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: adminTheme.colors.surfaceTertiary,
  },
  feedCardBody: { flex: 1, minWidth: 0, paddingTop: 2 },
  feedCardTitle: { fontSize: 15, fontWeight: '800', color: adminTheme.colors.text, letterSpacing: -0.2 },
  feedCardMeta: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 4, lineHeight: 16 },
  feedCardActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  dangerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: `${adminTheme.colors.error}10`,
    borderWidth: 1,
    borderColor: `${adminTheme.colors.error}33`,
  },
  dangerPillText: { fontSize: 13, fontWeight: '800', color: adminTheme.colors.error },
  moreBtn: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: adminTheme.colors.accent + '33',
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  moreBtnText: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.accent },
});
