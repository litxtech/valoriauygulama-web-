import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useTranslation } from 'react-i18next';
import { StaffNameWithBadge } from '@/components/VerifiedBadge';
import { CachedImage } from '@/components/CachedImage';
import { getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import { guestDisplayName, isOpaqueGuestDisplayString } from '@/lib/guestDisplayName';
import { sendNotification } from '@/lib/notificationService';
import { useAuthStore } from '@/stores/authStore';
import { formatDistanceToNow } from 'date-fns';
import { dateFnsLocaleForApp } from '@/lib/dateFnsLocale';
import i18n from '@/i18n';
import { getHiddenUsersForGuest } from '@/lib/userBlocks';
import { removeFeedMediaObjectsForPostUrls } from '@/lib/feedMediaStorageDelete';
import { FeedMediaCarousel } from '@/components/FeedMediaCarousel';
import { resolveMentionedStaffIdsFromText } from '@/lib/staffMentions';
import { searchStaffMentionCandidates, type StaffMentionCandidate } from '@/lib/staffMentions';
import { MentionableText } from '@/components/MentionableText';
import { displayStaffNameForViewer } from '@/lib/staffProfilePrivacy';
import { recordGuestFeedPostViews } from '@/lib/feedPostViewers';

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
  staff: { full_name: string | null; department: string | null; verification_badge?: 'blue' | 'yellow' | null; profile_hidden_by_admin?: boolean | null } | null;
  guest: { full_name: string | null } | null;
  media_items?: { id: string; media_type: 'image' | 'video'; media_url: string; thumbnail_url: string | null; sort_order: number }[];
};

type FeedDetailMediaItem = { id: string; media_type: 'image' | 'video'; media_url: string; thumbnail_url: string | null; sort_order: number };

/** feed_post_media_items veya feed_posts legacy tek medya — overlay / carousel ile aynı kaynak */
function buildFeedPostMediaItems(post: PostRow): FeedDetailMediaItem[] {
  if (post.media_items && post.media_items.length > 0) {
    return post.media_items;
  }
  if (post.media_type !== 'text' && (post.media_url || post.thumbnail_url)) {
    return [
      {
        id: `${post.id}-legacy`,
        media_type: post.media_type === 'video' ? 'video' : 'image',
        media_url: post.media_url || post.thumbnail_url || '',
        thumbnail_url: post.thumbnail_url,
        sort_order: 0,
      },
    ];
  }
  return [];
}

type CommentRow = {
  id: string;
  parent_comment_id?: string | null;
  staff_id?: string | null;
  guest_id?: string | null;
  content: string;
  created_at: string;
  staff: { full_name: string | null; profile_image?: string | null; profile_hidden_by_admin?: boolean | null } | null;
  guest: { full_name: string | null; photo_url?: string | null } | null;
};

function getDisplayName(): string {
  const { user } = useAuthStore.getState();
  if (!user) return '';
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
  return i18n.t('guestDefaultName');
}

