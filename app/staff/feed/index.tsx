import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Dimensions,
  TextInput,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  FlatList,
  Alert,
  Pressable,
  Animated,
  PanResponder,
} from 'react-native';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Video, Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { pds, feedPostCardWidth, feedPostMediaHeightForItems } from '@/constants/personelDesignSystem';
import { StaffNameWithBadge, AvatarWithBadge } from '@/components/VerifiedBadge';
import { CachedImage } from '@/components/CachedImage';
import { formatDistanceToNow } from 'date-fns';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { dateFnsLocaleForApp } from '@/lib/dateFnsLocale';
import { feedSharedText, getFeedReportReasons } from '@/lib/feedSharedI18n';
import { sendNotification, notifyAdmins } from '@/lib/notificationService';
import { formatDateTime } from '@/lib/date';
import { log } from '@/lib/logger';
import { blockUserForStaff, getHiddenUsersForStaff } from '@/lib/userBlocks';
import { StaffFeedPostCard } from '@/components/StaffFeedPostCard';
import { StoryMuxVideo } from '@/components/StoryMuxVideo';
import {
  buildStaffAvatarLookup,
  parseFeedGuestEmbed,
  parseFeedStaffEmbed,
  resolveFeedAuthorAvatarUrl,
  unwrapFeedRelation,
} from '@/lib/feedAuthorJoin';
import { openStaffProfileWithVisit } from '@/lib/staffProfileVisits';
import { guestDisplayName } from '@/lib/guestDisplayName';
import { loadFeedPostViewers, recordStaffFeedPostViews, type FeedPostViewerRow } from '@/lib/feedPostViewers';
import { displayStaffNameForViewer } from '@/lib/staffProfilePrivacy';
import { sortStaffAdminFirst } from '@/lib/sortStaffAdminFirst';
import { prefetchImageUrls } from '@/lib/prefetchImageUrls';
import { collectFeedPostPrefetchUrls } from '@/lib/feedPrefetchUrls';
import { removeFeedMediaObjectsForPostUrls } from '@/lib/feedMediaStorageDelete';
import { notifyGuestsOfNewFeedPost } from '@/lib/notifyNewFeedPost';
import {
  resolveMentionedStaffIdsFromText,
  searchStaffMentionCandidates,
  type StaffMentionCandidate,
} from '@/lib/staffMentions';
import {
  loadActiveStaffStories,
  markStoryAsViewed,
  getStoryReactionSummary,
  toggleStoryLike,
  loadStoryReplies,
  addStoryReply,
  reportStory,
  softDeleteStory,
  loadStoryViewers,
  type StoryReplyRow,
  type StaffStoryGroup,
  type StaffStoryRow,
} from '@/lib/staffStories';
import { getMuxHlsPlaybackUrl, isMuxPendingMediaUrl } from '@/lib/muxChat';
import { pollStoryPlaybackReady } from '@/lib/muxStoryUpload';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { FeedMediaCarousel } from '@/components/FeedMediaCarousel';
import { FeedFullscreenVideoPlayer } from '@/components/FeedFullscreenVideoPlayer';
import { MentionableText } from '@/components/MentionableText';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const STAFF_FEED_CACHE_KEY = 'staff_feed_cache_v1';
const FEED_PAGE_SIZE = Platform.OS === 'android' ? 15 : 30;
const FEED_REALTIME_DEBOUNCE_MS = Platform.OS === 'android' ? 900 : 350;

function firstName(fullName: string | null | undefined): string {
  const s = (fullName ?? '').trim();
  if (!s) return i18n.t('visitorTypeStaff');
  return s.split(/\s+/)[0] || s;
}

type FeedPostRow = {
  id: string;
  visibility: 'all_staff' | 'customers' | 'my_team' | string;
  media_type: string;
  media_url: string | null;
  thumbnail_url: string | null;
  title: string | null;
  created_at: string;
  staff_id: string | null;
  post_tag?: string | null;
  staff: {
    full_name: string | null;
    department: string | null;
    profile_image: string | null;
    verification_badge?: 'blue' | 'yellow' | null;
    organization?: { name?: string | null; kind?: string | null } | null;
  } | null;
  guest_id?: string | null;
  guest?: { full_name: string | null; photo_url?: string | null } | null;
  media_items?: { id: string; media_type: 'image' | 'video'; media_url: string; thumbnail_url: string | null; sort_order: number }[];
};

type CommentRow = {
  id: string;
  parent_comment_id?: string | null;
  staff_id?: string | null;
  guest_id?: string | null;
  content: string;
  created_at: string;
  staff: { full_name: string | null; verification_badge?: 'blue' | 'yellow' | null; profile_image?: string | null } | null;
  guest: { full_name: string | null; photo_url?: string | null } | null;
};

type CommentWithPostId = CommentRow & { post_id: string };

type StaffAvatarRow = {
  id: string;
  full_name: string | null;
  profile_image: string | null;
  department: string | null;
  position: string | null;
  organization?: { name?: string | null; kind?: string | null } | null;
  verification_badge?: 'blue' | 'yellow' | null;
  role?: string | null;
  profile_hidden_by_admin?: boolean | null;
};

type StoryPlayerState = {
  groupIndex: number;
  storyIndex: number;
} | null;

