/**
 * Personel için misafir profil sayfası - akıştaki misafir avatarlarından tıklanınca.
 * Customer/guest sayfası staff'ı /staff'a yönlendirdiği için staff kendi rotasını kullanır.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useNavigation, usePathname, useRouter } from 'expo-router';
import { navigateStaffBack, STAFF_TABS_FALLBACK } from '@/lib/staffStackBack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { guestDisplayName } from '@/lib/guestDisplayName';
import { staffGetOrCreateDirectConversation } from '@/lib/messagingApi';

const AVATAR_SIZE = 100;

type GuestDetail = {
  id: string;
  full_name: string | null;
  photo_url: string | null;
};

type FeedPostRow = {
  id: string;
  title: string | null;
  media_type: string;
  media_url: string | null;
  thumbnail_url: string | null;
  created_at: string;
};

export default function StaffGuestProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const pathname = usePathname();
  const leaveGuest = () => navigateStaffBack(router, navigation, pathname, STAFF_TABS_FALLBACK);
  const insets = useSafeAreaInsets();
  const { staff } = useAuthStore();
  const [guest, setGuest] = useState<GuestDetail | null>(null);
  const [posts, setPosts] = useState<FeedPostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);
  const [messageLoading, setMessageLoading] = useState(false);

  const loadGuest = useCallback(async () => {
    if (!id) return;
    const { data: g, error: ge } = await supabase
      .from('guests')
      .select('id, full_name, photo_url')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (ge || !g) {
      setGuest(null);
      setLoading(false);
      return;
    }
    setGuest(g as GuestDetail);
    const { data: postsData } = await supabase
      .from('feed_posts')
      .select('id, title, media_type, media_url, thumbnail_url, created_at')
      .eq('guest_id', id)
      .in('visibility', ['customers', 'guests_only'])
      .order('created_at', { ascending: false })
      .limit(10);
    setPosts((postsData ?? []) as FeedPostRow[]);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadGuest();
  }, [loadGuest]);

  const handleMessage = async () => {
    if (!staff || !guest) return;
    setMessageLoading(true);
    try {
      const convId = await staffGetOrCreateDirectConversation(staff.id, guest.id, 'guest');
      setMessageLoading(false);
      if (convId) router.replace({ pathname: '/staff/chat/[id]', params: { id: convId } });
    } catch {
      setMessageLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top + 60 }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!guest) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top + 60 }]}>
        <Text style={styles.errorText}>Misafir bulunamadı</Text>
        <TouchableOpacity style={styles.backBtn} onPress={leaveGuest} activeOpacity={0.8}>
          <Text style={styles.backBtnText}>Geri dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const displayName = guestDisplayName(guest.full_name, 'Misafir');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}
    >
      <TouchableOpacity style={styles.header} onPress={leaveGuest} activeOpacity={0.8}>
        <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
      </TouchableOpacity>

      <View style={styles.profileBlock}>
        <TouchableOpacity
          style={styles.avatarWrap}
          onPress={() => guest.photo_url && setAvatarModalVisible(true)}
          activeOpacity={1}
        >
          {guest.photo_url ? (
            <CachedImage uri={guest.photo_url} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarLetter}>{displayName.charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </TouchableOpacity>
        <Text style={styles.name}>{displayName}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Misafir</Text>
        </View>
        <TouchableOpacity
          style={styles.messageBtn}
          onPress={handleMessage}
          disabled={messageLoading}
          activeOpacity={0.8}
        >
          {messageLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="chatbubble-outline" size={18} color="#fff" />
              <Text style={styles.messageBtnText}>Mesaj gönder</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {posts.length > 0 ? (
        <View style={styles.postsSection}>
          {posts.map((p) => (
            <View key={p.id} style={styles.postCard}>
              {p.thumbnail_url || (p.media_type === 'image' && p.media_url) ? (
                <CachedImage
                  uri={p.thumbnail_url || p.media_url || ''}
                  style={styles.postThumb}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.postThumb, styles.postThumbPlaceholder]}>
                  <Ionicons name="image-outline" size={32} color={theme.colors.textMuted} />
                </View>
              )}
              <View style={styles.postInfo}>
                <Text style={styles.postTitle} numberOfLines={1}>
                  {p.title || (p.media_type === 'video' ? 'Video' : 'Fotoğraf')}
                </Text>
                <Text style={styles.postDate}>{new Date(p.created_at).toLocaleDateString('tr-TR')}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyPosts}>
          <Ionicons name="images-outline" size={48} color={theme.colors.textMuted} />
          <Text style={styles.emptyText}>Henüz paylaşım yok</Text>
        </View>
      )}
      <ImagePreviewModal
        visible={avatarModalVisible}
        uri={guest.photo_url ?? null}
        onClose={() => setAvatarModalVisible(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { paddingHorizontal: theme.spacing.lg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  profileBlock: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 24,
  },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
    marginBottom: 12,
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    backgroundColor: theme.colors.guestAvatarBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: { fontSize: 40, fontWeight: '700', color: theme.colors.guestAvatarLetter },
  name: { fontSize: 22, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.primaryLight + '30',
    marginBottom: 16,
  },
  badgeText: { fontSize: 13, fontWeight: '600', color: theme.colors.primary },
  messageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  messageBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  postsSection: { marginTop: 8 },
  postCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    ...theme.shadows.sm,
  },
  postThumb: {
    width: 80,
    height: 80,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  postThumbPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  postInfo: { flex: 1, padding: 12, justifyContent: 'center' },
  postTitle: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  postDate: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
  emptyPosts: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: { fontSize: 15, color: theme.colors.textMuted, marginTop: 12 },
  errorText: { fontSize: 16, color: theme.colors.textMuted, marginBottom: 16 },
  backBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
  },
  backBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
