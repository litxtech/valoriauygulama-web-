/**
 * Harita içinde gönderi detayı — sayfaya gitmeden sheet ile açılır.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video } from 'expo-av';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { StaffNameWithBadge } from '@/components/VerifiedBadge';
import { CachedImage } from '@/components/CachedImage';
import { getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import { guestDisplayName, isOpaqueGuestDisplayString } from '@/lib/guestDisplayName';
import { recordGuestFeedPostViews } from '@/lib/feedPostViewers';
import { useAuthStore } from '@/stores/authStore';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { getHiddenUsersForGuest } from '@/lib/userBlocks';
import { useRouter } from 'expo-router';
import { removeFeedMediaObjectsForPostUrls } from '@/lib/feedMediaStorageDelete';
import { MentionableText } from '@/components/MentionableText';
import { searchStaffMentionCandidates, type StaffMentionCandidate } from '@/lib/staffMentions';

type PostRow = {
  id: string;
  media_type: string;
  media_url: string | null;
  thumbnail_url: string | null;
  title: string | null;
  created_at: string;
  staff_id: string | null;
  guest_id: string | null;
  lat?: number | null;
  lng?: number | null;
  location_label?: string | null;
  staff: { full_name: string | null; department: string | null; verification_badge?: 'blue' | 'yellow' | null; profile_image?: string | null } | null;
  guest: { full_name: string | null; photo_url?: string | null } | null;
};

type CommentRow = {
  id: string;
  content: string;
  created_at: string;
  staff_id?: string | null;
  guest_id?: string | null;
  staff: { full_name: string | null; profile_image?: string | null } | null;
  guest: { full_name: string | null; photo_url?: string | null } | null;
};

type MapPostDetailSheetProps = {
  visible: boolean;
  postId: string | null;
  onClose: () => void;
  /** Gönderi silindikten sonra harita listesini yenilemek için */
  onPostDeleted?: () => void;
  /** Gönderi artık yoksa (silindi / görünürlük değişti): haritadaki pini kaldır */
  onPostUnavailable?: (postId: string) => void;
};

function getDisplayName(): string {
  const { user } = useAuthStore.getState();
  if (!user) return 'Misafir';
  const name = user.user_metadata?.full_name ?? user.user_metadata?.name;
  if (name && typeof name === 'string') {
    const t = name.trim();
    if (t && !isOpaqueGuestDisplayString(t)) return t;
  }
  const email = user.email ?? '';
  const part = email.split('@')[0];
  if (part) {
    const cap = part.charAt(0).toUpperCase() + part.slice(1);
    if (!isOpaqueGuestDisplayString(cap)) return cap;
  }
  return 'Misafir';
}