export default function StaffHomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ openPostId?: string }>();
  const { t, i18n } = useTranslation();
  const reportReasons = useMemo(() => getFeedReportReasons(), [i18n.language]);
  const dateLocale = useMemo(() => dateFnsLocaleForApp(), [i18n.language]);
  const timeAgoFn = useCallback(
    (date: string | null | undefined) => {
      if (!date) return '';
      try {
        return formatDistanceToNow(new Date(date), { addSuffix: true, locale: dateLocale });
      } catch {
        return '';
      }
    },
    [dateLocale]
  );
  const { staff } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState<FeedPostRow[]>([]);
  const [staffList, setStaffList] = useState<StaffAvatarRow[]>([]);
  const staffAvatarById = useMemo(() => buildStaffAvatarLookup(staffList), [staffList]);
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [myLikes, setMyLikes] = useState<Set<string>>(new Set());
  const [commentsByPost, setCommentsByPost] = useState<Record<string, CommentRow[]>>({});
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [postingComment, setPostingComment] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<{ postId: string; commentId: string; author: string } | null>(null);
  const [togglingLike, setTogglingLike] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});
  const [notificationPrefs, setNotificationPrefs] = useState<Set<string>>(new Set());
  const [viewersModalPostId, setViewersModalPostId] = useState<string | null>(null);
  const [viewersList, setViewersList] = useState<FeedPostViewerRow[]>([]);
  const [loadingViewers, setLoadingViewers] = useState(false);
  const [togglingNotif, setTogglingNotif] = useState<string | null>(null);
  const [fullscreenPostMedia, setFullscreenPostMedia] = useState<{
    uri: string;
    mediaType: 'image' | 'video';
    postId?: string;
    posterUri?: string;
  } | null>(null);
  const [fullscreenVideoReady, setFullscreenVideoReady] = useState(false);
  const fullscreenVideoRef = useRef<import('expo-av').Video>(null);
  const [menuPostId, setMenuPostId] = useState<string | null>(null);
  const [reportPost, setReportPost] = useState<FeedPostRow | null>(null);
  const [reportReason, setReportReason] = useState<string>('');
  const [reportDetails, setReportDetails] = useState<string>('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [promotingPostId, setPromotingPostId] = useState<string | null>(null);
  const [commentsSheetPostId, setCommentsSheetPostId] = useState<string | null>(null);
  const [commentsSheetRefreshing, setCommentsSheetRefreshing] = useState(false);
  const [commentSheetKeyboardH, setCommentSheetKeyboardH] = useState(0);
  const [mentionSuggestions, setMentionSuggestions] = useState<StaffMentionCandidate[]>([]);
  const [mentionDirectory, setMentionDirectory] = useState<StaffMentionCandidate[]>([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [playingPreviewId, setPlayingPreviewId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [storyGroups, setStoryGroups] = useState<StaffStoryGroup[]>([]);
  const [storyPlayer, setStoryPlayer] = useState<StoryPlayerState>(null);
  const [storyProgress, setStoryProgress] = useState(0);
  const [storyLikeCounts, setStoryLikeCounts] = useState<Record<string, number>>({});
  const [storyLikedSet, setStoryLikedSet] = useState<Set<string>>(new Set());
  const [storyReplies, setStoryReplies] = useState<Record<string, StoryReplyRow[]>>({});
  const [storyReplyText, setStoryReplyText] = useState('');
  const [storyViewersModal, setStoryViewersModal] = useState(false);
  const [storyRepliesModal, setStoryRepliesModal] = useState(false);
  const [storyViewers, setStoryViewers] = useState<{
    id: string;
    staff_id: string | null;
    guest_id: string | null;
    viewed_at: string;
    staff: { full_name: string | null; profile_image: string | null; verification_badge?: 'blue' | 'yellow' | null } | null;
    guest: { full_name: string | null; photo_url?: string | null } | null;
  }[]>([]);
  const storyViewersOpenedAtRef = useRef(0);
  const [storyMenuOpen, setStoryMenuOpen] = useState(false);
  const [storyReportOpen, setStoryReportOpen] = useState(false);
  const [storyReportReason, setStoryReportReason] = useState('');
  const [storyReportDetails, setStoryReportDetails] = useState('');
  const [storyBusy, setStoryBusy] = useState(false);
  const [storyKeyboardOpen, setStoryKeyboardOpen] = useState(false);
  const [visibleFeedCount, setVisibleFeedCount] = useState(FEED_PAGE_SIZE);
  const storyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storyProgressAnim = useRef(new Animated.Value(0)).current;

  const scrollRef = useRef<ScrollView>(null);
  const postYRef = useRef<Record<string, number>>({});
  const [pendingScrollPostId, setPendingScrollPostId] = useState<string | null>(null);

  const COMMENT_SHEET_INITIAL = Platform.OS === 'android' ? SCREEN_HEIGHT * 0.62 : SCREEN_HEIGHT * 0.5;
  const COMMENT_SHEET_MAX = SCREEN_HEIGHT * 0.9;
  const COMMENT_SHEET_DRAG_ACTIVATION = Platform.OS === 'android' ? 2 : 4;
  const commentSheetHeight = useRef(new Animated.Value(COMMENT_SHEET_INITIAL)).current;
  const commentSheetCurrentH = useRef(COMMENT_SHEET_INITIAL);

  const commentSheetPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dy) > COMMENT_SHEET_DRAG_ACTIVATION && Math.abs(g.dy) > Math.abs(g.dx),
      onMoveShouldSetPanResponderCapture: (_, g) =>
        Math.abs(g.dy) > COMMENT_SHEET_DRAG_ACTIVATION && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        const newH = commentSheetCurrentH.current - g.dy;
        const clamped = Math.max(COMMENT_SHEET_INITIAL * 0.5, Math.min(COMMENT_SHEET_MAX, newH));
        commentSheetCurrentH.current = clamped;
        commentSheetHeight.setValue(clamped);
      },
      onPanResponderRelease: (_, g) => {
        const h = commentSheetCurrentH.current;
        const vy = g.vy;
        if (h < COMMENT_SHEET_INITIAL * 0.65 || vy > 0.4) {
          setCommentsSheetPostId(null);
          commentSheetCurrentH.current = COMMENT_SHEET_INITIAL;
          commentSheetHeight.setValue(COMMENT_SHEET_INITIAL);
          return;
        }
        const target = vy < -0.2 || h > COMMENT_SHEET_INITIAL * 1.1 ? COMMENT_SHEET_MAX : COMMENT_SHEET_INITIAL;
        commentSheetCurrentH.current = target;
        Animated.spring(commentSheetHeight, {
          toValue: target,
          useNativeDriver: false,
          tension: 80,
          friction: 12,
        }).start();
      },
    })
  ).current;

  useEffect(() => {
    if (commentsSheetPostId) {
      commentSheetCurrentH.current = COMMENT_SHEET_INITIAL;
      commentSheetHeight.setValue(COMMENT_SHEET_INITIAL);
    } else {
      setCommentSheetKeyboardH(0);
    }
  }, [commentsSheetPostId]);

  // Açılışta: en son görünen feed'i anında bas (ağ gelene kadar kullanıcı içerik görsün)
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STAFF_FEED_CACHE_KEY)
      .then((raw) => {
        if (!raw || cancelled) return;
        const parsed = JSON.parse(raw) as Partial<{
          posts: FeedPostRow[];
          staffList: StaffAvatarRow[];
          likeCounts: Record<string, number>;
          commentCounts: Record<string, number>;
          viewCounts: Record<string, number>;
          myLikePostIds: string[];
          notificationPostIds: string[];
          commentsByPost: Record<string, CommentRow[]>;
          cachedAt: number;
        }>;
        if (cancelled) return;
        if (Array.isArray(parsed.posts)) setPosts(parsed.posts);
        if (Array.isArray(parsed.staffList)) setStaffList(parsed.staffList);
        if (parsed.likeCounts && typeof parsed.likeCounts === 'object') setLikeCounts(parsed.likeCounts);
        if (parsed.commentCounts && typeof parsed.commentCounts === 'object') setCommentCounts(parsed.commentCounts);
        if (parsed.viewCounts && typeof parsed.viewCounts === 'object') setViewCounts(parsed.viewCounts);
        if (Array.isArray(parsed.myLikePostIds)) setMyLikes(new Set(parsed.myLikePostIds));
        if (Array.isArray(parsed.notificationPostIds)) setNotificationPrefs(new Set(parsed.notificationPostIds));
        if (parsed.commentsByPost && typeof parsed.commentsByPost === 'object') setCommentsByPost(parsed.commentsByPost);
        if ((parsed.posts?.length ?? 0) > 0) {
          setLoading(false);
          prefetchImageUrls(collectFeedPostPrefetchUrls(parsed.posts), Platform.OS === 'android' ? 40 : 64);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Android: yorum kartında klavye açılınca titremeyi önlemek için KeyboardAvoidingView behavior kapatıldı, manuel padding
  useEffect(() => {
    if (Platform.OS !== 'android' || !commentsSheetPostId) return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setCommentSheetKeyboardH(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setCommentSheetKeyboardH(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [commentsSheetPostId]);

  useEffect(() => {
    const postId = commentsSheetPostId;
    if (!postId) {
      setMentionSuggestions([]);
      setMentionQuery('');
      return;
    }
    const txt = commentText[postId] ?? '';
    const m = txt.match(/@([\p{L}\p{N}_.-]{0,32})$/u);
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
  }, [commentText, commentsSheetPostId]);

  const openMentionedStaffProfile = useCallback((staffId: string) => {
    const selected = mentionSuggestions.find((s) => s.id === staffId);
    const fullName = (selected?.full_name ?? '').trim();
    if (!fullName || !commentsSheetPostId) return;
    setCommentText((prev) => {
      const current = prev[commentsSheetPostId] ?? '';
      return {
        ...prev,
        [commentsSheetPostId]: current.replace(/@([\p{L}\p{N}_.-]{0,32})$/u, `@${fullName} `),
      };
    });
    setMentionSuggestions([]);
    setMentionQuery('');
  }, [mentionSuggestions, commentsSheetPostId]);

  // Bildirimden tıklanınca yorum kartı açılmaz; gönderi listede görünsün diye karta kaydırılır
  useEffect(() => {
    const postId = params.openPostId;
    if (postId) {
      setPendingScrollPostId(postId);
      router.setParams({ openPostId: undefined });
    }
  }, [params.openPostId, router]);

  useEffect(() => {
    const id = pendingScrollPostId;
    if (!id) return;
    if (!posts.some((p) => p.id === id)) {
      const t = setTimeout(() => {
        setPendingScrollPostId((cur) => (cur === id ? null : cur));
      }, 2500);
      return () => clearTimeout(t);
    }
    const attempt = () => {
      setPendingScrollPostId((cur) => {
        if (cur !== id) return cur;
        const y = postYRef.current[id];
        if (y != null && scrollRef.current) {
          scrollRef.current.scrollTo({ y: Math.max(0, y - 20), animated: true });
          return null;
        }
        return cur;
      });
    };
    const raf = requestAnimationFrame(attempt);
    const t1 = setTimeout(attempt, 80);
    const t2 = setTimeout(attempt, 250);
    const t3 = setTimeout(attempt, 600);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [posts, pendingScrollPostId]);

  const loadStaffList = useCallback(async (hiddenStaffIds?: Set<string>): Promise<StaffAvatarRow[]> => {
    const { data } = await supabase
      .from('staff')
      .select('id, full_name, profile_image, department, position, verification_badge, email, role, profile_hidden_by_admin, organization:organization_id(name, kind)')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('full_name');
    const rows = (data ?? []) as (StaffAvatarRow & { email?: string | null })[];
    const byKey = new Map<string, (StaffAvatarRow & { email?: string | null })>();
    rows.forEach((r) => {
      const key = (r.email && r.email.trim()) ? r.email.trim().toLowerCase() : r.id;
      if (!byKey.has(key)) byKey.set(key, r);
    });
    const mapped = Array.from(byKey.values()).map(
      ({ id, full_name, profile_image, department, position, organization, verification_badge, role, profile_hidden_by_admin }) => ({
        id,
        full_name,
        profile_image,
        department,
        position,
        organization,
        verification_badge,
        role,
        profile_hidden_by_admin: profile_hidden_by_admin ?? null,
      })
    );
    const visible = mapped.filter((s) => !hiddenStaffIds?.has(s.id));
    const sorted = sortStaffAdminFirst(visible, (a, b) =>
      (a.full_name || '').localeCompare(b.full_name || '', 'tr')
    );
    setStaffList(sorted);
    return sorted;
  }, []);

  const loadFeed = useCallback(async () => {
    if (!staff) return;
    const hidden = await getHiddenUsersForStaff(staff.id);
    const staffListRows = await loadStaffList(hidden.hiddenStaffIds);
    const { data: postsData } = await supabase
      .from('feed_posts')
      .select('id, visibility, media_type, media_url, thumbnail_url, title, created_at, staff_id, post_tag, staff:staff_id(full_name, department, profile_image, verification_badge, deleted_at, profile_hidden_by_admin, organization:organization_id(name, kind)), guest_id, guest:guest_id(full_name, photo_url, deleted_at)')
      .or('visibility.eq.all_staff,visibility.eq.my_team,visibility.eq.customers')
      .order('created_at', { ascending: false })
      .limit(50);
    const list = ((postsData ?? []) as FeedPostRow[]).filter(
      (p) =>
        !(p.staff_id && hidden.hiddenStaffIds.has(p.staff_id)) &&
        !(p.guest_id && hidden.hiddenGuestIds.has(p.guest_id)) &&
        !(p.staff_id && unwrapFeedRelation(p.staff as { deleted_at?: string | null } | null)?.deleted_at) &&
        !(p.guest_id && unwrapFeedRelation(p.guest as { deleted_at?: string | null } | null)?.deleted_at)
    );
    if (!mountedRef.current) return;
    const ids = list.map((p) => p.id);
    const mediaItemsByPost: Record<string, FeedPostRow['media_items']> = {};
    if (ids.length > 0) {
      const { data: mediaRows } = await supabase
        .from('feed_post_media_items')
        .select('id, post_id, media_type, media_url, thumbnail_url, sort_order')
        .in('post_id', ids)
        .order('sort_order', { ascending: true });
      (mediaRows ?? []).forEach((r: { id: string; post_id: string; media_type: 'image' | 'video'; media_url: string; thumbnail_url: string | null; sort_order: number }) => {
        if (!mediaItemsByPost[r.post_id]) mediaItemsByPost[r.post_id] = [];
        mediaItemsByPost[r.post_id]!.push({
          id: r.id,
          media_type: r.media_type,
          media_url: r.media_url,
          thumbnail_url: r.thumbnail_url,
          sort_order: r.sort_order,
        });
      });
    }
    const listWithMedia = list.map((p) => ({ ...p, media_items: mediaItemsByPost[p.id] ?? [] }));
    setPosts(listWithMedia);
    setPlayingPreviewId(listWithMedia.find((p) => p.media_type === 'video')?.id ?? null);

    if (ids.length === 0) {
      setLikeCounts({});
      setCommentCounts({});
      setViewCounts({});
      setMyLikes(new Set());
      setNotificationPrefs(new Set());
      setCommentsByPost({});
      AsyncStorage.setItem(
        STAFF_FEED_CACHE_KEY,
        JSON.stringify({
          posts: listWithMedia,
          staffList: staffListRows,
          likeCounts: {},
          commentCounts: {},
          viewCounts: {},
          myLikePostIds: [],
          notificationPostIds: [],
          commentsByPost: {},
          cachedAt: Date.now(),
        })
      ).catch(() => {});
      setLoading(false);
      prefetchImageUrls(staffListRows.map((s) => s.profile_image), 40);
      return;
    }
    const [reactionsRes, commentsRes, myReactionsRes, viewCountsRes, notifPrefsRes] = await Promise.all([
      supabase.from('feed_post_reactions').select('post_id').in('post_id', ids),
      supabase.from('feed_post_comments').select('post_id, id, parent_comment_id, staff_id, guest_id, content, created_at, staff:staff_id(full_name, verification_badge, profile_image, deleted_at, profile_hidden_by_admin), guest:guest_id(full_name, photo_url, deleted_at)').in('post_id', ids).order('created_at', { ascending: true }),
      supabase.from('feed_post_reactions').select('post_id').in('post_id', ids).eq('staff_id', staff.id),
      supabase.rpc('get_feed_post_view_counts', { post_ids: ids }),
      supabase.from('feed_post_notification_prefs').select('post_id').eq('staff_id', staff.id).in('post_id', ids),
    ]);
    if (!mountedRef.current) return;
    const reactions = (reactionsRes.data ?? []) as { post_id: string }[];
    const comments = (commentsRes.data ?? []) as CommentWithPostId[];
    const myReactions = (myReactionsRes.data ?? []) as { post_id: string }[];
    if (viewCountsRes.error) {
      log.warn('get_feed_post_view_counts RPC error', viewCountsRes.error);
    }
    const viewCountRows = (viewCountsRes.data ?? []) as { post_id: string; view_count: number }[];
    const notifPrefs = (notifPrefsRes.data ?? []) as { post_id: string }[];
    const likeCount: Record<string, number> = {};
    reactions.forEach((r) => {
      likeCount[r.post_id] = (likeCount[r.post_id] ?? 0) + 1;
    });
    const viewCount: Record<string, number> = {};
    viewCountRows.forEach((row: { post_id: string; view_count?: number; viewCount?: number }) => {
      const pid = row.post_id != null ? String(row.post_id) : '';
      const cnt = row.view_count ?? row.viewCount ?? 0;
      if (pid) viewCount[pid] = Number(cnt) || 0;
    });
    const commentCount: Record<string, number> = {};
    const byPost: Record<string, CommentRow[]> = {};
    comments.forEach((c) => {
      if ((c.staff_id && hidden.hiddenStaffIds.has(c.staff_id)) || (c.guest_id && hidden.hiddenGuestIds.has(c.guest_id))) return;
      if ((c.staff_id && (c.staff as { deleted_at?: string | null } | null)?.deleted_at) || (c.guest_id && (c.guest as { deleted_at?: string | null } | null)?.deleted_at)) return;
      commentCount[c.post_id] = (commentCount[c.post_id] ?? 0) + 1;
      if (!byPost[c.post_id]) byPost[c.post_id] = [];
      byPost[c.post_id].push({
        id: c.id,
        staff_id: c.staff_id ?? null,
        guest_id: c.guest_id ?? null,
        parent_comment_id: (c as { parent_comment_id?: string | null }).parent_comment_id ?? null,
        content: c.content,
        created_at: c.created_at,
        staff: c.staff,
        guest: c.guest,
      });
    });
    setLikeCounts(likeCount);
    setCommentCounts(commentCount);
    setViewCounts(viewCount);
    const myLikePostIds = myReactions.map((r) => r.post_id);
    const notificationPostIds = notifPrefs.map((n) => n.post_id);
    setMyLikes(new Set(myLikePostIds));
    setNotificationPrefs(new Set(notificationPostIds));
    setCommentsByPost(byPost);
    AsyncStorage.setItem(
      STAFF_FEED_CACHE_KEY,
      JSON.stringify({
        posts: listWithMedia,
        staffList: staffListRows,
        likeCounts: likeCount,
        commentCounts: commentCount,
        viewCounts: viewCount,
        myLikePostIds,
        notificationPostIds,
        commentsByPost: byPost,
        cachedAt: Date.now(),
      })
    ).catch(() => {});
    setLoading(false);
    const avatarLookup = buildStaffAvatarLookup(staffListRows);
    prefetchImageUrls(
      [
        ...collectFeedPostPrefetchUrls(list),
        ...list.map((p) =>
          resolveFeedAuthorAvatarUrl({
            staff: p.staff,
            guest: p.guest,
            staffId: p.staff_id,
            staffAvatarById: avatarLookup,
          })
        ),
        ...staffListRows.map((s) => s.profile_image),
      ],
      Platform.OS === 'android' ? 40 : 64
    );
    void recordStaffFeedPostViews(ids, staff.id);
  }, [staff?.id, loadStaffList]);

  const refreshCommentsSheet = useCallback(async () => {
    if (!staff || !commentsSheetPostId) return;
    setCommentsSheetRefreshing(true);
    try {
      const hidden = await getHiddenUsersForStaff(staff.id);
      const { data: commentsData, error } = await supabase
        .from('feed_post_comments')
        .select(
          'post_id, id, parent_comment_id, staff_id, guest_id, content, created_at, staff:staff_id(full_name, verification_badge, profile_image, deleted_at, profile_hidden_by_admin), guest:guest_id(full_name, photo_url, deleted_at)'
        )
        .eq('post_id', commentsSheetPostId)
        .order('created_at', { ascending: true });
      if (error) return;
      const raw = (commentsData ?? []) as CommentWithPostId[];
      const list: CommentRow[] = [];
      raw.forEach((c) => {
        if ((c.staff_id && hidden.hiddenStaffIds.has(c.staff_id)) || (c.guest_id && hidden.hiddenGuestIds.has(c.guest_id))) return;
        if ((c.staff_id && (c.staff as { deleted_at?: string | null } | null)?.deleted_at) || (c.guest_id && (c.guest as { deleted_at?: string | null } | null)?.deleted_at)) return;
        list.push({
          id: c.id,
          staff_id: c.staff_id ?? null,
          guest_id: c.guest_id ?? null,
          parent_comment_id: c.parent_comment_id ?? null,
          content: c.content,
          created_at: c.created_at,
          staff: c.staff,
          guest: c.guest,
        });
      });
      setCommentsByPost((prev) => ({ ...prev, [commentsSheetPostId]: list }));
      setCommentCounts((prev) => ({ ...prev, [commentsSheetPostId]: list.length }));
    } finally {
      setCommentsSheetRefreshing(false);
    }
  }, [staff, commentsSheetPostId]);

  const loadStories = useCallback(async () => {
    if (!staff?.id) return;
    try {
      const groups = await loadActiveStaffStories(staff.id, staff.role === 'admin');
      if (!mountedRef.current) return;
      setStoryGroups(groups);
    } catch {
      // ignore story load errors
    }
  }, [staff?.id]);

  useEffect(() => {
    loadFeed();
    loadStories();
  }, [loadFeed, loadStories]);

  useEffect(() => {
    if (fullscreenPostMedia?.mediaType === 'video') setFullscreenVideoReady(false);
  }, [fullscreenPostMedia?.uri, fullscreenPostMedia?.mediaType]);

  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!fullscreenPostMedia || fullscreenPostMedia.mediaType !== 'video') return;
    const t = setTimeout(() => {
      fullscreenVideoRef.current?.playAsync().catch(() => {});
      fullscreenVideoRef.current?.setVolumeAsync(1.0).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [fullscreenPostMedia?.uri, fullscreenPostMedia?.mediaType]);

  const loadFeedDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleLoadFeedFromRealtime = useCallback(() => {
    if (loadFeedDebounceRef.current) clearTimeout(loadFeedDebounceRef.current);
    loadFeedDebounceRef.current = setTimeout(() => {
      loadFeedDebounceRef.current = null;
      void loadFeed();
    }, FEED_REALTIME_DEBOUNCE_MS);
  }, [loadFeed]);

  useEffect(() => {
    return () => {
      if (loadFeedDebounceRef.current) clearTimeout(loadFeedDebounceRef.current);
    };
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('feed_posts_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'feed_posts' },
        () => {
          scheduleLoadFeedFromRealtime();
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'feed_posts' },
        () => {
          scheduleLoadFeedFromRealtime();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [scheduleLoadFeedFromRealtime]);

  useEffect(() => {
    const channel = supabase
      .channel('feed_stories_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feed_stories' }, () => {
        loadStories();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadStories]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadFeed(), loadStories()]);
    setRefreshing(false);
  }, [loadFeed, loadStories]);

  const orderedStoryGroups = useMemo(() => {
    if (!staff?.id) return storyGroups;
    const mine = storyGroups.find((g) => g.staff_id === staff.id);
    const others = storyGroups.filter((g) => g.staff_id !== staff.id);
    return mine ? [mine, ...others] : others;
  }, [storyGroups, staff?.id]);
  const storyGroupByStaffId = useMemo(() => {
    const map = new Map<string, StaffStoryGroup>();
    orderedStoryGroups.forEach((g) => map.set(g.staff_id, g));
    return map;
  }, [orderedStoryGroups]);
  const orderedStaffList = useMemo(() => {
    if (!staff?.id) return staffList;
    const me = staffList.find((s) => s.id === staff.id);
    const others = staffList.filter((s) => s.id !== staff.id);
    return me ? [me, ...others] : staffList;
  }, [staffList, staff?.id]);
  const visiblePosts = useMemo(() => posts.slice(0, visibleFeedCount), [posts, visibleFeedCount]);

  useEffect(() => {
    setVisibleFeedCount(FEED_PAGE_SIZE);
  }, [posts]);

  const closeStoryPlayer = useCallback((force = false) => {
    if (!force && (storyMenuOpen || storyViewersModal || storyRepliesModal || storyReportOpen)) {
      return;
    }
    if (storyTimerRef.current) {
      clearTimeout(storyTimerRef.current);
      storyTimerRef.current = null;
    }
    setStoryPlayer(null);
    setStoryProgress(0);
    storyProgressAnim.stopAnimation();
    storyProgressAnim.setValue(0);
  }, [storyMenuOpen, storyRepliesModal, storyReportOpen, storyViewersModal, storyProgressAnim]);

  const openStoryAt = useCallback((groupIndex: number, storyIndex = 0) => {
    setStoryPlayer({ groupIndex, storyIndex });
  }, []);
  const openStoryByStaffId = useCallback((staffId: string) => {
    const idx = orderedStoryGroups.findIndex((g) => g.staff_id === staffId);
    if (idx >= 0) openStoryAt(idx);
  }, [orderedStoryGroups, openStoryAt]);

  const goToNextStory = useCallback(() => {
    setStoryPlayer((prev) => {
      if (!prev) return prev;
      const group = orderedStoryGroups[prev.groupIndex];
      if (!group) return null;
      if (prev.storyIndex < group.stories.length - 1) {
        return { groupIndex: prev.groupIndex, storyIndex: prev.storyIndex + 1 };
      }
      if (prev.groupIndex < orderedStoryGroups.length - 1) {
        return { groupIndex: prev.groupIndex + 1, storyIndex: 0 };
      }
      return null;
    });
  }, [orderedStoryGroups]);

  const goToPrevStory = useCallback(() => {
    setStoryPlayer((prev) => {
      if (!prev) return prev;
      if (prev.storyIndex > 0) return { groupIndex: prev.groupIndex, storyIndex: prev.storyIndex - 1 };
      if (prev.groupIndex > 0) {
        const prevGroup = orderedStoryGroups[prev.groupIndex - 1];
        if (!prevGroup) return prev;
        return { groupIndex: prev.groupIndex - 1, storyIndex: Math.max(0, prevGroup.stories.length - 1) };
      }
      return prev;
    });
  }, [orderedStoryGroups]);

  const activeStoryGroup = storyPlayer ? orderedStoryGroups[storyPlayer.groupIndex] : null;
  const activeStory = storyPlayer && activeStoryGroup ? activeStoryGroup.stories[storyPlayer.storyIndex] : null;
  const canDeleteActiveStory = !!(staff?.id && activeStory && (activeStory.staff_id === staff.id || staff?.role === 'admin'));
  const canViewActiveStoryViewers = !!(staff?.id && activeStory && activeStory.staff_id === staff.id);
  const storyOverlayOpen = storyMenuOpen || storyViewersModal || storyReportOpen;

  useEffect(() => {
    if (!storyPlayer) {
      if (storyTimerRef.current) {
        clearTimeout(storyTimerRef.current);
        storyTimerRef.current = null;
      }
      storyProgressAnim.stopAnimation();
      storyProgressAnim.setValue(0);
      storyProgressAnim.removeAllListeners();
      setStoryProgress(0);
      setStoryMenuOpen(false);
      setStoryViewersModal(false);
      setStoryRepliesModal(false);
      setStoryReportOpen(false);
      setStoryReplyText('');
      return;
    }
    if (!activeStory || !staff?.id) return;
    const durationMs = Math.max(5000, (activeStory.duration_seconds || (activeStory.media_type === 'video' ? 28 : 9)) * 1000);

    storyProgressAnim.stopAnimation();
    storyProgressAnim.setValue(0);
    storyProgressAnim.removeAllListeners();
    setStoryProgress(0);
    Animated.timing(storyProgressAnim, {
      toValue: 1,
      duration: durationMs,
      useNativeDriver: false,
    }).start();
    storyProgressAnim.removeAllListeners();
    storyProgressAnim.addListener(({ value }) => {
      setStoryProgress(value);
    });

    markStoryAsViewed(activeStory.id, staff.id).catch(() => {});
    setStoryGroups((prev) => {
      let changed = false;
      const next = prev.map((g) => {
        if (g.staff_id !== activeStoryGroup?.staff_id || !g.has_unseen) return g;
        changed = true;
        return { ...g, has_unseen: false };
      });
      return changed ? next : prev;
    });

    if (storyTimerRef.current) clearTimeout(storyTimerRef.current);
    if (!storyOverlayOpen) {
      storyTimerRef.current = setTimeout(() => {
        goToNextStory();
      }, durationMs);
    }

    return () => {
      if (storyTimerRef.current) {
        clearTimeout(storyTimerRef.current);
        storyTimerRef.current = null;
      }
      storyProgressAnim.removeAllListeners();
    };
  }, [storyPlayer, activeStory?.id, activeStory?.duration_seconds, activeStory?.media_type, activeStoryGroup?.staff_id, staff?.id, goToNextStory, storyProgressAnim, storyOverlayOpen]);

  useEffect(() => {
    if (!storyPlayer) return;
    if (!activeStoryGroup) {
      closeStoryPlayer();
      return;
    }
    if (storyPlayer.storyIndex >= activeStoryGroup.stories.length) {
      setStoryPlayer({
        groupIndex: storyPlayer.groupIndex,
        storyIndex: Math.max(0, activeStoryGroup.stories.length - 1),
      });
    }
  }, [storyGroups, storyPlayer, activeStoryGroup, closeStoryPlayer]);

  useEffect(() => {
    if (!activeStory?.id || activeStory.media_type !== 'video') return;
    if (getMuxHlsPlaybackUrl(activeStory.media_url)) return;
    if (!isMuxPendingMediaUrl(activeStory.media_url)) return;
    let cancelled = false;
    void (async () => {
      const result = await pollStoryPlaybackReady(activeStory.id, { maxAttempts: 60, intervalMs: 500 });
      if (cancelled || !result.ready || !result.media_url) return;
      setStoryGroups((prev) =>
        prev.map((g) => ({
          ...g,
          stories: g.stories.map((s) =>
            s.id === activeStory.id
              ? {
                  ...s,
                  media_url: result.media_url!,
                  thumbnail_url: result.thumbnail_url ?? s.thumbnail_url,
                }
              : s
          ),
        }))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [activeStory?.id, activeStory?.media_url, activeStory?.media_type]);

  useEffect(() => {
    if (!storyPlayer) {
      setStoryKeyboardOpen(false);
      return;
    }
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setStoryKeyboardOpen(true));
    const hide = Keyboard.addListener(hideEvent, () => setStoryKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [storyPlayer]);

  useEffect(() => {
    if (!activeStory?.id || !staff?.id) return;
    let cancelled = false;
    Promise.all([getStoryReactionSummary(activeStory.id, staff.id), loadStoryReplies(activeStory.id)])
      .then(([summary, replies]) => {
        if (cancelled) return;
        setStoryLikeCounts((prev) => ({ ...prev, [activeStory.id]: summary.likeCount }));
        setStoryLikedSet((prev) => {
          const next = new Set(prev);
          if (summary.likedByMe) next.add(activeStory.id);
          else next.delete(activeStory.id);
          return next;
        });
        setStoryReplies((prev) => ({ ...prev, [activeStory.id]: replies }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeStory?.id, staff?.id]);

  const handleStoryLike = useCallback(async () => {
    if (!activeStory?.id || !staff?.id || storyBusy) return;
    const liked = storyLikedSet.has(activeStory.id);
    setStoryBusy(true);
    const { error } = await toggleStoryLike(activeStory.id, staff.id, liked);
    if (!error) {
      setStoryLikedSet((prev) => {
        const next = new Set(prev);
        if (liked) next.delete(activeStory.id);
        else next.add(activeStory.id);
        return next;
      });
      setStoryLikeCounts((prev) => ({
        ...prev,
        [activeStory.id]: Math.max(0, (prev[activeStory.id] ?? 0) + (liked ? -1 : 1)),
      }));
      if (!liked && activeStory.staff_id !== staff.id) {
        sendNotification({
          staffId: activeStory.staff_id,
          title: 'Hikayene begeni geldi',
          body: `${staff.full_name ?? 'Bir personel'} hikayeni begendi.`,
          category: 'staff',
          notificationType: 'story_like',
          data: { screen: 'staff_feed', url: '/staff/feed', storyId: activeStory.id },
        }).catch(() => {});
      }
    }
    setStoryBusy(false);
  }, [activeStory?.id, activeStory?.staff_id, staff?.id, staff?.full_name, storyLikedSet, storyBusy]);

  const handleStoryReply = useCallback(async () => {
    if (!activeStory?.id || !staff?.id || storyBusy) return;
    const text = storyReplyText.trim();
    if (!text) return;
    setStoryBusy(true);
    const { error } = await addStoryReply(activeStory.id, staff.id, text);
    if (!error) {
      const refreshed = await loadStoryReplies(activeStory.id).catch(() => []);
      setStoryReplies((prev) => ({ ...prev, [activeStory.id]: refreshed }));
      setStoryReplyText('');
      if (activeStoryGroup?.staff_id && activeStoryGroup.staff_id !== staff.id) {
        sendNotification({
          staffId: activeStoryGroup.staff_id,
          title: 'Hikayene yanit geldi',
          body: `${staff.full_name ?? 'Bir personel'}: ${text.slice(0, 60)}${text.length > 60 ? '…' : ''}`,
          category: 'staff',
          notificationType: 'story_reply',
          data: { screen: 'staff_feed', url: '/staff/feed', storyId: activeStory.id },
        }).catch(() => {});
      }
    }
    setStoryBusy(false);
  }, [activeStory?.id, activeStoryGroup?.staff_id, staff?.id, staff?.full_name, storyReplyText, storyBusy]);

  useEffect(() => {
    if (!canViewActiveStoryViewers && storyViewersModal) {
      setStoryViewersModal(false);
    }
  }, [canViewActiveStoryViewers, storyViewersModal]);

  const openStoryViewers = useCallback(async () => {
    if (!activeStory?.id || !canViewActiveStoryViewers) return;
    log.info('staff/feed/story', 'openStoryViewers pressed', {
      storyId: activeStory.id,
      currentUserStaffId: staff?.id,
      storyOwnerStaffId: activeStory?.staff_id,
    });
    try {
      const list = await loadStoryViewers(activeStory.id);
      log.info('staff/feed/story', 'openStoryViewers success', {
        storyId: activeStory.id,
        viewerCount: list.length,
      });
      setStoryViewers(list);
      storyViewersOpenedAtRef.current = Date.now();
      setStoryViewersModal(true);
    } catch (e) {
      const err = e as { message?: string; code?: string; details?: string };
      log.error('staff/feed/story', 'openStoryViewers failed', {
        storyId: activeStory.id,
        code: err?.code,
        message: err?.message,
        details: err?.details,
      });
      Alert.alert('Goruntuleyenler acilamadi', err?.message ?? 'Yetki veya baglanti hatasi olabilir.');
    }
  }, [activeStory?.id, activeStory?.staff_id, canViewActiveStoryViewers, staff?.id]);

  const openStoryPersonProfile = useCallback(
    (viewerStaffId: string | null | undefined, guestId: string | null | undefined) => {
      const href = viewerStaffId
        ? `/staff/profile/${viewerStaffId}`
        : guestId
          ? `/staff/guests/${guestId}`
          : null;
      if (!href) return;
      setStoryViewersModal(false);
      setStoryRepliesModal(false);
      router.push(href);
    },
    [router]
  );

  useEffect(() => {
    log.info('staff/feed/story', 'storyViewersModal visibility changed', { visible: storyViewersModal });
  }, [storyViewersModal]);

  const submitStoryReport = useCallback(async () => {
    if (!activeStory?.id || !staff?.id || !storyReportReason.trim() || storyBusy) return;
    setStoryBusy(true);
    const { error } = await reportStory(activeStory.id, staff.id, storyReportReason, storyReportDetails);
    if (!error) {
      await notifyAdmins({
        title: 'Story bildirimi',
        body: `${staff.full_name ?? 'Bir personel'} story bildirdi: ${storyReportReason}`,
        data: { url: '/admin/reports', screen: 'admin', storyId: activeStory.id, reason: storyReportReason },
      });
      setStoryReportOpen(false);
      setStoryReportReason('');
      setStoryReportDetails('');
      Alert.alert('Alindi', 'Story bildirimi yonetime iletildi.');
    }
    setStoryBusy(false);
  }, [activeStory?.id, staff?.id, staff?.full_name, storyReportReason, storyReportDetails, storyBusy]);

  const deleteActiveStory = useCallback(async () => {
    if (!activeStory?.id || !canDeleteActiveStory || storyBusy || !storyPlayer || !activeStoryGroup) {
      log.warn('staff/feed/story', 'deleteActiveStory blocked', {
        hasStoryId: !!activeStory?.id,
        canDeleteActiveStory,
        storyBusy,
      });
      return;
    }
    Alert.alert('Hikayeyi sil', 'Bu hikaye kaldirilacak. Devam edilsin mi?', [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          const deletedStoryId = activeStory.id;
          const groupIndex = storyPlayer.groupIndex;
          const storyIndex = storyPlayer.storyIndex;
          const ownerStaffId = activeStoryGroup.staff_id;
          const storiesRemaining = activeStoryGroup.stories.length - 1;
          setStoryBusy(true);
          try {
            log.info('staff/feed/story', 'deleteActiveStory started', { storyId: deletedStoryId });
            const { error } = await softDeleteStory(deletedStoryId);
            if (error) {
              log.error('staff/feed/story', 'deleteActiveStory failed', error);
              Alert.alert('Silinemedi', error.message || 'Hikaye silinirken hata olustu.');
              return;
            }
            log.info('staff/feed/story', 'deleteActiveStory success', { storyId: deletedStoryId });
            setStoryMenuOpen(false);
            setStoryViewersModal(false);
            setStoryRepliesModal(false);
            setStoryGroups((prev) =>
              prev
                .map((g) =>
                  g.staff_id === ownerStaffId
                    ? { ...g, stories: g.stories.filter((s) => s.id !== deletedStoryId) }
                    : g
                )
                .filter((g) => g.stories.length > 0)
            );
            if (storiesRemaining > 0) {
              const nextIndex = Math.min(storyIndex, storiesRemaining - 1);
              setStoryPlayer({ groupIndex, storyIndex: nextIndex });
            } else {
              closeStoryPlayer(true);
            }
            await loadStories();
          } finally {
            setStoryBusy(false);
          }
        },
      },
    ]);
  }, [
    activeStory?.id,
    activeStoryGroup,
    canDeleteActiveStory,
    storyBusy,
    storyPlayer,
    closeStoryPlayer,
    loadStories,
  ]);

  const toggleLike = async (postId: string, authorStaffId: string | null, authorGuestId: string | null) => {
    if (!staff) return;
    setTogglingLike(postId);
    try {
      const liked = myLikes.has(postId);
      if (liked) {
        await supabase.from('feed_post_reactions').delete().eq('post_id', postId).eq('staff_id', staff.id);
        setMyLikes((prev) => {
          const next = new Set(prev);
          next.delete(postId);
          return next;
        });
        setLikeCounts((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] ?? 1) - 1) }));
      } else {
        await supabase.from('feed_post_reactions').insert({ post_id: postId, staff_id: staff.id, reaction: 'like' });
        setMyLikes((prev) => new Set(prev).add(postId));
        setLikeCounts((prev) => ({ ...prev, [postId]: (prev[postId] ?? 0) + 1 }));
        if (authorStaffId && authorStaffId !== staff.id) {
          const liker = staff.full_name ?? feedSharedText('staffOneEmployee');
          const res = await sendNotification({
            staffId: String(authorStaffId),
            title: t('notifNewLikeTitle'),
            body: t('notifNewLikeBody', { name: liker }),
            category: 'staff',
            notificationType: 'feed_like',
            data: { screen: 'staff_feed', url: '/staff', postId },
          });
          if (res?.error) log.warn('StaffFeed', 'Beğeni bildirimi', res.error);
        } else if (authorGuestId) {
          const liker = staff.full_name ?? feedSharedText('staffOneEmployee');
          const res = await sendNotification({
            guestId: authorGuestId,
            title: t('notifNewLikeTitle'),
            body: t('notifNewLikeBody', { name: liker }),
            category: 'guest',
            notificationType: 'feed_like',
            data: { screen: 'customer_feed', url: '/customer/feed/' + postId, postId },
          });
          if (res?.error) log.warn('StaffFeed', 'Beğeni bildirimi (misafir)', res.error);
        }
      }
    } catch (e) {
      // ignore
    }
    setTogglingLike(null);
  };

  const submitComment = async (postId: string, authorStaffId: string | null, authorGuestId: string | null) => {
    const text = (commentText[postId] ?? '').trim();
    if (!staff || !text) return;
    setPostingComment(postId);
    const target = replyTarget?.postId === postId ? replyTarget : null;
    try {
      const { data: inserted } = await supabase
        .from('feed_post_comments')
        .insert({ post_id: postId, staff_id: staff.id, content: text, parent_comment_id: target?.commentId ?? null })
        .select('id, parent_comment_id, content, created_at, staff_id')
        .single();
      setCommentText((prev) => ({ ...prev, [postId]: '' }));
      setReplyTarget((prev) => (prev?.postId === postId ? null : prev));
      const newComment: CommentRow = {
        id: (inserted as { id: string }).id,
        parent_comment_id: (inserted as { parent_comment_id?: string | null }).parent_comment_id ?? null,
        content: text,
        created_at: (inserted as { created_at: string }).created_at,
        staff: { full_name: staff.full_name },
        guest: null,
      };
      setCommentsByPost((prev) => ({
        ...prev,
        [postId]: [...(prev[postId] ?? []), newComment],
      }));
      setCommentCounts((prev) => ({ ...prev, [postId]: (prev[postId] ?? 0) + 1 }));
      const notifyBody = `${staff.full_name ?? 'Bir çalışan'}: ${text.slice(0, 60)}${text.length > 60 ? '…' : ''}`;
      const targetComment = target ? (commentsByPost[postId] ?? []).find((c) => c.id === target.commentId) : null;
      const notifiedStaffIds = new Set<string>();
      if (targetComment?.staff_id && targetComment.staff_id !== staff.id) {
        notifiedStaffIds.add(String(targetComment.staff_id));
        const res = await sendNotification({
          staffId: String(targetComment.staff_id),
          title: 'Yorumuna yanit geldi',
          body: notifyBody,
          category: 'staff',
          notificationType: 'feed_comment_reply',
          data: { screen: 'staff_feed', url: '/staff', postId, parentCommentId: targetComment.id },
        });
        if (res?.error) log.warn('StaffFeed', 'Yanit bildirimi', res.error);
      } else if (targetComment?.guest_id) {
        const res = await sendNotification({
          guestId: targetComment.guest_id,
          title: 'Yorumuna yanit geldi',
          body: notifyBody,
          category: 'guest',
          notificationType: 'feed_comment_reply',
          data: { screen: 'customer_feed', url: '/customer/feed/' + postId, postId, parentCommentId: targetComment.id },
        });
        if (res?.error) log.warn('StaffFeed', 'Yanit bildirimi (misafir)', res.error);
      } else if (authorStaffId && authorStaffId !== staff.id) {
        notifiedStaffIds.add(String(authorStaffId));
        const res = await sendNotification({
          staffId: String(authorStaffId),
          title: 'Yeni yorum',
          body: notifyBody,
          category: 'staff',
          notificationType: 'feed_comment',
          data: { screen: 'staff_feed', url: '/staff', postId },
        });
        if (res?.error) log.warn('StaffFeed', 'Yorum bildirimi', res.error);
      } else if (authorGuestId) {
        const res = await sendNotification({
          guestId: authorGuestId,
          title: 'Yeni yorum',
          body: notifyBody,
          category: 'guest',
          notificationType: 'feed_comment',
          data: { screen: 'customer_feed', url: '/customer/feed/' + postId, postId },
        });
        if (res?.error) log.warn('StaffFeed', 'Yorum bildirimi (misafir)', res.error);
      }
      let prefQ = supabase.from('feed_post_notification_prefs').select('staff_id').eq('post_id', postId).neq('staff_id', staff.id);
      if (authorStaffId) prefQ = prefQ.neq('staff_id', authorStaffId);
      const { data: prefRows } = await prefQ;
      const staffIdsToNotify = (prefRows ?? []).map((r: { staff_id: string }) => r.staff_id);
      for (const sid of staffIdsToNotify) {
        notifiedStaffIds.add(sid);
        sendNotification({
          staffId: sid,
          title: 'Yeni yorum (takip ettiğin paylaşım)',
          body: notifyBody,
          category: 'staff',
          notificationType: 'feed_comment',
          data: { screen: 'staff_feed', url: '/staff', postId },
        }).catch(() => {});
      }
      const mentionStaffIds = await resolveMentionedStaffIdsFromText(text, { excludeStaffId: staff.id });
      for (const sid of mentionStaffIds) {
        if (notifiedStaffIds.has(sid)) continue;
        sendNotification({
          staffId: sid,
          title: 'Senden bahsedildi',
          body: `${staff.full_name ?? 'Bir personel'} bir yorumda seni etiketledi.`,
          category: 'staff',
          notificationType: 'staff_mention',
          data: { screen: 'staff_feed', url: '/staff', postId },
        }).catch(() => {});
      }
    } catch (e) {
      // ignore
    }
    setPostingComment(null);
  };

  const openViewersModal = async (postId: string) => {
    setViewersModalPostId(postId);
    setLoadingViewers(true);
    setViewersList([]);
    const { rows, error } = await loadFeedPostViewers(postId);
    if (error) {
      log.warn('staff/feed openViewersModal', error.message);
    }
    setViewersList(rows);
    setLoadingViewers(false);
  };

  const toggleNotificationPref = async (postId: string) => {
    if (!staff) return;
    setTogglingNotif(postId);
    const isOn = notificationPrefs.has(postId);
    try {
      if (isOn) {
        await supabase.from('feed_post_notification_prefs').delete().eq('post_id', postId).eq('staff_id', staff.id);
        setNotificationPrefs((prev) => {
          const next = new Set(prev);
          next.delete(postId);
          return next;
        });
      } else {
        await supabase.from('feed_post_notification_prefs').upsert(
          { post_id: postId, staff_id: staff.id },
          { onConflict: 'post_id,staff_id' }
        );
        setNotificationPrefs((prev) => new Set(prev).add(postId));
      }
    } catch (e) {
      // ignore
    }
    setTogglingNotif(null);
  };

  const isAdmin = staff?.role === 'admin';
  const canDeletePost = (post: FeedPostRow) => staff && (staff.id === post.staff_id || isAdmin);
  const canDeleteComment = (c: CommentRow) =>
    !!staff && (isAdmin || (!!c.staff_id && c.staff_id === staff.id));

  const deleteComment = (postId: string, commentId: string) => {
    if (!staff) return;
    Alert.alert(t('deleteCommentTitle'), t('deleteCommentMessage'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('feed_post_comments').delete().eq('id', commentId);
          if (error) {
            Alert.alert(t('error'), error.message || t('commentDeleteFailed'));
            return;
          }
          setCommentsByPost((prev) => ({
            ...prev,
            [postId]: (prev[postId] ?? []).filter((c) => c.id !== commentId),
          }));
          setCommentCounts((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] ?? 1) - 1) }));
        },
      },
    ]);
  };

  const handleDeletePost = (post: FeedPostRow) => {
    setMenuPostId(null);
    if (!canDeletePost(post)) return;
    Alert.alert(
      t('deletePostTitle'),
      feedSharedText('staffDeletePostConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            setDeletingPostId(post.id);
            try {
              const { data, error } = await supabase
                .from('feed_posts')
                .delete()
                .eq('id', post.id)
                .select('id');
              if (error) {
                Alert.alert(t('error'), error.message || t('postDeleteFailed'));
                return;
              }
              if (data && data.length > 0) {
                await removeFeedMediaObjectsForPostUrls([post.media_url, post.thumbnail_url]);
                setPosts((prev) => prev.filter((p) => p.id !== post.id));
              } else {
                Alert.alert(t('error'), feedSharedText('staffDeletePostNoPermission'));
              }
            } catch (e) {
              Alert.alert(t('error'), (e as Error).message || t('unknownError'));
            } finally {
              setDeletingPostId(null);
            }
          },
        },
      ]
    );
  };

  const promotePostToCustomers = async (post: FeedPostRow) => {
    if (!canDeletePost(post)) return;
    if (post.visibility !== 'all_staff') return;
    setMenuPostId(null);
    setPromotingPostId(post.id);
    try {
      const { data, error } = await supabase
        .from('feed_posts')
        .update({ visibility: 'customers' })
        .eq('id', post.id)
        .select('id')
        .single();
      if (error || !data?.id) {
        Alert.alert(t('error'), error?.message || feedSharedText('staffPostUpdateFailed'));
        return;
      }
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, visibility: 'customers' } : p))
      );
      await notifyGuestsOfNewFeedPost(post.id);
      Alert.alert(t('info'), feedSharedText('staffPromoteSuccess'));
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message || feedSharedText('staffPromoteFail'));
    } finally {
      setPromotingPostId(null);
    }
  };

  const openReportModal = (post: FeedPostRow) => {
    setMenuPostId(null);
    setReportPost(post);
    setReportReason('');
    setReportDetails('');
  };

  const handleBlockPostAuthor = (post: FeedPostRow) => {
    if (!staff?.id) return;
    const blockedType = post.staff_id ? 'staff' : post.guest_id ? 'guest' : null;
    const blockedId = post.staff_id ?? post.guest_id ?? null;
    if (!blockedType || !blockedId) return;
    if (blockedType === 'staff' && blockedId === staff.id) {
      Alert.alert(t('warning'), t('cannotBlockSelf'));
      return;
    }
    const postStaff = unwrapFeedRelation(
      post.staff as { full_name?: string | null; profile_hidden_by_admin?: boolean | null } | null
    );
    const postGuest = unwrapFeedRelation(post.guest as { full_name?: string | null } | null);
    const targetName = post.staff_id
      ? displayStaffNameForViewer(
          postStaff?.full_name ?? null,
          postStaff?.profile_hidden_by_admin ?? null,
          staff?.role === 'admin',
          t('thisUser')
        )
      : guestDisplayName(postGuest?.full_name, t('thisUser'));
    Alert.alert(t('blockUserTitle'), t('blockUserMessage', { name: targetName }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('block'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await blockUserForStaff({
            blockerStaffId: staff.id,
            blockedType,
            blockedId,
          });
          if (error && error.code !== '23505') {
            Alert.alert(t('error'), error.message || t('blockUserFailed'));
            return;
          }
          setMenuPostId(null);
          await loadFeed();
        },
      },
    ]);
  };

  const submitReport = async () => {
    if (!reportPost || !staff || !reportReason.trim()) return;
    const reasonLabel = reportReasons.find((r) => r.value === reportReason)?.label ?? reportReason;
    setSubmittingReport(true);
    try {
      const postTitle = (reportPost.title ?? '').trim() || t('post');
      const reporterName = staff.full_name ?? feedSharedText('staffOneEmployee');
      const body = `${reporterName}: "${postTitle}" — ${reasonLabel}${reportDetails.trim() ? ` — ${reportDetails.trim()}` : ''}`;
      const { error: insertErr } = await supabase.from('feed_post_reports').insert({
        post_id: reportPost.id,
        reporter_staff_id: staff.id,
        reason: reportReason,
        details: reportDetails.trim() || null,
        status: 'pending',
      });
      if (insertErr) {
        setSubmittingReport(false);
        Alert.alert(t('error'), t('reportSaveFailed'));
        return;
      }
      await notifyAdmins({
        title: feedSharedText('staffReportAdminTitle'),
        body,
        data: {
          url: '/admin/reports',
          screen: 'admin',
          postId: reportPost.id,
          reason: reportReason,
          reporterStaffId: staff.id,
        },
      });
      setReportPost(null);
      setReportReason('');
      setReportDetails('');
      Alert.alert(
        t('reportReceivedTitle'),
        t('reportReceivedMessage'),
        [{ text: t('ok') }]
      );
    } catch (e) {
      Alert.alert(t('error'), t('reportSendFailed'));
    }
    setSubmittingReport(false);
  };

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const navigation = useNavigation();
  useEffect(() => {
    const parent = navigation.getParent();
    const unsub = parent?.addListener?.('tabPress', () => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
    return () => (typeof unsub === 'function' ? unsub() : undefined);
  }, [navigation]);

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
      return target?.id ? `/staff/profile/${target.id}` : null;
    },
    [mentionDirectory]
  );

  const renderStaffAvatarCard = useCallback(
    (s: StaffAvatarRow) => {
      const name = displayStaffNameForViewer(
        s.full_name,
        s.profile_hidden_by_admin ?? null,
        staff?.role === 'admin',
        '—'
      );
      const staffStory = storyGroupByStaffId.get(s.id);
      const hasStory = !!staffStory;
      const isMe = s.id === staff?.id;
      const ringColors = hasStory
        ? staffStory?.has_unseen
          ? [pds.gradientStoryRing[0], '#FF5AD0', pds.gradientStoryRing[1]]
          : ['#FEC8A8', '#FD9BC2', '#F9A8D4']
        : ['#e5e7eb', '#d1d5db'];
      return (
        <TouchableOpacity
          key={s.id}
          style={styles.staffAvatarCard}
          onPress={() => {
            if (hasStory) {
              openStoryByStaffId(s.id);
              return;
            }
            if (isMe) {
              router.push('/staff/feed/story-new');
              return;
            }
            router.push(`/staff/profile/${s.id}`);
          }}
          activeOpacity={0.85}
        >
          <View style={styles.staffAvatarCardInner}>
            <LinearGradient
              colors={ringColors as [string, string, ...string[]]}
              start={{ x: 0.1, y: 0.2 }}
              end={{ x: 0.9, y: 0.8 }}
              style={styles.staffAvatarRing}
            >
              <AvatarWithBadge badge={s.verification_badge ?? null} avatarSize={64} badgeSize={14} showBadge={false}>
                {s.profile_image ? (
                  <CachedImage uri={s.profile_image} style={styles.staffAvatarImg} contentFit="cover" />
                ) : (
                  <View style={styles.staffAvatarPlaceholder}>
                    <Text style={styles.staffAvatarLetter}>{name.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
              </AvatarWithBadge>
              {isMe ? (
                <View style={styles.storyAddBadge}>
                  <Ionicons name="add" size={13} color="#fff" />
                </View>
              ) : null}
              {isMe || hasStory ? (
                <View
                  style={[styles.storyOnlineDot, isMe ? styles.storyOnlineDotLeft : styles.storyOnlineDotRight]}
                />
              ) : null}
            </LinearGradient>
            <StaffNameWithBadge name={name} badge={s.verification_badge ?? null} textStyle={styles.staffAvatarName} />
            {!s.profile_hidden_by_admin && (s.department || s.position) ? (
              <Text style={styles.staffAvatarRole} numberOfLines={1}>
                {s.department || s.position || ''}
              </Text>
            ) : s.profile_hidden_by_admin && staff?.role !== 'admin' ? (
              <Text style={styles.staffAvatarRole} numberOfLines={1}>
                —
              </Text>
            ) : null}
            {!s.profile_hidden_by_admin && s.organization?.name ? (
              <Text style={styles.staffAvatarOrg} numberOfLines={2}>
                {s.organization.name}
                {s.organization.kind === 'tour_office' ? ' • Ofis' : s.organization.kind ? ' • Otel' : ''}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>
      );
    },
    [staff?.id, staff?.role, storyGroupByStaffId, openStoryByStaffId, router]
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior={Platform.OS === 'ios' ? 'automatic' : undefined}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={Platform.OS === 'android'}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.white} />
        }
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.staffAvatarsSection}>
          <View style={styles.staffSectionHead}>
            <Text style={styles.staffAvatarsSectionLabel}>Aktif Ekip</Text>
            <Text style={styles.staffSectionSub}>Story: 24 saat</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.staffAvatarsScroll}
            contentContainerStyle={styles.staffAvatarsScrollContent}
          >
            {orderedStaffList.map((s) => renderStaffAvatarCard(s))}
          </ScrollView>
        </View>

        {(() => {
          if (loading && posts.length === 0) {
            return (
              <View style={{ marginTop: 12, gap: 14, paddingHorizontal: 16 }}>
                {[1, 2, 3].map((i) => (
                  <SkeletonCard key={`staff-feed-sk-${i}`} />
                ))}
              </View>
            );
          }
          if (posts.length === 0) {
            return (
              <View style={styles.empty}>
                <Ionicons name="images-outline" size={64} color={theme.colors.textMuted} />
                <Text style={styles.emptyText}>Henüz paylaşım yok</Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/staff/feed/new')} activeOpacity={0.8}>
                  <Text style={styles.emptyBtnText}>İlk paylaşımı yap</Text>
                </TouchableOpacity>
              </View>
            );
          }
          const feedCardWidth = feedPostCardWidth(SCREEN_WIDTH);
          return visiblePosts.map((p) => {
            const maySeeHiddenFull = staff?.role === 'admin';
            const likeCount = likeCounts[p.id] ?? 0;
            const commentCount = commentCounts[p.id] ?? 0;
            const viewCount = viewCounts[p.id] ?? 0;
            const liked = myLikes.has(p.id);
            const notifOn = notificationPrefs.has(p.id);
            const comments = commentsByPost[p.id] ?? [];
            const commentPreview = comments
              .slice(-2)
              .map((c) => ({
                author: c.staff
                  ? displayStaffNameForViewer(
                      (c.staff as { full_name?: string | null; profile_hidden_by_admin?: boolean | null } | null)?.full_name ?? null,
                      (c.staff as { profile_hidden_by_admin?: boolean | null } | null)?.profile_hidden_by_admin ?? null,
                      maySeeHiddenFull,
                      'Personel'
                    )
                  : guestDisplayName((c.guest as { full_name?: string | null } | null)?.full_name, 'Misafir'),
                text: (c.content ?? '').trim(),
              }))
              .filter((x) => x.text);
            const staffInfo = parseFeedStaffEmbed(p.staff);
            const guestInfo = parseFeedGuestEmbed(p.guest);
            const isGuestPost = !p.staff_id;
            const authorName = isGuestPost
              ? guestDisplayName(guestInfo?.full_name, 'Misafir')
              : displayStaffNameForViewer(
                  staffInfo?.full_name ?? null,
                  staffInfo?.profile_hidden_by_admin ?? null,
                  maySeeHiddenFull,
                  '—'
                );
            const authorAvatar = resolveFeedAuthorAvatarUrl({
              staff: p.staff,
              guest: p.guest,
              staffId: p.staff_id,
              staffAvatarById,
            });
            const authorBadge = staffInfo?.verification_badge ?? null;
            const orgName = staffInfo?.organization?.name?.trim() || null;
            const orgKind = staffInfo?.organization?.kind === 'tour_office' ? 'Ofis' : staffInfo?.organization?.kind ? 'Otel' : null;
            const roleBase = staffInfo?.department || staffInfo?.position || null;
            const orgLabel = orgName ? `${orgName}${orgKind ? ` (${orgKind})` : ''}` : null;
            const roleLabel = isGuestPost
              ? null
              : staffInfo?.profile_hidden_by_admin && !maySeeHiddenFull
                ? '—'
                : [roleBase, orgLabel].filter(Boolean).join(' • ') || null;
            const mediaItems = (p.media_items && p.media_items.length > 0)
              ? p.media_items
              : (p.media_type !== 'text' && (p.media_url || p.thumbnail_url)
                ? [{ media_type: p.media_type === 'video' ? 'video' : 'image', media_url: p.media_url || p.thumbnail_url || '', thumbnail_url: p.thumbnail_url, sort_order: 0 }]
                : []);
            const hasMedia = mediaItems.length > 0;
            const feedMediaHeight = feedPostMediaHeightForItems(feedCardWidth, mediaItems);
            const mediaEl =
              hasMedia ? (
                <View style={[styles.postImageWrap, { height: feedMediaHeight }]}>
                  <FeedMediaCarousel
                    items={mediaItems.map((m, i) => ({ id: `${p.id}-${i}`, media_type: m.media_type, media_url: m.media_url, thumbnail_url: m.thumbnail_url }))}
                    width={feedCardWidth}
                    height={feedMediaHeight}
                    videoPosterOnly
                    onPressItem={(item) => {
                      if (item.media_type === 'video') {
                        setFullscreenPostMedia({
                          uri: item.media_url,
                          mediaType: 'video',
                          postId: p.id,
                          posterUri: item.thumbnail_url ?? undefined,
                        });
                      } else {
                        setFullscreenPostMedia({
                          uri: item.thumbnail_url || item.media_url,
                          mediaType: 'image',
                          postId: p.id,
                        });
                      }
                    }}
                  />
                </View>
              ) : null;

            const isOwnStaffPost = !!(staff?.id && p.staff_id === staff.id);
            const canOpenViewersList = !!(staff?.id && (isOwnStaffPost || isGuestPost));
            return (
              <View
                key={p.id}
                collapsable={false}
                onLayout={
                  Platform.OS === 'android' && pendingScrollPostId !== p.id
                    ? undefined
                    : (e) => {
                        postYRef.current[p.id] = e.nativeEvent.layout.y;
                      }
                }
              >
                <StaffFeedPostCard
                  postTag={p.post_tag}
                  authorName={authorName}
                  authorAvatarUrl={authorAvatar}
                  authorBadge={authorBadge}
                  isGuestPost={isGuestPost}
                  roleLabel={roleLabel}
                  timeAgo={timeAgoFn(p.created_at) || feedSharedText('timeJustNow')}
                  createdAtLabel={formatDateTime(p.created_at)}
                  title={p.title}
                  media={mediaEl}
                  hasMedia={!!hasMedia}
                  liked={liked}
                  likeCount={likeCount}
                  commentCount={commentCount}
                  viewCount={viewCount}
                  showViewStats
                  viewersListEnabled={canOpenViewersList}
                  commentPreview={commentPreview}
                  togglingLike={togglingLike === p.id}
                  deletingPost={deletingPostId === p.id}
                  onAuthorPress={
                    p.staff_id
                      ? () => openStaffProfileWithVisit(router, p.staff_id!, 'staff', staff?.id)
                      : undefined
                  }
                  onLike={() => toggleLike(p.id, p.staff_id, p.guest_id ?? null)}
                  onComment={() => setCommentsSheetPostId(commentsSheetPostId === p.id ? null : p.id)}
                  onDetailsPress={() => setCommentsSheetPostId(commentsSheetPostId === p.id ? null : p.id)}
                  onViewers={() => {
                    if (canOpenViewersList) void openViewersModal(p.id);
                  }}
                  onMenu={() => setMenuPostId(menuPostId === p.id ? null : p.id)}
                />
                {/* Menü modal: Sil / Bildir */}
                <Modal
                  visible={menuPostId === p.id}
                  transparent
                  animationType="fade"
                  onRequestClose={() => setMenuPostId(null)}
                >
                  <Pressable style={styles.menuModalOverlay} onPress={() => setMenuPostId(null)}>
                    <View style={styles.menuModalBox}>
                      <TouchableOpacity
                        style={styles.menuModalItem}
                        onPress={() => {
                          void toggleNotificationPref(p.id);
                          setMenuPostId(null);
                        }}
                        activeOpacity={0.7}
                        disabled={togglingNotif === p.id}
                      >
                        {togglingNotif === p.id ? (
                          <ActivityIndicator size="small" color={theme.colors.primary} />
                        ) : (
                          <Ionicons
                            name={notifOn ? 'notifications' : 'notifications-outline'}
                            size={22}
                            color={theme.colors.primary}
                          />
                        )}
                        <Text style={styles.menuModalItemText}>
                          {notifOn ? 'Bu gönderi bildirimlerini kapat' : 'Bu gönderi için bildirim aç'}
                        </Text>
                      </TouchableOpacity>
                      {canDeletePost(p) && (
                        <>
                        {p.visibility === 'all_staff' ? (
                          <TouchableOpacity
                            style={styles.menuModalItem}
                            onPress={() => promotePostToCustomers(p)}
                            activeOpacity={0.7}
                            disabled={promotingPostId === p.id}
                          >
                            {promotingPostId === p.id ? (
                              <ActivityIndicator size="small" color={theme.colors.primary} />
                            ) : (
                              <Ionicons name="people-circle-outline" size={22} color={theme.colors.primary} />
                            )}
                            <Text style={styles.menuModalItemText}>Misafirlere de goster</Text>
                          </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity
                          style={styles.menuModalItem}
                          onPress={() => handleDeletePost(p)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="trash-outline" size={22} color={theme.colors.error} />
                          <Text style={[styles.menuModalItemText, { color: theme.colors.error }]}>Sil</Text>
                        </TouchableOpacity>
                        </>
                      )}
                      <TouchableOpacity
                        style={styles.menuModalItem}
                        onPress={() => handleBlockPostAuthor(p)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="ban-outline" size={22} color={theme.colors.error} />
                        <Text style={[styles.menuModalItemText, { color: theme.colors.error }]}>Engelle</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.menuModalItem}
                        onPress={() => openReportModal(p)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="flag-outline" size={22} color={theme.colors.text} />
                        <Text style={styles.menuModalItemText}>Bildir</Text>
                      </TouchableOpacity>
                    </View>
                  </Pressable>
                </Modal>
              </View>
            );
          }).concat(
            posts.length > visibleFeedCount
              ? (
                <TouchableOpacity key="staff-feed-more" style={styles.showMoreBtn} onPress={() => setVisibleFeedCount((c) => c + FEED_PAGE_SIZE)} activeOpacity={0.85}>
                  <Text style={styles.showMoreBtnText}>Daha fazla göster</Text>
                </TouchableOpacity>
              )
              : []
          );
        })()}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Bildir modal: sebep seçenekleri + açıklama */}
      <Modal
        visible={!!reportPost}
        animationType="slide"
        transparent
        onRequestClose={() => setReportPost(null)}
      >
        <Pressable style={styles.reportModalOverlay} onPress={() => setReportPost(null)}>
          <Pressable style={styles.reportModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.reportModalHeader}>
              <Text style={styles.reportModalTitle}>Paylaşımı bildir</Text>
              <TouchableOpacity onPress={() => setReportPost(null)} hitSlop={16}>
                <Ionicons name="close" size={28} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.reportModalScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.reportModalSubtitle}>Bildirim sebebi (zorunlu)</Text>
              {reportReasons.map((r) => (
                <TouchableOpacity
                  key={r.value}
                  style={[styles.reportReasonRow, reportReason === r.value && styles.reportReasonRowSelected]}
                  onPress={() => setReportReason(r.value)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={reportReason === r.value ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={reportReason === r.value ? theme.colors.primary : theme.colors.textMuted}
                  />
                  <Text style={styles.reportReasonLabel}>{r.label}</Text>
                </TouchableOpacity>
              ))}
              <Text style={styles.reportModalSubtitle}>Ek açıklama (isteğe bağlı)</Text>
              <TextInput
                style={styles.reportDetailsInput}
                placeholder="Detay yazabilirsiniz..."
                placeholderTextColor={theme.colors.textMuted}
                value={reportDetails}
                onChangeText={setReportDetails}
                multiline
                maxLength={300}
                editable={!submittingReport}
              />
              <TouchableOpacity
                style={[styles.reportSubmitBtn, (!reportReason.trim() || submittingReport) && styles.reportSubmitBtnDisabled]}
                onPress={submitReport}
                disabled={!reportReason.trim() || submittingReport}
                activeOpacity={0.8}
              >
                {submittingReport ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.reportSubmitBtnText}>Gönder</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={!!viewersModalPostId}
        animationType="slide"
        transparent
        onRequestClose={() => setViewersModalPostId(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setViewersModalPostId(null)}
        >
          <View style={[styles.viewersModalContent, { height: SCREEN_HEIGHT * 0.5 }]}>
            <View style={styles.viewersModalHeader}>
              <Text style={styles.viewersModalTitle}>Görenler</Text>
              <TouchableOpacity onPress={() => setViewersModalPostId(null)} hitSlop={16}>
                <Ionicons name="close" size={28} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            {loadingViewers ? (
              <ActivityIndicator size="large" color={theme.colors.primary} style={styles.viewersLoader} />
            ) : (
              <View style={styles.viewersListWrap}>
                <FlatList
                  data={viewersList}
                  keyExtractor={(item) => item.id}
                  ListEmptyComponent={<Text style={styles.viewersEmpty}>Henüz görüntüleyen yok</Text>}
                  renderItem={({ item }) => {
                    const v = item as FeedPostViewerRow;
                    const isGuest = v.is_guest;
                    const name = isGuest
                      ? guestDisplayName(v.viewer_name, '—')
                      : (v.viewer_name?.trim() || '—');
                    const img = v.viewer_avatar?.trim() || null;
                    const badge = v.verification_badge;
                    return (
                      <View style={styles.viewerRow}>
                        <AvatarWithBadge badge={badge} avatarSize={44} badgeSize={12} showBadge={false}>
                          {img ? (
                            <CachedImage uri={img} style={styles.viewerAvatar} contentFit="cover" />
                          ) : (
                            <View style={[styles.viewerAvatar, isGuest ? styles.viewerAvatarLetterGuest : styles.viewerAvatarLetter]}>
                              <Text style={styles.viewerAvatarText}>{name.charAt(0).toUpperCase()}</Text>
                            </View>
                          )}
                        </AvatarWithBadge>
                        <View style={styles.viewerInfo}>
                          {isGuest ? (
                            <Text style={styles.viewerName}>{name}</Text>
                          ) : (
                            <StaffNameWithBadge name={name} badge={badge} textStyle={styles.viewerName} />
                          )}
                          <Text style={styles.viewerTime}>{formatDateTime(v.viewed_at)}</Text>
                        </View>
                      </View>
                    );
                  }}
                />
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Yorum kartı: ekranın yarısına kadar açılır, aşağı yukarı kaydırılabilir; Android'de klavye yüksekliği manuel padding ile (titreme önlenir) */}
      <Modal
        visible={!!commentsSheetPostId}
        animationType="slide"
        transparent
        onRequestClose={() => setCommentsSheetPostId(null)}
      >
        <KeyboardAvoidingView
          style={styles.commentSheetOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setCommentsSheetPostId(null)} />
          <Animated.View
            style={[
              styles.commentSheetCard,
              { height: commentSheetHeight },
              Platform.OS === 'android' && commentSheetKeyboardH > 0 && { paddingBottom: commentSheetKeyboardH + 16 },
            ]}
          >
            <Pressable style={styles.commentSheetHandleWrap} {...commentSheetPanResponder.panHandlers}>
              <View style={styles.commentSheetHandle} />
            </Pressable>
            <View style={styles.commentSheetHeader}>
              <Text style={styles.commentSheetTitle}>Yorumlar</Text>
              <TouchableOpacity onPress={() => setCommentsSheetPostId(null)} hitSlop={16}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            {commentsSheetPostId && (() => {
              const post = posts.find((x) => x.id === commentsSheetPostId);
              const comments = commentsByPost[commentsSheetPostId] ?? [];
              const topLevelComments = comments.filter((c) => !c.parent_comment_id);
              const repliesByParent = comments.reduce<Record<string, CommentRow[]>>((acc, c) => {
                if (!c.parent_comment_id) return acc;
                if (!acc[c.parent_comment_id]) acc[c.parent_comment_id] = [];
                acc[c.parent_comment_id].push(c);
                return acc;
              }, {});
              if (!post) return null;
              return (
                <>
                  <ScrollView
                    style={styles.commentSheetScroll}
                    contentContainerStyle={styles.commentSheetScrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled
                    refreshControl={
                      <RefreshControl
                        refreshing={commentsSheetRefreshing}
                        onRefresh={refreshCommentsSheet}
                        tintColor={theme.colors.primary}
                        colors={[theme.colors.primary]}
                      />
                    }
                  >
                    {comments.length === 0 ? (
                      <Text style={styles.commentSheetEmpty}>Henüz yorum yok. İlk yorumu sen yap.</Text>
                    ) : (
                      topLevelComments.map((c) => {
                        const isGuestComment = !c.staff_id && !!c.guest_id;
                        const maySeeHiddenFull = staff?.role === 'admin';
                        const staffHidden = !!(c.staff as { profile_hidden_by_admin?: boolean | null })?.profile_hidden_by_admin;
                        const authorName = isGuestComment
                          ? guestDisplayName((c.guest as { full_name?: string | null } | null)?.full_name, '—')
                          : displayStaffNameForViewer(
                              (c.staff as { full_name?: string | null } | null)?.full_name ?? null,
                              staffHidden,
                              maySeeHiddenFull,
                              '—'
                            );
                        const badge = (c.staff as { verification_badge?: 'blue' | 'yellow' | null } | null)?.verification_badge ?? null;
                        const avatarUri = (c.staff as { profile_image?: string | null } | null)?.profile_image ?? (c.guest as { photo_url?: string | null } | null)?.photo_url ?? null;
                        const profileHref =
                          c.staff_id && !(staffHidden && !maySeeHiddenFull)
                            ? `/staff/profile/${c.staff_id}`
                            : c.guest_id
                              ? `/staff/guests/${c.guest_id}`
                              : null;
                        const deletable = canDeleteComment(c);
                        return (
                          <View
                            key={c.id}
                            style={styles.commentSheetRow}
                          >
                            <TouchableOpacity
                              onPress={() => profileHref && router.push(profileHref)}
                              activeOpacity={profileHref ? 0.7 : 1}
                              disabled={!profileHref}
                            >
                              {avatarUri ? (
                                <CachedImage uri={avatarUri} style={styles.commentSheetAvatar} contentFit="cover" />
                              ) : (
                                <View style={isGuestComment ? styles.commentSheetAvatarPlaceholderGuest : styles.commentSheetAvatarPlaceholder}>
                                  <Text style={isGuestComment ? styles.commentSheetAvatarInitialGuest : styles.commentSheetAvatarInitial}>{(authorName || '—').charAt(0).toUpperCase()}</Text>
                                </View>
                              )}
                            </TouchableOpacity>
                            <View style={styles.commentSheetRowBody}>
                              <TouchableOpacity
                                onPress={() => profileHref && router.push(profileHref)}
                                activeOpacity={profileHref ? 0.7 : 1}
                                disabled={!profileHref}
                              >
                                {c.staff ? (
                                  <StaffNameWithBadge name={authorName} badge={badge} textStyle={styles.commentSheetAuthor} />
                                ) : (
                                  <Text style={styles.commentSheetAuthor}>{authorName}</Text>
                                )}
                              </TouchableOpacity>
                              <MentionableText
                                text={c.content}
                                textStyle={styles.commentSheetText}
                                mentionStyle={styles.commentMention}
                                resolveMentionHref={resolveMentionHref}
                                onMentionPress={(href) => router.push(href)}
                              />
                              <View style={styles.commentSheetMetaRow}>
                                <Text style={styles.commentSheetTime}>{timeAgoFn(c.created_at)}</Text>
                                <View style={styles.commentSheetActionsRight}>
                                  <TouchableOpacity
                                    onPress={() => setReplyTarget({ postId: post.id, commentId: c.id, author: authorName })}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                  >
                                    <Text style={styles.commentReplyText}>Yanitla</Text>
                                  </TouchableOpacity>
                                  {deletable ? (
                                    <TouchableOpacity onPress={() => deleteComment(post.id, c.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                      <Text style={styles.commentDeleteText}>Sil</Text>
                                    </TouchableOpacity>
                                  ) : null}
                                </View>
                              </View>
                              {(() => {
                                const replies = repliesByParent[c.id] ?? [];
                                if (replies.length === 0) return null;
                                return (
                                  <View style={styles.replyListWrap}>
                                    {replies.slice(0, 2).map((r) => {
                                      const rHidden = !!(r.staff as { profile_hidden_by_admin?: boolean | null })?.profile_hidden_by_admin;
                                      const rAuthor = r.staff
                                        ? displayStaffNameForViewer(
                                            (r.staff as { full_name?: string | null } | null)?.full_name ?? null,
                                            rHidden,
                                            staff?.role === 'admin',
                                            '—'
                                          )
                                        : guestDisplayName((r.guest as { full_name?: string | null } | null)?.full_name, '—');
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
                                          <Text style={styles.replyTime}>{timeAgoFn(r.created_at)}</Text>
                                        </View>
                                      );
                                    })}
                                    {replies.length > 2 ? (
                                      <Text style={styles.replyMoreText}>+{replies.length - 2} yanit daha</Text>
                                    ) : null}
                                  </View>
                                );
                              })()}
                            </View>
                          </View>
                        );
                      })
                    )}
                  </ScrollView>
                  {mentionSuggestions.length > 0 ? (
                    <View style={styles.mentionPanel}>
                      {mentionSuggestions.map((s) => (
                        <TouchableOpacity
                          key={s.id}
                          style={styles.mentionRow}
                          onPress={() => openMentionedStaffProfile(s.id)}
                          activeOpacity={0.75}
                        >
                          <Text style={styles.mentionRowText}>@{(s.full_name ?? '').trim()}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : mentionQuery.length > 0 ? (
                    <View style={styles.mentionPanel}>
                      <Text style={styles.mentionEmptyText}>Sonuc bulunamadi</Text>
                    </View>
                  ) : null}
                  <View style={styles.commentSheetInputRow}>
                    {replyTarget?.postId === post.id ? (
                      <View style={styles.replyTargetChip}>
                        <Text style={styles.replyTargetText}>@{replyTarget.author} yanit yaziyorsun...</Text>
                        <TouchableOpacity onPress={() => setReplyTarget(null)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                          <Ionicons name="close" size={15} color={theme.colors.textMuted} />
                        </TouchableOpacity>
                      </View>
                    ) : null}
                    <TextInput
                      style={styles.commentSheetInput}
                      placeholder={replyTarget?.postId === post.id ? 'Yanit yaz...' : 'Yorum yaz...'}
                      placeholderTextColor={theme.colors.textMuted}
                      value={commentText[post.id] ?? ''}
                      onChangeText={(t) => setCommentText((prev) => ({ ...prev, [post.id]: t }))}
                      multiline
                      maxLength={500}
                      editable={postingComment !== post.id}
                    />
                    <TouchableOpacity
                      style={[styles.commentSendBtn, (!(commentText[post.id] ?? '').trim() || postingComment === post.id) && styles.commentSendBtnDisabled]}
                      onPress={() => submitComment(post.id, post.staff_id, post.guest_id ?? null)}
                      disabled={!(commentText[post.id] ?? '').trim() || postingComment === post.id}
                      activeOpacity={0.8}
                    >
                      {postingComment === post.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons name="send" size={20} color="#fff" />
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              );
            })()}
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Gönderi medyası tam ekran: yükleme çubuğu, sol/sağ tıkla sarma, yorum kartı birlikte açılır */}
      <Modal
        visible={!!fullscreenPostMedia}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => { setFullscreenPostMedia(null); setCommentsSheetPostId(null); }}
      >
        <View style={styles.fullscreenOverlay}>
          {fullscreenPostMedia ? (
            <>
              {fullscreenPostMedia.mediaType === 'video' ? (
                <>
                  <FeedFullscreenVideoPlayer
                    ref={fullscreenVideoRef}
                    uri={fullscreenPostMedia.uri}
                    posterUri={fullscreenPostMedia.posterUri}
                    progressUpdateIntervalMillis={500}
                    onReady={() => setFullscreenVideoReady(true)}
                  />
                  <View style={styles.fullscreenSeekZones} pointerEvents="box-none">
                      <Pressable
                        style={styles.fullscreenSeekZoneLeft}
                        onPress={(e) => {
                          e.stopPropagation();
                          fullscreenVideoRef.current?.getStatusAsync().then((s) => {
                            if (s.isLoaded && 'positionMillis' in s) {
                              const pos = Math.max(0, (s.positionMillis ?? 0) - 10000);
                              fullscreenVideoRef.current?.setPositionAsync(pos);
                            }
                          });
                        }}
                      />
                      <Pressable style={styles.fullscreenSeekZoneCenter} onPress={() => { setFullscreenPostMedia(null); setCommentsSheetPostId(null); }} />
                      <Pressable
                        style={styles.fullscreenSeekZoneRight}
                        onPress={(e) => {
                          e.stopPropagation();
                          fullscreenVideoRef.current?.getStatusAsync().then((s) => {
                            if (s.isLoaded && 'positionMillis' in s) {
                              const dur = (s as { durationMillis?: number }).durationMillis ?? 0;
                              const pos = Math.min(dur, (s.positionMillis ?? 0) + 10000);
                              fullscreenVideoRef.current?.setPositionAsync(pos);
                            }
                          });
                        }}
                      />
                    </View>
                  </>
              ) : (
                <Pressable
                  style={styles.fullscreenImageWrap}
                  onPress={() => { setFullscreenPostMedia(null); setCommentsSheetPostId(null); }}
                >
                  <CachedImage
                    uri={fullscreenPostMedia.uri}
                    style={[styles.fullscreenImage, { width: SCREEN_WIDTH, height: SCREEN_HEIGHT }]}
                    contentFit="contain"
                  />
                </Pressable>
              )}
            </>
          ) : null}
        </View>
      </Modal>

      <Modal
        visible={!!storyPlayer && !!activeStory}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeStoryPlayer}
      >
        <KeyboardAvoidingView
          style={styles.storyFullscreenRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          {activeStory && activeStoryGroup ? (
            <View style={styles.storyFullscreenRoot}>
              <View style={styles.storyMediaFullscreen} pointerEvents="box-none">
                {activeStory.media_type === 'video' ? (
                  <StoryMuxVideo
                    key={activeStory.id}
                    mediaUrl={activeStory.media_url}
                    thumbnailUrl={activeStory.thumbnail_url}
                    style={styles.storyMedia}
                    shouldPlay
                    resizeMode="cover"
                    isMuted={false}
                    useNativeControls={false}
                  />
                ) : (
                  <CachedImage uri={activeStory.media_url} style={styles.storyMedia} contentFit="contain" />
                )}
                <View style={styles.storyTapZones} pointerEvents={storyOverlayOpen ? 'none' : 'box-none'}>
                  <Pressable style={styles.storyTapZoneLeft} onPress={goToPrevStory} />
                  <Pressable style={styles.storyTapZoneRight} onPress={goToNextStory} />
                </View>
              </View>

              <View
                style={[
                  styles.storyChromeTop,
                  { paddingTop: insets.top + 8, zIndex: storyMenuOpen ? 36 : 4 },
                ]}
                pointerEvents="box-none"
              >
                <View style={styles.storyProgressRow}>
                  {activeStoryGroup.stories.map((s, idx) => {
                    const isCurrent = idx === (storyPlayer?.storyIndex ?? 0);
                    const isPast = idx < (storyPlayer?.storyIndex ?? 0);
                    const fill = isPast ? 1 : isCurrent ? storyProgress : 0;
                    return (
                      <View key={s.id} style={styles.storyProgressTrack}>
                        <View style={[styles.storyProgressFill, { flex: fill }]} />
                      </View>
                    );
                  })}
                </View>
                <View style={styles.storyModalHeader}>
                  <TouchableOpacity
                    style={styles.storyModalAuthorRow}
                    activeOpacity={0.75}
                    onPress={() => {
                      closeStoryPlayer();
                      setTimeout(() => {
                        router.push(`/staff/profile/${activeStoryGroup.staff_id}`);
                      }, 50);
                    }}
                  >
                    {activeStoryGroup.author_avatar ? (
                      <CachedImage uri={activeStoryGroup.author_avatar} style={styles.storyModalAvatar} contentFit="cover" />
                    ) : (
                      <View style={styles.storyModalAvatarFallback}>
                        <Text style={styles.storyModalAvatarText}>{firstName(activeStoryGroup.author_name).charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    <View>
                      <Text style={styles.storyModalAuthor}>{activeStoryGroup.author_name}</Text>
                      <Text style={styles.storyModalTime}>{timeAgoFn(activeStory.created_at)}</Text>
                    </View>
                  </TouchableOpacity>
                  <View style={styles.storyHeaderActions}>
                    <TouchableOpacity
                      onPress={() => {
                        log.info('staff/feed/story', 'story menu pressed', {
                          storyId: activeStory.id,
                          canDeleteActiveStory,
                          currentUserStaffId: staff?.id,
                          storyOwnerStaffId: activeStory?.staff_id,
                        });
                        setStoryMenuOpen(true);
                      }}
                      hitSlop={{ top: 16, bottom: 16, left: 16, right: 8 }}
                      style={styles.storyHeaderIconBtn}
                      accessibilityLabel="Hikaye menüsü"
                    >
                      <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setStoryMenuOpen(false);
                        closeStoryPlayer();
                      }}
                      hitSlop={{ top: 16, bottom: 16, left: 12, right: 16 }}
                      style={styles.storyHeaderIconBtn}
                      accessibilityLabel="Hikayeyi kapat"
                    >
                      <Ionicons name="close" size={22} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <View
                style={[
                  styles.storyChromeBottom,
                  { paddingBottom: Math.max(insets.bottom, 12) + (storyKeyboardOpen ? 4 : 0) },
                ]}
                pointerEvents="box-none"
              >
                {activeStory.caption ? <Text style={styles.storyCaption}>{activeStory.caption}</Text> : null}
                <View style={styles.storyActionRow}>
                  {canViewActiveStoryViewers ? (
                    <TouchableOpacity style={styles.storyActionBtn} onPress={openStoryViewers} activeOpacity={0.8}>
                      <Ionicons name="eye-outline" size={18} color="#fff" />
                      <Text style={styles.storyActionText}>Gorenler</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity style={styles.storyActionBtn} onPress={() => setStoryRepliesModal(true)} activeOpacity={0.8}>
                    <Ionicons name="chatbubble-ellipses-outline" size={18} color="#fff" />
                    <Text style={styles.storyActionText}>Yanitlar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.storyActionBtn} onPress={handleStoryLike} activeOpacity={0.8} disabled={storyBusy}>
                    <Ionicons name={storyLikedSet.has(activeStory.id) ? 'heart' : 'heart-outline'} size={18} color={storyLikedSet.has(activeStory.id) ? '#ef4444' : '#fff'} />
                    <Text style={styles.storyActionText}>{storyLikeCounts[activeStory.id] ?? 0}</Text>
                  </TouchableOpacity>
                </View>
                {(storyReplies[activeStory.id] ?? []).slice(0, 2).map((r) => (
                  <View key={r.id} style={styles.storyReplyRow}>
                    <Text style={styles.storyReplyAuthor}>
                      {r.staff?.full_name || guestDisplayName(r.guest?.full_name, 'Misafir') || 'Misafir'}
                    </Text>
                    <Text style={styles.storyReplyContent} numberOfLines={1}>{r.content}</Text>
                  </View>
                ))}
                <View style={styles.storyReplyInputRow}>
                  <TextInput
                    style={styles.storyReplyInput}
                    value={storyReplyText}
                    onChangeText={setStoryReplyText}
                    placeholder="Hikayeye yanit yaz..."
                    placeholderTextColor="rgba(255,255,255,0.55)"
                    editable={!storyBusy}
                    maxLength={240}
                  />
                  <TouchableOpacity style={styles.storyReplySendBtn} onPress={handleStoryReply} disabled={storyBusy || !storyReplyText.trim()} activeOpacity={0.8}>
                    <Ionicons name="send" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
              {storyMenuOpen ? (
                <Pressable style={styles.storyMenuBackdrop} onPress={() => setStoryMenuOpen(false)}>
                  <Pressable
                    style={[styles.storyMenuDropdown, { top: insets.top + 96, right: 12 }]}
                    onPress={(e) => e.stopPropagation()}
                  >
                    {canDeleteActiveStory ? (
                      <TouchableOpacity
                        style={styles.storyMenuItem}
                        onPress={deleteActiveStory}
                        disabled={storyBusy}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
                        <Text style={[styles.storyMenuText, { color: theme.colors.error }]}>Hikayeyi sil</Text>
                      </TouchableOpacity>
                    ) : null}
                    {canDeleteActiveStory ? <View style={styles.storyMenuDivider} /> : null}
                    <TouchableOpacity
                      style={styles.storyMenuItem}
                      onPress={() => {
                        setStoryMenuOpen(false);
                        setStoryReportOpen(true);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="flag-outline" size={20} color={theme.colors.text} />
                      <Text style={styles.storyMenuText}>Bildir</Text>
                    </TouchableOpacity>
                  </Pressable>
                </Pressable>
              ) : null}
                {storyViewersModal && canViewActiveStoryViewers ? (
                  <View style={styles.storyViewersInlineOverlay}>
                    <View style={styles.storyViewersInlineCard}>
                      <View style={styles.storyViewersHead}>
                        <Text style={styles.storyViewersTitle}>Hikayeyi Gorenler</Text>
                        <TouchableOpacity onPress={() => setStoryViewersModal(false)}>
                          <Ionicons name="close" size={24} color={theme.colors.text} />
                        </TouchableOpacity>
                      </View>
                      <FlatList
                        data={storyViewers}
                        keyExtractor={(item) => item.id}
                        ListEmptyComponent={<Text style={styles.storyViewersEmpty}>Henuz goruntuleyen yok</Text>}
                        renderItem={({ item }) => {
                          const isGuest = !!item.guest_id && !item.staff_id;
                          const avatar = item.staff?.profile_image ?? item.guest?.photo_url ?? null;
                          const name = isGuest ? (guestDisplayName(item.guest?.full_name, 'Misafir') || 'Misafir') : (item.staff?.full_name || 'Personel');
                          const fallback = isGuest ? 'M' : 'P';
                          const canOpenProfile = !!(item.staff_id || item.guest_id);
                          return (
                            <View style={styles.storyViewerRow}>
                              <TouchableOpacity
                                activeOpacity={canOpenProfile ? 0.75 : 1}
                                disabled={!canOpenProfile}
                                onPress={() => openStoryPersonProfile(item.staff_id, item.guest_id)}
                              >
                                {avatar ? (
                                  <CachedImage uri={avatar} style={styles.storyViewerAvatar} contentFit="cover" />
                                ) : (
                                  <View style={styles.storyViewerAvatarFallback}>
                                    <Text style={styles.storyViewerAvatarTxt}>{(name || fallback).charAt(0).toUpperCase()}</Text>
                                  </View>
                                )}
                              </TouchableOpacity>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.storyViewerName}>{name}</Text>
                                <Text style={styles.storyViewerTime}>{formatDateTime(item.viewed_at)}</Text>
                              </View>
                            </View>
                          );
                        }}
                      />
                    </View>
                  </View>
                ) : null}
                {storyRepliesModal ? (
                  <View style={styles.storyViewersInlineOverlay}>
                    <View style={styles.storyViewersInlineCard}>
                      <View style={styles.storyViewersHead}>
                        <Text style={styles.storyViewersTitle}>Hikaye Yanitlari</Text>
                        <TouchableOpacity onPress={() => setStoryRepliesModal(false)}>
                          <Ionicons name="close" size={24} color={theme.colors.text} />
                        </TouchableOpacity>
                      </View>
                      <FlatList
                        data={storyReplies[activeStory.id] ?? []}
                        keyExtractor={(item) => item.id}
                        ListEmptyComponent={<Text style={styles.storyViewersEmpty}>Henuz yanit yok</Text>}
                        renderItem={({ item }) => {
                          const canOpenProfile = !!(item.staff_id || item.guest_id);
                          return (
                            <View style={styles.storyViewerRow}>
                              <TouchableOpacity
                                activeOpacity={canOpenProfile ? 0.75 : 1}
                                disabled={!canOpenProfile}
                                onPress={() => openStoryPersonProfile(item.staff_id, item.guest_id)}
                              >
                                {(item.staff?.profile_image || item.guest?.photo_url) ? (
                                  <CachedImage uri={item.staff?.profile_image ?? item.guest?.photo_url ?? ''} style={styles.storyViewerAvatar} contentFit="cover" />
                                ) : (
                                  <View style={styles.storyViewerAvatarFallback}>
                                    <Text style={styles.storyViewerAvatarTxt}>
                                      {(item.staff?.full_name || guestDisplayName(item.guest?.full_name, 'Misafir') || 'M').charAt(0).toUpperCase()}
                                    </Text>
                                  </View>
                                )}
                              </TouchableOpacity>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.storyViewerName}>
                                  {item.staff?.full_name || guestDisplayName(item.guest?.full_name, 'Misafir') || 'Misafir'}
                                </Text>
                                <Text style={styles.storyReplyContent}>{item.content}</Text>
                                <Text style={styles.storyViewerTime}>{formatDateTime(item.created_at)}</Text>
                              </View>
                            </View>
                          );
                        }}
                      />
                    </View>
                  </View>
                ) : null}
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={storyReportOpen} transparent animationType="slide" onRequestClose={() => setStoryReportOpen(false)}>
        <Pressable style={styles.reportModalOverlay} onPress={() => setStoryReportOpen(false)}>
          <Pressable style={styles.reportModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.reportModalHeader}>
              <Text style={styles.reportModalTitle}>Hikayeyi bildir</Text>
              <TouchableOpacity onPress={() => setStoryReportOpen(false)} hitSlop={16}>
                <Ionicons name="close" size={28} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.reportModalScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.reportModalSubtitle}>Sebep</Text>
              {reportReasons.map((r) => (
                <TouchableOpacity key={`story-r-${r.value}`} style={[styles.reportReasonRow, storyReportReason === r.value && styles.reportReasonRowSelected]} onPress={() => setStoryReportReason(r.value)}>
                  <Ionicons name={storyReportReason === r.value ? 'radio-button-on' : 'radio-button-off'} size={22} color={storyReportReason === r.value ? theme.colors.primary : theme.colors.textMuted} />
                  <Text style={styles.reportReasonLabel}>{r.label}</Text>
                </TouchableOpacity>
              ))}
              <TextInput
                style={styles.reportDetailsInput}
                placeholder="Ek aciklama"
                placeholderTextColor={theme.colors.textMuted}
                value={storyReportDetails}
                onChangeText={setStoryReportDetails}
                multiline
                maxLength={300}
              />
              <TouchableOpacity style={[styles.reportSubmitBtn, (!storyReportReason.trim() || storyBusy) && styles.reportSubmitBtnDisabled]} onPress={submitStoryReport} disabled={!storyReportReason.trim() || storyBusy}>
                {storyBusy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.reportSubmitBtnText}>Gonder</Text>}
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: pds.pageBg },
  scroll: { flex: 1 },
  content: { paddingTop: pds.staffFeedBelowHeaderGap, paddingBottom: 120 },
  hero: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 12,
    borderRadius: 22,
    padding: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    ...Platform.select({ ios: theme.shadows.lg, android: { elevation: 6 } }),
  },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  heroKicker: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.75)', letterSpacing: 1.2 },
  heroTitle: { fontSize: 22, fontWeight: '900', color: '#fff', marginTop: 6, letterSpacing: -0.2 },
  heroSub: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.75)', marginTop: 8, lineHeight: 18 },
  storyAddBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  staffAvatarsSection: {
    backgroundColor: pds.pageBg,
    paddingTop: 0,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  staffSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  staffAvatarsSectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.primary,
    letterSpacing: 0.3,
  },
  staffSectionSub: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted },
  staffAvatarsScroll: {},
  staffAvatarsScrollContent: { paddingLeft: 16, paddingRight: 24, alignItems: 'center' },
  staffAvatarCard: { width: 72, marginRight: 24, alignItems: 'center' },
  staffAvatarCardInner: { alignItems: 'center' },
  staffAvatarRing: {
    position: 'relative',
    width: 72,
    height: 72,
    borderRadius: 36,
    padding: 3,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  storyOnlineDot: {
    position: 'absolute',
    bottom: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: pds.online,
    borderWidth: 2,
    borderColor: '#fff',
  },
  storyOnlineDotLeft: { left: 2 },
  storyOnlineDotRight: { right: 2 },
  staffAvatarImg: { width: 64, height: 64, borderRadius: 32, backgroundColor: theme.colors.borderLight },
  staffAvatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  staffAvatarLetter: { fontSize: 24, fontWeight: '700', color: theme.colors.white },
  staffAvatarName: { fontSize: 13, fontWeight: '600', color: theme.colors.text, maxWidth: 72, textAlign: 'center' },
  staffAvatarRole: { fontSize: 11, color: theme.colors.textMuted, marginTop: 4, maxWidth: 72, textAlign: 'center' },
  staffAvatarOrg: { fontSize: 10, color: theme.colors.primary, marginTop: 2, maxWidth: 78, textAlign: 'center', fontWeight: '700' },
  guestAvatarsSection: {
    backgroundColor: theme.colors.surface,
    paddingVertical: 12,
    paddingTop: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  guestAvatarsSectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.primary,
    letterSpacing: 0.3,
  },
  collapseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  guestAvatarsContent: { paddingHorizontal: 16, alignItems: 'center', paddingRight: 24 },
  guestAvatarCard: { width: 72, marginRight: 24, alignItems: 'center' },
  guestAvatarCardInner: { alignItems: 'center' },
  guestAvatarRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2.5,
    borderColor: theme.colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    overflow: 'hidden',
  },
  guestAvatarImg: { width: 64, height: 64, borderRadius: 32, backgroundColor: theme.colors.borderLight },
  guestAvatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.guestAvatarBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guestAvatarLetter: { fontSize: 24, fontWeight: '700', color: theme.colors.white },
  guestAvatarName: { fontSize: 13, fontWeight: '600', color: theme.colors.text, maxWidth: 72, textAlign: 'center' },
  guestAvatarRole: { fontSize: 11, color: theme.colors.textMuted, marginTop: 4, maxWidth: 72, textAlign: 'center' },
  empty: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyText: { fontSize: 16, color: theme.colors.textMuted, marginTop: 16 },
  emptyBtn: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    backgroundColor: theme.colors.primary,
  },
  emptyBtnText: { fontSize: 15, fontWeight: '600', color: theme.colors.white },
  showMoreBtn: {
    marginTop: 8,
    marginHorizontal: 16,
    marginBottom: 4,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  showMoreBtnText: { fontSize: 14, fontWeight: '700', color: theme.colors.primary },
  menuModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  menuModalBox: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    minWidth: 200,
    paddingVertical: 8,
    ...theme.shadows.lg,
  },
  menuModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  menuModalItemText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  reportModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  reportModalContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: SCREEN_HEIGHT * 0.85,
  },
  reportModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  reportModalTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  reportModalSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginTop: 16,
    marginBottom: 8,
  },
  reportReasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: theme.radius.md,
  },
  reportReasonRowSelected: {
    backgroundColor: `${theme.colors.primary}14`,
  },
  reportReasonLabel: { fontSize: 15, color: theme.colors.text, flex: 1 },
  reportDetailsInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: theme.colors.text,
    backgroundColor: theme.colors.backgroundSecondary,
    minHeight: 80,
    textAlignVertical: 'top',
    marginTop: 4,
  },
  reportSubmitBtn: {
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportSubmitBtnDisabled: { opacity: 0.5 },
  reportSubmitBtnText: { fontSize: 16, fontWeight: '700', color: theme.colors.white },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  viewersModalContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  viewersListWrap: {
    flex: 1,
    minHeight: 0,
  },
  viewersModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  viewersModalTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  viewersLoader: { marginVertical: 40 },
  viewersEmpty: { fontSize: 15, color: theme.colors.textMuted, textAlign: 'center', paddingVertical: 32 },
  viewerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  viewerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  viewerAvatarLetter: {
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerAvatarLetterGuest: {
    backgroundColor: theme.colors.guestAvatarBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerAvatarText: { fontSize: 18, fontWeight: '700', color: theme.colors.white },
  viewerInfo: { flex: 1, minWidth: 0 },
  viewerName: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  viewerTime: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  postImageWrap: {
    position: 'relative',
    width: '100%',
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: theme.colors.borderLight,
  },
  postImage: {
    width: '100%',
    height: '100%',
  },
  videoPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  commentsBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderLight,
  },
  commentRow: { marginBottom: 10 },
  commentAuthor: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  commentText: { fontSize: 14, color: theme.colors.text, marginTop: 2 },
  commentTime: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  commentInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.colors.text,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  commentSendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentSendBtnDisabled: { opacity: 0.5 },
  commentSheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  commentSheetCard: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  commentSheetHandleWrap: {
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  commentSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderLight,
  },
  commentSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  commentSheetTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  commentSheetScroll: { flex: 1, minHeight: 0 },
  commentSheetScrollContent: { padding: 20, paddingBottom: 16 },
  commentSheetEmpty: { fontSize: 15, color: theme.colors.textMuted, textAlign: 'center', paddingVertical: 24 },
  commentSheetRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
    gap: 12,
  },
  commentSheetAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  commentSheetAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentSheetAvatarPlaceholderGuest: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.guestAvatarBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentSheetAvatarInitial: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  commentSheetAvatarInitialGuest: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.guestAvatarLetter,
  },
  commentSheetRowBody: { flex: 1, minWidth: 0 },
  commentSheetAuthor: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  commentSheetText: { fontSize: 15, color: theme.colors.text, marginTop: 4, lineHeight: 22 },
  commentMention: { color: '#0095f6', fontWeight: '700', textDecorationLine: 'underline' },
  commentSheetMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  commentSheetActionsRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  commentSheetTime: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
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
  commentSheetInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
    position: 'relative',
  },
  replyTargetChip: {
    position: 'absolute',
    left: 16,
    right: 58,
    top: -30,
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
  commentSheetInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.colors.text,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  mentionPanel: {
    marginHorizontal: 16,
    marginTop: -4,
    marginBottom: 8,
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
  bottomSpacer: { height: 24 },
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullscreenImageWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  fullscreenImage: {},
  fullscreenVideo: { backgroundColor: '#000' },
  fullscreenPosterImage: { backgroundColor: 'transparent' },
  fullscreenSeekZones: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  fullscreenSeekZoneLeft: { flex: 1 },
  fullscreenSeekZoneCenter: { flex: 1 },
  fullscreenSeekZoneRight: { flex: 1 },
  storyFullscreenRoot: { flex: 1, backgroundColor: '#000' },
  storyMediaFullscreen: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  storyChromeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 4,
    paddingHorizontal: 12,
  },
  storyChromeBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 4,
    paddingHorizontal: 12,
  },
  storyProgressRow: { flexDirection: 'row', gap: 4, marginBottom: 10 },
  storyProgressTrack: { flex: 1, height: 3, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.28)', overflow: 'hidden' },
  storyProgressFill: { height: 3, backgroundColor: '#fff' },
  storyModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  storyHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8 },
  storyHeaderIconBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  storyModalAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  storyModalAvatar: { width: 36, height: 36, borderRadius: 18 },
  storyModalAvatarFallback: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  storyModalAvatarText: { color: '#fff', fontWeight: '700' },
  storyModalAuthor: { color: '#fff', fontWeight: '700', fontSize: 14 },
  storyModalTime: { color: 'rgba(255,255,255,0.72)', fontSize: 12, marginTop: 1 },
  storyMedia: { width: '100%', height: '100%' },
  storyCaption: { color: '#fff', fontSize: 14, marginBottom: 8, marginHorizontal: 6, fontWeight: '500' },
  storyActionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, zIndex: 5 },
  storyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  storyActionText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  storyReplyRow: { flexDirection: 'row', gap: 6, marginTop: 8, alignItems: 'center' },
  storyReplyAuthor: { color: '#fff', fontWeight: '800', fontSize: 12 },
  storyReplyContent: { color: 'rgba(255,255,255,0.88)', fontSize: 12, flex: 1 },
  storyReplyInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  storyReplyInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 13,
  },
  storyReplySendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3,7,18,0.4)',
    zIndex: 28,
  },
  storyMenuDropdown: {
    position: 'absolute',
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    minWidth: 220,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...Platform.select({ ios: theme.shadows.md, android: { elevation: 8 } }),
  },
  storyMenuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.borderLight,
    marginHorizontal: 12,
  },
  storyMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  storyMenuText: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  storyViewersInlineOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3,7,18,0.62)',
    justifyContent: 'flex-end',
    zIndex: 30,
  },
  storyViewersInlineCard: {
    height: '62%',
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...Platform.select({ ios: theme.shadows.md, android: { elevation: 6 } }),
  },
  storyViewersHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight },
  storyViewersTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  storyViewersEmpty: { textAlign: 'center', color: theme.colors.textMuted, marginTop: 18, fontSize: 13, fontWeight: '600' },
  storyViewerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight },
  storyViewerAvatar: { width: 36, height: 36, borderRadius: 18 },
  storyViewerAvatarFallback: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  storyViewerAvatarTxt: { color: '#fff', fontWeight: '700' },
  storyViewerName: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  storyViewerTime: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  storyTapZones: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', zIndex: 2 },
  storyTapZoneLeft: { flex: 1 },
  storyTapZoneRight: { flex: 1 },
});