export default function CustomerFeedPostDetail() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const idNorm = id && typeof id === 'string' ? id.trim() : '';
  const router = useRouter();
  const { t } = useTranslation();
  const dfLocale = dateFnsLocaleForApp();
  const { width: winWidth } = useWindowDimensions();
  const { user } = useAuthStore();
  const [post, setPost] = useState<PostRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(true);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [myLike, setMyLike] = useState(false);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentText, setCommentText] = useState('');
  const [replyToCommentId, setReplyToCommentId] = useState<string | null>(null);
  const [replyToName, setReplyToName] = useState<string | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const [togglingLike, setTogglingLike] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [mentionSuggestions, setMentionSuggestions] = useState<StaffMentionCandidate[]>([]);
  const [mentionDirectory, setMentionDirectory] = useState<StaffMentionCandidate[]>([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [myGuestId, setMyGuestId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadPost = useCallback(async () => {
    if (!idNorm) return;
    const guestRow = await getOrCreateGuestForCurrentSession();
    setMyGuestId(guestRow?.guest_id ?? null);
    const hidden = guestRow?.guest_id
      ? await getHiddenUsersForGuest(guestRow.guest_id)
      : { hiddenStaffIds: new Set<string>(), hiddenGuestIds: new Set<string>() };
    const { data, error: e } = await supabase
      .from('feed_posts')
      .select('id, media_type, media_url, thumbnail_url, title, created_at, staff_id, guest_id, lat, lng, location_label, staff:staff_id(full_name, department, verification_badge, deleted_at, profile_hidden_by_admin), guest:guest_id(full_name, deleted_at)')
      .eq('id', idNorm)
      .in('visibility', ['customers', 'guests_only'])
      .maybeSingle();
    if (e) {
      setError(t('feedLoadFailed'));
      setPost(null);
      return;
    }
    const postRow = data as PostRow | null;
    const authorDeleted =
      postRow && ((postRow.staff_id && (postRow.staff as { deleted_at?: string | null } | null)?.deleted_at) ||
        (postRow.guest_id && (postRow.guest as { deleted_at?: string | null } | null)?.deleted_at));
    const hiddenPost = postRow
      ? (postRow.staff_id && hidden.hiddenStaffIds.has(postRow.staff_id)) ||
        (postRow.guest_id && hidden.hiddenGuestIds.has(postRow.guest_id)) ||
        !!authorDeleted
      : false;
    if (hiddenPost) {
      setPost(null);
      setError(t('postNotFound'));
      return;
    }
    if (postRow?.id) {
      const { data: mediaRows } = await supabase
        .from('feed_post_media_items')
        .select('id, media_type, media_url, thumbnail_url, sort_order')
        .eq('post_id', postRow.id)
        .order('sort_order', { ascending: true });
      postRow.media_items = (mediaRows ?? []) as PostRow['media_items'];
    }
    setPost(postRow);
    setError(data ? null : t('postNotFound'));
    if (!data) return;
    const [reactionsRes, commentsRes, myRes] = await Promise.all([
      supabase.from('feed_post_reactions').select('post_id').eq('post_id', idNorm),
      supabase.from('feed_post_comments').select('id, parent_comment_id, staff_id, guest_id, content, created_at, staff:staff_id(full_name, profile_image, deleted_at, profile_hidden_by_admin), guest:guest_id(full_name, photo_url, deleted_at)').eq('post_id', idNorm).order('created_at', { ascending: true }),
      guestRow ? supabase.from('feed_post_reactions').select('post_id').eq('post_id', idNorm).eq('guest_id', guestRow.guest_id) : Promise.resolve({ data: [] as { post_id: string }[] }),
    ]);
    const reactions = (reactionsRes.data ?? []) as { post_id: string }[];
    const commentList = ((commentsRes.data ?? []) as CommentRow[]).filter(
      (c) =>
        !(c.staff_id && hidden.hiddenStaffIds.has(c.staff_id)) &&
        !(c.guest_id && hidden.hiddenGuestIds.has(c.guest_id)) &&
        !(c.staff_id && (c.staff as { deleted_at?: string | null } | null)?.deleted_at) &&
        !(c.guest_id && (c.guest as { deleted_at?: string | null } | null)?.deleted_at)
    );
    const myReactions = (myRes.data ?? []) as { post_id: string }[];
    setLikeCount(reactions.length);
    setCommentCount(commentList.length);
    setComments(commentList);
    setMyLike(myReactions.length > 0);
    if (guestRow?.guest_id) {
      void recordGuestFeedPostViews([idNorm], guestRow.guest_id);
    }
  }, [idNorm, t]);

  useEffect(() => {
    if (!idNorm) {
      setLoading(false);
      setError(t('postNotFound'));
      return;
    }
    setVideoLoading(true);
    loadPost().then(() => setLoading(false));
  }, [idNorm, loadPost, t]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadPost();
    } finally {
      setRefreshing(false);
    }
  }, [loadPost]);

  // İlk slayt video ise overlay: feed_posts.media_type yanlış/eskimiş olsa bile media_items ile uyumlu olsun.
  // expo-av bazen onLoad gecikir; yedek zaman aşımı.
  useEffect(() => {
    if (!post) return;
    const firstIsVideo = buildFeedPostMediaItems(post)[0]?.media_type === 'video';
    if (!firstIsVideo) {
      setVideoLoading(false);
      return;
    }
    const t = setTimeout(() => setVideoLoading(false), 8000);
    return () => clearTimeout(t);
  }, [post]);

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

  useEffect(() => {
    const m = commentText.match(/@([\p{L}\p{N}_.-]{0,32})$/u);
    if (!m) {
      setMentionSuggestions([]);
      setMentionQuery('');
      return;
    }
    const q = (m[1] ?? '').trim();
    setMentionQuery(q);
    searchStaffMentionCandidates(q, 8)
      .then((rows) => setMentionSuggestions(rows))
      .catch(() => setMentionSuggestions([]));
  }, [commentText]);

  const openMentionedStaffProfile = useCallback((staffId: string) => {
    const selected = mentionSuggestions.find((s) => s.id === staffId);
    const fullName = (selected?.full_name ?? '').trim();
    if (!fullName) return;
    setCommentText((prev) => prev.replace(/@([\p{L}\p{N}_.-]{0,32})$/u, `@${fullName} `));
    setMentionSuggestions([]);
    setMentionQuery('');
  }, [mentionSuggestions]);

  const topLevelComments = useMemo(
    () => comments.filter((c) => !c.parent_comment_id),
    [comments]
  );
  const repliesByParent = useMemo(() => {
    const map: Record<string, CommentRow[]> = {};
    comments.forEach((c) => {
      if (!c.parent_comment_id) return;
      if (!map[c.parent_comment_id]) map[c.parent_comment_id] = [];
      map[c.parent_comment_id].push(c);
    });
    return map;
  }, [comments]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (error || !post) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error ?? t('postNotFound')}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>{t('goBack')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const rawStaff = post.staff as {
    full_name?: string;
    department?: string;
    verification_badge?: 'blue' | 'yellow' | null;
    profile_hidden_by_admin?: boolean | null;
  } | null;
  const rawGuest = post.guest as { full_name?: string | null } | null;
  const staffInfo = Array.isArray(rawStaff) ? rawStaff[0] ?? null : rawStaff;
  const guestInfo = Array.isArray(rawGuest) ? rawGuest[0] ?? null : rawGuest;
  const authorName = staffInfo
    ? displayStaffNameForViewer(
        staffInfo.full_name ?? null,
        staffInfo.profile_hidden_by_admin ?? null,
        false,
        t('visitorTypeStaff')
      )
    : guestDisplayName(guestInfo?.full_name, t('guestDefaultName'));
  const dept = staffInfo?.profile_hidden_by_admin ? null : staffInfo?.department;
  const badge = staffInfo?.verification_badge ?? null;
  const postMediaItems = buildFeedPostMediaItems(post);
  const imageUri = postMediaItems.length > 0 ? (postMediaItems[0].thumbnail_url || postMediaItems[0].media_url) : null;
  const firstMedia = postMediaItems[0];
  const isVideo = firstMedia?.media_type === 'video';

  const toggleLike = async () => {
    const guestRow = await getOrCreateGuestForCurrentSession();
    if (!guestRow?.guest_id) {
      Alert.alert(t('loginRequiredTitle'), t('loginRequiredLikeMessage'));
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
        const displayName = getDisplayName() || t('aGuest');
        if (post.staff_id) {
          await sendNotification({ staffId: post.staff_id, title: t('notifNewLikeTitle'), body: t('notifNewLikeBody', { name: displayName }), category: 'staff', notificationType: 'feed_like', data: { url: '/staff', postId: post.id } });
        } else if (post.guest_id) {
          await sendNotification({ guestId: post.guest_id, title: t('notifNewLikeTitle'), body: t('notifNewLikeBody', { name: displayName }), category: 'guest', notificationType: 'feed_like', data: { url: '/customer', postId: post.id } });
        }
      }
    } catch (e) {}
    setTogglingLike(false);
  };

  const submitComment = async () => {
    const guestRow = await getOrCreateGuestForCurrentSession();
    if (!guestRow?.guest_id) {
      Alert.alert(t('loginRequiredTitle'), t('loginRequiredCommentMessage'));
      return;
    }
    const text = commentText.trim();
    if (!text) return;
    setPostingComment(true);
    try {
      const { data: inserted } = await supabase
        .from('feed_post_comments')
        .insert({ post_id: post.id, guest_id: guestRow.guest_id, content: text, parent_comment_id: replyToCommentId })
        .select('id, parent_comment_id, content, created_at')
        .single();
      setCommentText('');
      setReplyToCommentId(null);
      setReplyToName(null);
      const displayName = getDisplayName() || t('guestDefaultName');
      setComments((prev) => [
        ...prev,
        {
          id: (inserted as { id: string }).id,
          parent_comment_id: (inserted as { parent_comment_id?: string | null }).parent_comment_id ?? null,
          content: text,
          created_at: (inserted as { created_at: string }).created_at,
          staff: null,
          guest: { full_name: displayName },
        },
      ]);
      setCommentCount((c) => c + 1);
      const notifyBody = `${displayName}: ${text.slice(0, 60)}${text.length > 60 ? '…' : ''}`;
      const parentComment = replyToCommentId ? comments.find((c) => c.id === replyToCommentId) : null;
      const notifiedStaffIds = new Set<string>();
      if (parentComment && parentComment.staff_id) {
        notifiedStaffIds.add(parentComment.staff_id);
        await sendNotification({ staffId: parentComment.staff_id, title: t('notifNewCommentTitle'), body: notifyBody, category: 'staff', notificationType: 'feed_comment_reply', data: { url: `/customer/feed/${post.id}`, postId: post.id, parentCommentId: parentComment.id } });
      } else if (parentComment && parentComment.guest_id && parentComment.guest_id !== guestRow.guest_id) {
        await sendNotification({ guestId: parentComment.guest_id, title: t('notifNewCommentTitle'), body: notifyBody, category: 'guest', notificationType: 'feed_comment_reply', data: { url: `/customer/feed/${post.id}`, postId: post.id, parentCommentId: parentComment.id } });
      } else if (post.staff_id) {
        notifiedStaffIds.add(post.staff_id);
        await sendNotification({ staffId: post.staff_id, title: t('notifNewCommentTitle'), body: notifyBody, category: 'staff', notificationType: 'feed_comment', data: { url: '/staff', postId: post.id } });
      } else if (post.guest_id) {
        await sendNotification({ guestId: post.guest_id, title: t('notifNewCommentTitle'), body: notifyBody, category: 'guest', notificationType: 'feed_comment', data: { url: '/customer', postId: post.id } });
      }
      const mentionStaffIds = await resolveMentionedStaffIdsFromText(text);
      for (const sid of mentionStaffIds) {
        if (notifiedStaffIds.has(sid)) continue;
        await sendNotification({
          staffId: sid,
          title: t('notifStaffMentionTitle'),
          body: t('notifStaffMentionBody', { name: displayName }),
          category: 'staff',
          notificationType: 'staff_mention',
          data: { url: `/customer/feed/${post.id}`, postId: post.id, commentId: (inserted as { id: string }).id },
        });
      }
    } catch (e) {}
    setPostingComment(false);
  };

  const deleteOwnComment = async (commentId: string) => {
    const guestRow = await getOrCreateGuestForCurrentSession();
    if (!guestRow?.guest_id) return;
    Alert.alert(t('deleteCommentTitle'), t('deleteCommentMessage'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('feed_post_comments')
            .delete()
            .eq('id', commentId)
            .eq('guest_id', guestRow.guest_id);
          if (error) {
            Alert.alert(t('error'), error.message || t('commentDeleteFailed'));
            return;
          }
          setComments((prev) => prev.filter((c) => c.id !== commentId));
          setCommentCount((c) => Math.max(0, c - 1));
        },
      },
    ]);
  };

  const isOwnGuestPost = !!(post.guest_id && myGuestId && post.guest_id === myGuestId && !post.staff_id);
  const deletePost = async () => {
    if (!isOwnGuestPost || !post) return;
    const guestRow = await getOrCreateGuestForCurrentSession();
    if (!guestRow?.guest_id || post.guest_id !== guestRow.guest_id) return;
    Alert.alert(t('deletePostTitle'), t('deletePostMessage'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          const { error } = await supabase.from('feed_posts').delete().eq('id', post.id);
          setDeleting(false);
          if (error) {
            Alert.alert(t('error'), error.message || t('postDeleteFailed'));
            return;
          }
          await removeFeedMediaObjectsForPostUrls([post.media_url, post.thumbnail_url]);
          router.replace('/customer');
        },
      },
    ]);
  };

  const hasLocation = (post.lat != null && post.lng != null) || (post.location_label && post.location_label.trim());

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.colors.primary}
          colors={[theme.colors.primary]}
        />
      }
    >
      <View style={styles.card}>
        {hasLocation && (
          <View style={styles.locationBar}>
            <Ionicons name="location" size={14} color={theme.colors.primary} />
            <Text style={styles.locationText} numberOfLines={1}>
              {post.location_label?.trim() || t('sharedFromMap')}
            </Text>
          </View>
        )}
        {imageUri ? (
          <View style={[styles.mediaWrap, { width: winWidth - 32 }]}>
            <FeedMediaCarousel
              items={postMediaItems.map((m) => ({
                id: m.id,
                media_type: m.media_type,
                media_url: m.media_url,
                thumbnail_url: m.thumbnail_url,
              }))}
              width={winWidth - 32}
              height={winWidth - 32}
              onFirstVideoReady={isVideo ? () => setVideoLoading(false) : undefined}
            />
            {isVideo && videoLoading ? (
              <View style={styles.videoLoadingOverlay} pointerEvents="none">
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.videoLoadingText}>{t('loading')}</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={[styles.textOnlyBlock, { width: winWidth - 32 }]}>
            <Text style={styles.textOnlyTitle}>{post.title || t('textPost')}</Text>
          </View>
        )}
        <View style={styles.body}>
          <Text style={styles.title}>{post.title || (isVideo ? t('video') : post.media_type === 'text' ? t('text') : t('photo'))}</Text>
          <View style={styles.metaRow}>
            {staffInfo ? (
              <>
                <StaffNameWithBadge name={authorName} badge={badge} textStyle={styles.metaText} />
                {dept ? <Text style={styles.metaText}> · {dept}</Text> : null}
              </>
            ) : (
              <Text style={styles.metaText}>{authorName}</Text>
            )}
          </View>
          <Text style={styles.date}>{new Date(post.created_at).toLocaleString()}</Text>
          <View style={styles.actionsRow}>
            {user ? (
              <TouchableOpacity
                style={[styles.actionPill, myLike && styles.actionPillActive]}
                onPress={toggleLike}
                disabled={togglingLike}
                activeOpacity={0.8}
              >
                {togglingLike ? (
                  <ActivityIndicator size="small" color={theme.colors.textMuted} />
                ) : (
                  <Ionicons name={myLike ? 'heart' : 'heart-outline'} size={20} color={myLike ? theme.colors.error : theme.colors.textSecondary} />
                )}
                <Text style={[styles.actionPillText, myLike && styles.actionPillTextActive]}>{likeCount}</Text>
              </TouchableOpacity>
            ) : null}
            <View style={styles.actionPill}>
              <Ionicons name="chatbubble-outline" size={18} color={theme.colors.textSecondary} />
              <Text style={styles.actionPillText}>{commentCount}</Text>
            </View>
            {isOwnGuestPost ? (
              <TouchableOpacity style={[styles.actionPill, styles.actionPillDanger]} onPress={deletePost} disabled={deleting} activeOpacity={0.8}>
                {deleting ? <ActivityIndicator size="small" color={theme.colors.error} /> : <Ionicons name="trash-outline" size={20} color={theme.colors.error} />}
                <Text style={[styles.actionPillText, styles.deleteActionLabel]}>{t('delete')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
        {comments.length > 0 ? (
          <View style={styles.commentsBlock}>
            <Text style={styles.commentsTitle}>{t('feedCommentsTitle')}</Text>
            {topLevelComments.map((c) => {
              const isGuestComment = !c.staff_id && !!c.guest_id;
              const staffHidden = !!(c.staff as { profile_hidden_by_admin?: boolean | null })?.profile_hidden_by_admin;
              const cAuthor = isGuestComment
                ? guestDisplayName(c.guest?.full_name, '—')
                : displayStaffNameForViewer(
                    (c.staff as { full_name?: string | null } | null)?.full_name ?? null,
                    staffHidden,
                    false,
                    '—'
                  );
              const avatarUri = c.staff?.profile_image ?? c.guest?.photo_url ?? null;
              const profileHref =
                c.staff_id && !staffHidden ? `/customer/staff/${c.staff_id}` : c.guest_id ? `/customer/guest/${c.guest_id}` : null;
              const canDelete = !!(myGuestId && c.guest_id && c.guest_id === myGuestId && !c.staff_id);
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
                    <View style={styles.commentMetaRow}>
                      <Text style={styles.commentTime}>
                        {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: dfLocale })}
                      </Text>
                      <View style={styles.commentActionsRight}>
                        <TouchableOpacity
                          onPress={() => {
                            setReplyToCommentId(c.id);
                            setReplyToName(cAuthor);
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={styles.commentReplyText}>{t('feedReply')}</Text>
                        </TouchableOpacity>
                        {canDelete ? (
                          <TouchableOpacity onPress={() => deleteOwnComment(c.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Text style={styles.commentDeleteText}>{t('delete')}</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                    {(() => {
                      const replies = repliesByParent[c.id] ?? [];
                      if (replies.length === 0) return null;
                      const isExpanded = !!expandedReplies[c.id];
                      const visibleReplies = isExpanded ? replies : replies.slice(0, 2);
                      return (
                        <View style={styles.replyListWrap}>
                          {visibleReplies.map((r) => {
                            const rAuthor = r.staff
                              ? displayStaffNameForViewer(
                                  (r.staff as { full_name?: string | null; profile_hidden_by_admin?: boolean | null }).full_name ?? null,
                                  !!(r.staff as { profile_hidden_by_admin?: boolean | null }).profile_hidden_by_admin,
                                  false,
                                  '—'
                                )
                              : guestDisplayName(r.guest?.full_name, '—');
                            return (
                              <View key={r.id} style={styles.replyRow}>
                                <Text style={styles.replyAuthor}>{rAuthor}</Text>
                                <MentionableText
                                  text={r.content}
                                  textStyle={styles.replyText}
                                  mentionStyle={styles.commentMention}
                                  resolveMentionHref={resolveMentionHref}
                                  onMentionPress={(href) => router.push(href)}
                                />
                                <Text style={styles.replyTime}>
                                  {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: dfLocale })}
                                </Text>
                              </View>
                            );
                          })}
                          {replies.length > 2 ? (
                            <TouchableOpacity
                              onPress={() => setExpandedReplies((prev) => ({ ...prev, [c.id]: !isExpanded }))}
                              activeOpacity={0.8}
                            >
                              <Text style={styles.replyMoreText}>
                                {isExpanded
                                  ? t('feedReplyHide')
                                  : t('feedReplyMore', { count: replies.length - 2 })}
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      );
                    })()}
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
        {user ? (
          <>
            {mentionSuggestions.length > 0 ? (
              <View style={styles.mentionPanel}>
                {mentionSuggestions.map((s) => (
                  <TouchableOpacity key={s.id} style={styles.mentionRow} onPress={() => openMentionedStaffProfile(s.id)} activeOpacity={0.75}>
                    <Text style={styles.mentionRowText}>@{(s.full_name ?? '').trim()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : mentionQuery.length > 0 ? (
              <View style={styles.mentionPanel}>
                <Text style={styles.mentionEmptyText}>{t('feedMentionNoResults')}</Text>
              </View>
            ) : null}
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.commentInputWrap}
              keyboardVerticalOffset={0}
            >
              {replyToCommentId ? (
                <View style={styles.replyTargetChip}>
                  <Text style={styles.replyTargetText}>@{replyToName || 'kullanici'} yanit yaziyorsun...</Text>
                  <TouchableOpacity onPress={() => { setReplyToCommentId(null); setReplyToName(null); }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Ionicons name="close" size={16} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ) : null}
              <TextInput
                style={styles.commentInput}
                placeholder={replyToCommentId ? t('feedPlaceholderReply') : t('feedPlaceholderComment')}
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
          </>
        ) : null}
      </View>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={20} color={theme.colors.primary} />
        <Text style={styles.backBtnText}>{t('back')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: theme.spacing.lg, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.backgroundSecondary },
  errorText: { fontSize: 16, color: theme.colors.textMuted, marginBottom: 16 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    marginBottom: theme.spacing.lg,
    ...theme.shadows.md,
  },
  locationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 12,
    paddingBottom: 6,
  },
  locationText: {
    fontSize: 13,
    color: theme.colors.primary,
    fontWeight: '600',
    flex: 1,
  },
  mediaWrap: { aspectRatio: 1, backgroundColor: theme.colors.borderLight },
  video: { width: '100%', height: '100%' },
  videoLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoLoadingText: { marginTop: 8, fontSize: 14, color: theme.colors.textSecondary },
  image: { aspectRatio: 1, backgroundColor: theme.colors.borderLight },
  textOnlyBlock: { padding: theme.spacing.xl, backgroundColor: theme.colors.borderLight + '60', minHeight: 120, justifyContent: 'center' },
  textOnlyTitle: { fontSize: 18, fontWeight: '600', color: theme.colors.text },
  body: { padding: theme.spacing.lg },
  title: { fontSize: 20, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 },
  metaText: { fontSize: 14, color: theme.colors.textSecondary },
  date: { fontSize: 12, color: theme.colors.textMuted },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.borderLight },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  actionPillActive: { backgroundColor: `${theme.colors.error}10`, borderColor: `${theme.colors.error}33` },
  actionPillDanger: { backgroundColor: `${theme.colors.error}08`, borderColor: `${theme.colors.error}2a` },
  actionPillText: { fontSize: 13, fontWeight: '800', color: theme.colors.textSecondary, minWidth: 16 },
  actionPillTextActive: { color: theme.colors.error },
  deleteActionLabel: { color: theme.colors.error },
  commentsBlock: { paddingHorizontal: theme.spacing.lg, paddingBottom: 12, borderTopWidth: 1, borderTopColor: theme.colors.borderLight, paddingTop: 12 },
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
  commentMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  commentActionsRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  commentTime: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  commentDeleteText: { fontSize: 12, color: theme.colors.error, fontWeight: '700' },
  commentReplyText: { fontSize: 12, color: theme.colors.primary, fontWeight: '700' },
  replyListWrap: {
    marginTop: 8,
    marginLeft: 6,
    paddingLeft: 10,
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.borderLight,
    gap: 8,
  },
  replyRow: {
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  replyAuthor: { fontSize: 12, fontWeight: '700', color: theme.colors.text },
  replyText: { fontSize: 13, color: theme.colors.text, marginTop: 2 },
  replyTime: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  replyMoreText: { fontSize: 12, fontWeight: '700', color: theme.colors.primary, marginTop: 2 },
  commentInputWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: theme.spacing.lg, paddingBottom: 16, position: 'relative' },
  replyTargetChip: {
    position: 'absolute',
    left: theme.spacing.lg,
    right: 64,
    top: -32,
    zIndex: 2,
    backgroundColor: '#f3f4f6',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  replyTargetText: { flex: 1, fontSize: 12, color: theme.colors.textSecondary, fontWeight: '600' },
  commentInput: { flex: 1, borderWidth: 1, borderColor: theme.colors.borderLight, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: theme.colors.text, maxHeight: 100 },
  commentSendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center' },
  commentSendBtnDisabled: { opacity: 0.5 },
  mentionPanel: {
    marginHorizontal: theme.spacing.lg,
    marginTop: -8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  mentionRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  mentionRowText: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  mentionEmptyText: { paddingVertical: 10, paddingHorizontal: 12, fontSize: 13, color: theme.colors.textMuted },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  backBtnText: { fontSize: 15, fontWeight: '600', color: theme.colors.primary },
});