export default function MapPostDetailSheet({ visible, postId, onClose, onPostDeleted, onPostUnavailable }: MapPostDetailSheetProps) {
  const router = useRouter();
  const { width: winWidth } = useWindowDimensions();
  const [post, setPost] = useState<PostRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [myLike, setMyLike] = useState(false);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentText, setCommentText] = useState('');
  const [togglingLike, setTogglingLike] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [mentionDirectory, setMentionDirectory] = useState<StaffMentionCandidate[]>([]);
  /** Mevcut oturumdaki misafir id (sil butonu / kendi gönderisi kontrolü) */
  const [myGuestId, setMyGuestId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    searchStaffMentionCandidates('', 700)
      .then((rows) => setMentionDirectory(rows))
      .catch(() => setMentionDirectory([]));
  }, []);

  const resolveMentionHref = useCallback(
    (token: string) => {
      const normalized = token.trim().toLocaleLowerCase('tr-TR');
      if (!normalized) return null;
      const target = mentionDirectory.find((row) => {
        const fullName = (row.full_name ?? '').trim();
        if (!fullName) return false;
        return fullName
          .toLocaleLowerCase('tr-TR')
          .split(/\s+/)
          .some((part) => part.startsWith(normalized));
      });
      return target?.id ? `/customer/staff/${target.id}` : null;
    },
    [mentionDirectory]
  );

  const loadPost = useCallback(async () => {
    if (!postId) return;
    const guestRow = await getOrCreateGuestForCurrentSession();
    setMyGuestId(guestRow?.guest_id ?? null);
    const hidden = guestRow?.guest_id
      ? await getHiddenUsersForGuest(guestRow.guest_id)
      : { hiddenStaffIds: new Set<string>(), hiddenGuestIds: new Set<string>() };
    const { data, error: e } = await supabase
      .from('feed_posts')
      .select('id, media_type, media_url, thumbnail_url, title, created_at, staff_id, guest_id, lat, lng, location_label, staff:staff_id(full_name, department, verification_badge, profile_image), guest:guest_id(full_name, photo_url)')
      .eq('id', postId)
      .eq('visibility', 'customers')
      .maybeSingle();
    if (e) {
      setPost(null);
      return;
    }
    const postRow = data as PostRow | null;
    const hiddenPost = postRow
      ? (postRow.staff_id && hidden.hiddenStaffIds.has(postRow.staff_id)) ||
        (postRow.guest_id && hidden.hiddenGuestIds.has(postRow.guest_id))
      : false;
    if (hiddenPost) {
      setPost(null);
      return;
    }
    if (!postRow) {
      setPost(null);
      onPostUnavailable?.(postId);
      return;
    }
    setPost(postRow);
    const [reactionsRes, commentsRes, myRes] = await Promise.all([
      supabase.from('feed_post_reactions').select('post_id').eq('post_id', postId),
      supabase.from('feed_post_comments').select('id, staff_id, guest_id, content, created_at, staff:staff_id(full_name, profile_image), guest:guest_id(full_name, photo_url)').eq('post_id', postId).order('created_at', { ascending: true }),
      guestRow ? supabase.from('feed_post_reactions').select('post_id').eq('post_id', postId).eq('guest_id', guestRow.guest_id) : Promise.resolve({ data: [] as { post_id: string }[] }),
    ]);
    const reactions = (reactionsRes.data ?? []) as { post_id: string }[];
    const commentList = ((commentsRes.data ?? []) as CommentRow[]).filter(
      (c) =>
        !(c.staff_id && hidden.hiddenStaffIds.has(c.staff_id)) &&
        !(c.guest_id && hidden.hiddenGuestIds.has(c.guest_id))
    );
    const myReactions = (myRes.data ?? []) as { post_id: string }[];
    setLikeCount(reactions.length);
    setCommentCount(commentList.length);
    setComments(commentList);
    setMyLike(myReactions.length > 0);
    if (guestRow) {
      void recordGuestFeedPostViews([postId], guestRow.guest_id);
    }
  }, [postId, onPostUnavailable]);

  useEffect(() => {
    if (!visible || !postId) {
      setPost(null);
      setLoading(true);
      setMyGuestId(null);
      return;
    }
    setLoading(true);
    loadPost().then(() => setLoading(false));
  }, [visible, postId, loadPost]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadPost();
    } finally {
      setRefreshing(false);
    }
  }, [loadPost]);

  const toggleLike = async () => {
    if (!post) return;
    const guestRow = await getOrCreateGuestForCurrentSession();
    if (!guestRow?.guest_id) {
      Alert.alert('Giriş gerekli', 'Beğenmek için giriş yapın.');
      return;
    }
    setTogglingLike(true);
    try {
      if (myLike) {
        await supabase.from('feed_post_reactions').delete().eq('post_id', post.id).eq('guest_id', guestRow.guest_id);
        setMyLike(false);
        setLikeCount((c) => Math.max(0, c - 1));
      } else {
        await supabase.from('feed_post_reactions').insert({ post_id: post.id, guest_id: guestRow.guest_id, reaction: 'like' });
        setMyLike(true);
        setLikeCount((c) => c + 1);
      }
    } catch (_) {}
    setTogglingLike(false);
  };

  const submitComment = async () => {
    if (!post) return;
    const guestRow = await getOrCreateGuestForCurrentSession();
    if (!guestRow?.guest_id) {
      Alert.alert('Giriş gerekli', 'Yorum yapmak için giriş yapın.');
      return;
    }
    const text = commentText.trim();
    if (!text) return;
    setPostingComment(true);
    try {
      const { data: inserted } = await supabase
        .from('feed_post_comments')
        .insert({ post_id: post.id, guest_id: guestRow.guest_id, content: text })
        .select('id, content, created_at')
        .single();
    const displayName = getDisplayName();
    setCommentText('');
    setComments((prev) => [...prev, { id: (inserted as { id: string }).id, content: text, created_at: (inserted as { created_at: string }).created_at, staff: null, guest: { full_name: displayName } }]);
      setCommentCount((c) => c + 1);
    } catch (_) {}
    setPostingComment(false);
  };

  const deletePost = async () => {
    if (!post) return;
    const isOwn = post.guest_id && myGuestId && post.guest_id === myGuestId && !post.staff_id;
    if (!isOwn) return;
    const guestRow = await getOrCreateGuestForCurrentSession();
    if (!guestRow?.guest_id || post.guest_id !== guestRow.guest_id) return;
    Alert.alert('Paylaşımı sil', 'Bu paylaşım kalıcı olarak silinecek.', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          const { error } = await supabase.from('feed_posts').delete().eq('id', post.id);
          setDeleting(false);
          if (error) {
            Alert.alert('Hata', error.message || 'Paylaşım silinemedi.');
            return;
          }
          await removeFeedMediaObjectsForPostUrls([post.media_url, post.thumbnail_url]);
          onClose();
          onPostDeleted?.();
        },
      },
    ]);
  };

  if (!visible) return null;

  const rawStaff = post?.staff as { full_name?: string; department?: string; verification_badge?: 'blue' | 'yellow' | null; profile_image?: string | null } | null;
  const rawGuest = post?.guest as { full_name?: string | null; photo_url?: string | null } | null;
  const authorName = post?.staff_id
    ? (rawStaff?.full_name?.trim() || 'Personel')
    : guestDisplayName(rawGuest?.full_name, 'Misafir');
  const authorAvatarUrl = rawStaff?.profile_image ?? rawGuest?.photo_url ?? null;
  const badge = rawStaff?.verification_badge ?? null;
  const dept = rawStaff?.department;
  const profileHref = post?.staff_id
    ? (`/customer/staff/${post.staff_id}` as const)
    : post?.guest_id
      ? (`/customer/guest/${post.guest_id}` as const)
      : null;
  const imageUri = post?.media_type !== 'text' ? (post?.thumbnail_url || post?.media_url) : null;
  const mediaUri = post?.media_type === 'image' ? post?.media_url : (post?.thumbnail_url || post?.media_url);
  const isVideo = post?.media_type === 'video';
  const hasLocation = post && ((post.lat != null && post.lng != null) || (post.location_label?.trim()));
  const isOwnGuestPost =
    !!post && !!post.guest_id && !!myGuestId && post.guest_id === myGuestId && !post.staff_id;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Paylaşım</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          ) : !post ? (
            <View style={styles.centered}>
              <Text style={styles.errorText}>Paylaşım bulunamadı.</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={theme.colors.primary}
                  colors={[theme.colors.primary]}
                />
              }
            >
              {hasLocation && (
                <View style={styles.locationBar}>
                  <Ionicons name="location" size={14} color={theme.colors.primary} />
                  <Text style={styles.locationText} numberOfLines={1}>
                    {post.location_label?.trim() || '📍 Haritadan paylaşıldı'}
                  </Text>
                </View>
              )}
              {imageUri || mediaUri ? (
                isVideo ? (
                  <View style={[styles.mediaWrap, { width: winWidth - 48 }]}>
                    <Video
                      source={{ uri: post.media_url ?? undefined }}
                      style={styles.video}
                      useNativeControls
                      resizeMode="contain"
                      isLooping={false}
                    />
                  </View>
                ) : (
                  <CachedImage uri={mediaUri ?? undefined} style={[styles.image, { width: winWidth - 48 }]} contentFit="cover" />
                )
              ) : (
                <View style={[styles.textOnlyBlock, { width: winWidth - 48 }]}>
                  <Text style={styles.textOnlyTitle}>{post.title || 'Metin paylaşımı'}</Text>
                </View>
              )}
              <View style={styles.body}>
                <Text style={styles.title}>{post.title || (isVideo ? 'Video' : post.media_type === 'text' ? 'Metin' : 'Fotoğraf')}</Text>
                <View style={styles.metaRow}>
                  {post.staff_id ? (
                    <>
                      <StaffNameWithBadge name={authorName} badge={badge} textStyle={styles.metaText} />
                      {dept ? <Text style={styles.metaText}> · {dept}</Text> : null}
                    </>
                  ) : (
                    <Text style={styles.metaText}>{authorName}</Text>
                  )}
                </View>
                <View style={styles.cardActionsRow}>
                  {profileHref && (
                    <TouchableOpacity
                      style={styles.profileBtn}
                      onPress={() => {
                        onClose();
                        router.push(profileHref);
                      }}
                      activeOpacity={0.7}
                    >
                      {authorAvatarUrl ? (
                        <CachedImage uri={authorAvatarUrl} style={styles.profileBtnAvatar} contentFit="cover" />
                      ) : (
                        <View style={[styles.profileBtnAvatar, post.staff_id ? styles.profileBtnAvatarPlaceholder : styles.profileBtnAvatarPlaceholderGuest]}>
                          <Text style={post.staff_id ? styles.profileBtnAvatarInitial : styles.profileBtnAvatarInitialGuest}>{authorName.charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                      <Text style={styles.profileBtnText}>Profile'a Git</Text>
                      <Ionicons name="chevron-forward" size={18} color={theme.colors.primary} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.gotoPostBtn}
                    onPress={() => {
                      onClose();
                      router.push(`/customer/feed/${post.id}`);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="newspaper-outline" size={22} color={theme.colors.primary} />
                    <Text style={styles.gotoPostBtnText}>Gönderiye Git</Text>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.primary} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.date}>{new Date(post.created_at).toLocaleString('tr-TR')}</Text>
                <View style={styles.actionsRow}>
                  <TouchableOpacity style={styles.actionBtn} onPress={toggleLike} disabled={togglingLike} activeOpacity={0.7}>
                    {togglingLike ? <ActivityIndicator size="small" color={theme.colors.textMuted} /> : <Ionicons name={myLike ? 'heart' : 'heart-outline'} size={22} color={myLike ? theme.colors.error : theme.colors.text} />}
                    <Text style={styles.actionCount}>{likeCount}</Text>
                  </TouchableOpacity>
                  <View style={styles.actionBtn}>
                    <Ionicons name="chatbubble-outline" size={20} color={theme.colors.text} />
                    <Text style={styles.actionCount}>{commentCount}</Text>
                  </View>
                  {isOwnGuestPost ? (
                    <TouchableOpacity style={styles.actionBtn} onPress={deletePost} disabled={deleting} activeOpacity={0.7}>
                      {deleting ? <ActivityIndicator size="small" color={theme.colors.error} /> : <Ionicons name="trash-outline" size={22} color={theme.colors.error} />}
                      <Text style={[styles.actionCount, styles.deleteActionLabel]}>Sil</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
              {comments.length > 0 && (
                <View style={styles.commentsBlock}>
                  <Text style={styles.commentsTitle}>Yorumlar</Text>
                  {comments.map((c) => {
                    const isGuestComment = !c.staff_id && !!c.guest_id;
                    const cAuthor = isGuestComment
                      ? guestDisplayName(c.guest?.full_name, '—')
                      : ((c.staff?.full_name ?? '—').trim() || '—');
                    const avatarUri = c.staff?.profile_image ?? c.guest?.photo_url ?? null;
                    const profileHref = c.staff_id ? `/customer/staff/${c.staff_id}` : c.guest_id ? `/customer/guest/${c.guest_id}` : null;
                    return (
                      <View
                        key={c.id}
                        style={styles.commentRow}
                      >
                        <TouchableOpacity
                          onPress={() => profileHref && router.push(profileHref)}
                          activeOpacity={profileHref ? 0.7 : 1}
                          disabled={!profileHref}
                        >
                          {avatarUri ? (
                            <CachedImage uri={avatarUri} style={styles.commentAvatar} contentFit="cover" />
                          ) : (
                            <View style={isGuestComment ? styles.commentAvatarPlaceholderGuest : styles.commentAvatarPlaceholder}>
                              <Text style={isGuestComment ? styles.commentAvatarInitialGuest : styles.commentAvatarInitial}>{(cAuthor || '—').charAt(0).toUpperCase()}</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                        <View style={styles.commentRowBody}>
                          <TouchableOpacity
                            onPress={() => profileHref && router.push(profileHref)}
                            activeOpacity={profileHref ? 0.7 : 1}
                            disabled={!profileHref}
                          >
                            <Text style={styles.commentAuthor}>{cAuthor}</Text>
                          </TouchableOpacity>
                          <MentionableText
                            text={c.content}
                            textStyle={styles.commentText}
                            mentionStyle={styles.commentMention}
                            resolveMentionHref={resolveMentionHref}
                            onMentionPress={(href) => router.push(href)}
                          />
                          <Text style={styles.commentTime}>{formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: tr })}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.commentInputWrap}>
                <TextInput
                  style={styles.commentInput}
                  placeholder="Yorum yaz..."
                  placeholderTextColor={theme.colors.textMuted}
                  value={commentText}
                  onChangeText={setCommentText}
                  multiline
                  maxLength={500}
                  editable={!postingComment}
                />
                <TouchableOpacity
                  style={[styles.commentSendBtn, (!commentText.trim() || postingComment) && styles.commentSendBtnDisabled]}
                  onPress={submitComment}
                  disabled={!commentText.trim() || postingComment}
                  activeOpacity={0.8}
                >
                  {postingComment ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={20} color="#fff" />}
                </TouchableOpacity>
              </KeyboardAvoidingView>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  handle: { width: 40, height: 4, backgroundColor: theme.colors.borderLight, borderRadius: 2, alignSelf: 'center', marginTop: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  closeBtn: { padding: 8 },
  centered: { padding: 40 },
  errorText: { fontSize: 15, color: theme.colors.textMuted },
  scroll: { maxHeight: 600 },
  content: { paddingBottom: 40 },
  locationBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 6 },
  locationText: { fontSize: 13, color: theme.colors.primary, fontWeight: '600', flex: 1 },
  mediaWrap: { aspectRatio: 1, backgroundColor: theme.colors.borderLight, alignSelf: 'center' },
  video: { width: '100%', height: '100%' },
  image: { aspectRatio: 1, backgroundColor: theme.colors.borderLight, alignSelf: 'center' },
  textOnlyBlock: { padding: 24, backgroundColor: theme.colors.borderLight + '60', minHeight: 100, justifyContent: 'center', alignSelf: 'center' },
  textOnlyTitle: { fontSize: 18, fontWeight: '600', color: theme.colors.text },
  body: { padding: 20 },
  title: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 },
  metaText: { fontSize: 14, color: theme.colors.textSecondary },
  cardActionsRow: { marginTop: 12, gap: 10 },
  profileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.primary + '15',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.primary + '30',
  },
  gotoPostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.primary + '15',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.primary + '30',
  },
  gotoPostBtnText: { flex: 1, fontSize: 15, fontWeight: '600', color: theme.colors.primary },
  profileBtnAvatar: { width: 40, height: 40, borderRadius: 20 },
  profileBtnAvatarPlaceholder: {
    backgroundColor: theme.colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileBtnAvatarPlaceholderGuest: {
    backgroundColor: theme.colors.guestAvatarBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileBtnAvatarInitial: { fontSize: 18, fontWeight: '700', color: theme.colors.textSecondary },
  profileBtnAvatarInitialGuest: { fontSize: 18, fontWeight: '700', color: theme.colors.guestAvatarLetter },
  profileBtnText: { flex: 1, fontSize: 15, fontWeight: '600', color: theme.colors.primary },
  date: { fontSize: 12, color: theme.colors.textMuted, marginTop: 8 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.borderLight },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionCount: { fontSize: 13, color: theme.colors.textSecondary },
  deleteActionLabel: { color: theme.colors.error },
  commentsBlock: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.borderLight },
  commentsTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginBottom: 10 },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 10 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16 },
  commentAvatarPlaceholder: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.borderLight, justifyContent: 'center', alignItems: 'center' },
  commentAvatarPlaceholderGuest: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.guestAvatarBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentAvatarInitial: { fontSize: 14, fontWeight: '700', color: theme.colors.textSecondary },
  commentAvatarInitialGuest: { fontSize: 14, fontWeight: '700', color: theme.colors.guestAvatarLetter },
  commentRowBody: { flex: 1, minWidth: 0 },
  commentAuthor: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  commentText: { fontSize: 14, color: theme.colors.text, marginTop: 2 },
  commentMention: { color: '#0095f6', fontWeight: '700', textDecorationLine: 'underline' },
  commentTime: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  commentInputWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 20 },
  commentInput: { flex: 1, borderWidth: 1, borderColor: theme.colors.borderLight, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: theme.colors.text, maxHeight: 100 },
  commentSendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center' },
  commentSendBtnDisabled: { opacity: 0.5 },
});
