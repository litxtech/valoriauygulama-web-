import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Modal,
  useWindowDimensions,
  Pressable,
  Animated,
  Dimensions,
  Platform,
  Alert,
  TextInput,
  ActivityIndicator,
  Keyboard,
  FlatList,
} from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Video, Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useScrollToTopStore } from '@/stores/scrollToTopStore';
import { theme } from '@/constants/theme';
import { pds } from '@/constants/personelDesignSystem';
import { formatRelative } from '@/lib/date';
import { StaffNameWithBadge, AvatarWithBadge } from '@/components/VerifiedBadge';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { getOrCreateGuestForCurrentSession, syncGuestMessagingAppToken } from '@/lib/getOrCreateGuestForCaller';
import { guestDisplayName, isOpaqueGuestDisplayString } from '@/lib/guestDisplayName';
import { notifyAdmins, sendNotification } from '@/lib/notificationService';
import { CachedImage } from '@/components/CachedImage';
import { formatDistanceToNow } from 'date-fns';
import i18n from '@/i18n';
import { dateFnsLocaleForApp } from '@/lib/dateFnsLocale';
import { feedSharedText, getFeedReportReasons } from '@/lib/feedSharedI18n';
import { complaintsLocaleTag } from '@/lib/complaintsI18n';
import { KeyboardAvoidingView } from 'react-native';
import { blockUserForGuest, getHiddenUsersForGuest } from '@/lib/userBlocks';
import { useTranslation } from 'react-i18next';
import { sortStaffAdminFirst } from '@/lib/sortStaffAdminFirst';
import { prefetchImageUrls } from '@/lib/prefetchImageUrls';
import { removeFeedMediaObjectsForPostUrls } from '@/lib/feedMediaStorageDelete';
import { FeedMediaCarousel } from '@/components/FeedMediaCarousel';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StaffFeedPostCard } from '@/components/StaffFeedPostCard';
import { formatDateTime } from '@/lib/date';
import { resolveMentionedStaffIdsFromText } from '@/lib/staffMentions';
import { complaintsText } from '@/lib/complaintsI18n';
import { searchStaffMentionCandidates, type StaffMentionCandidate } from '@/lib/staffMentions';
import { loadActiveStaffStories, markStoryAsViewedForGuest, type StaffStoryGroup } from '@/lib/staffStories';
import { MentionableText } from '@/components/MentionableText';

type CustomerCommentRow = {
  id: string;
  staff_id?: string | null;
  guest_id?: string | null;
  content: string;
  created_at: string;
  staff: { full_name: string | null; profile_image?: string | null } | null;
  guest: { full_name: string | null; photo_url?: string | null } | null;
};

type StaffRow = {
  id: string;
  full_name: string | null;
  department: string | null;
  organization?: { name?: string | null; kind?: string | null } | null;
  profile_image: string | null;
  is_online: boolean | null;
  last_active: string | null;
  work_status: string | null;
  verification_badge?: 'blue' | 'yellow' | null;
  role?: string | null;
};

type HotelInfoRow = {
  id: string;
  name: string | null;
  description: string | null;
  address: string | null;
  stars: number | null;
};

type FeedPost = {
  id: string;
  media_type: string;
  media_url: string | null;
  thumbnail_url: string | null;
  title: string | null;
  created_at: string;
  staff_id: string | null;
  guest_id: string | null;
  post_tag?: string | null;
  lat?: number | null;
  lng?: number | null;
  location_label?: string | null;
  media_items?: { id: string; media_type: 'image' | 'video'; media_url: string; thumbnail_url: string | null; sort_order: number }[];
  staff: {
    full_name: string | null;
    department: string | null;
    profile_image?: string | null;
    verification_badge?: 'blue' | 'yellow' | null;
    organization?: { name?: string | null; kind?: string | null } | null;
  } | null;
  guest: { full_name: string | null; photo_url?: string | null } | null;
};

type MyRoom = {
  room_number: string;
  view_type: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
};

type StoryPlayerState = {
  groupIndex: number;
  storyIndex: number;
} | null;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const HORIZONTAL_GUTTER = 16;

const WORK_STATUS_COLOR: Record<string, string> = {
  active: theme.colors.success,
  break: '#eab308',
  off: theme.colors.error,
  leave: '#9ca3af',
};

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const CUSTOMER_HOME_CACHE_KEY = 'customer_home_cache_v1';

const GLYPH = Ionicons.glyphMap as Record<string, number>;

function getFacilityIonIcon(icon: string | null, facilityName: string): IoniconName {
  const key = icon?.trim().toLowerCase().replace(/^ionicons?:/, '').replace(/_/g, '-') ?? '';
  if (key && key in GLYPH) return key as IoniconName;
  const n = facilityName.toLowerCase();
  if (n.includes('havuz') || n.includes('pool')) return 'water-outline';
  if (n.includes('spa') || n.includes('wellness')) return 'leaf-outline';
  if (n.includes('fitness') || n.includes('spor') || n.includes('gym')) return 'barbell-outline';
  if (n.includes('wifi')) return 'wifi-outline';
  if (n.includes('restoran') || n.includes('yemek') || n.includes('restaurant') || n.includes('dining')) return 'restaurant-outline';
  if (n.includes('kahvaltı') || n.includes('breakfast')) return 'cafe-outline';
  if (n.includes('otopark') || n.includes('park') || n.includes('parking')) return 'car-outline';
  if (n.includes('çocuk') || n.includes('kid') || n.includes('child')) return 'happy-outline';
  return 'sparkles-outline';
}

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

export default function CustomerHome() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const reportReasons = useMemo(() => getFeedReportReasons(), [i18n.language]);
  const dateLocale = useMemo(() => dateFnsLocaleForApp(), [i18n.language]);
  const locTag = useMemo(() => complaintsLocaleTag(), [i18n.language]);
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
  const { user } = useAuthStore();
  const [activeStaff, setActiveStaff] = useState<StaffRow[]>([]);
  const [hotelInfo, setHotelInfo] = useState<HotelInfoRow | null>(null);
  const [feedPosts, setFeedPosts] = useState<FeedPost[]>([]);
  const [myRoom, setMyRoom] = useState<MyRoom | null>(null);
  const [facilities, setFacilities] = useState<{ name: string; icon: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fullscreenPostMedia, setFullscreenPostMedia] = useState<{
    uri: string;
    mediaType: 'image' | 'video';
    posterUri?: string;
  } | null>(null);
  const [fullscreenVideoReady, setFullscreenVideoReady] = useState(false);
  const [menuPostId, setMenuPostId] = useState<string | null>(null);
  const [myGuestId, setMyGuestId] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [reportPost, setReportPost] = useState<FeedPost | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [myLikes, setMyLikes] = useState<Set<string>>(new Set());
  const [commentsByPost, setCommentsByPost] = useState<Record<string, CustomerCommentRow[]>>({});
  /** Yalnızca misafirin kendi paylaşımları: görüntülenme sayısı (kimler değil) */
  const [myGuestViewCounts, setMyGuestViewCounts] = useState<Record<string, number>>({});
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [commentsSheetPostId, setCommentsSheetPostId] = useState<string | null>(null);
  const [commentSheetKeyboardH, setCommentSheetKeyboardH] = useState(0);
  const [togglingLike, setTogglingLike] = useState<string | null>(null);
  const [postingComment, setPostingComment] = useState<string | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState<StaffMentionCandidate[]>([]);
  const [mentionDirectory, setMentionDirectory] = useState<StaffMentionCandidate[]>([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [storyGroups, setStoryGroups] = useState<StaffStoryGroup[]>([]);
  const [storyPlayer, setStoryPlayer] = useState<StoryPlayerState>(null);
  const [storyVideoReady, setStoryVideoReady] = useState(false);
  const [storyLikeCount, setStoryLikeCount] = useState(0);
  const [storyLikedByMe, setStoryLikedByMe] = useState(false);
  const [storyReplyText, setStoryReplyText] = useState('');
  const [storyReplies, setStoryReplies] = useState<{ id: string; content: string; created_at: string; author: string }[]>([]);
  const [storyBusy, setStoryBusy] = useState(false);
  const [storyKeyboardH, setStoryKeyboardH] = useState(0);
  const [visibleFeedCount, setVisibleFeedCount] = useState(30);
  const storyVideoRef = useRef<Video>(null);
  const fullscreenVideoRef = useRef<Video>(null);
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const setScrollToTop = useScrollToTopStore((s) => s.setScrollToTop);
  const onlineBlinkOpacity = useRef(new Animated.Value(1)).current;

  // Açılışta: en son görünen feed'i anında bas (ağ gelene kadar kullanıcı içerik görsün)
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(CUSTOMER_HOME_CACHE_KEY)
      .then((raw) => {
        if (!raw || cancelled) return;
        const parsed = JSON.parse(raw) as Partial<{
          activeStaff: StaffRow[];
          hotelInfo: HotelInfoRow | null;
          feedPosts: FeedPost[];
          facilities: { name: string; icon: string | null }[];
          likeCounts: Record<string, number>;
          commentCounts: Record<string, number>;
          myLikePostIds: string[];
          commentsByPost: Record<string, CustomerCommentRow[]>;
          cachedAt: number;
        }>;
        if (cancelled) return;
        if (Array.isArray(parsed.activeStaff)) setActiveStaff(parsed.activeStaff);
        if ('hotelInfo' in parsed) setHotelInfo((parsed.hotelInfo ?? null) as HotelInfoRow | null);
        if (Array.isArray(parsed.feedPosts)) setFeedPosts(parsed.feedPosts);
        if (Array.isArray(parsed.facilities)) setFacilities(parsed.facilities);
        if (parsed.likeCounts && typeof parsed.likeCounts === 'object') setLikeCounts(parsed.likeCounts);
        if (parsed.commentCounts && typeof parsed.commentCounts === 'object') setCommentCounts(parsed.commentCounts);
        if (Array.isArray(parsed.myLikePostIds)) setMyLikes(new Set(parsed.myLikePostIds));
        if (parsed.commentsByPost && typeof parsed.commentsByPost === 'object') setCommentsByPost(parsed.commentsByPost);
        // Cache varsa "boş feed" yerine içerik gösterelim; ağ çağrısı yine devam edecek.
        if ((parsed.feedPosts?.length ?? 0) > 0) setLoading(false);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(onlineBlinkOpacity, { toValue: 0.35, duration: 700, useNativeDriver: true }),
        Animated.timing(onlineBlinkOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [onlineBlinkOpacity]);

  useEffect(() => {
    setScrollToTop(() => () => scrollRef.current?.scrollTo({ y: 0, animated: true }));
    return () => setScrollToTop(null);
  }, [setScrollToTop]);

  // Video sesi hoparlörden tam açılsın (Android ses kısık sorunu)
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
    }).catch(() => {});
  }, []);

  // Tam ekran video açıldığında poster overlay sıfırla (yeni video = henüz yüklenmedi)
  useEffect(() => {
    if (fullscreenPostMedia?.mediaType === 'video') setFullscreenVideoReady(false);
  }, [fullscreenPostMedia?.uri, fullscreenPostMedia?.mediaType]);

  // Tam ekran video açıldığında oynat ve sesi aç
  useEffect(() => {
    if (!fullscreenPostMedia || fullscreenPostMedia.mediaType !== 'video') return;
    const t = setTimeout(() => {
      fullscreenVideoRef.current?.playAsync().catch(() => {});
      fullscreenVideoRef.current?.setVolumeAsync(1.0).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [fullscreenPostMedia?.uri, fullscreenPostMedia?.mediaType]);

  const activeStoryGroup = storyPlayer ? storyGroups[storyPlayer.groupIndex] ?? null : null;
  const activeStory = storyPlayer && activeStoryGroup ? activeStoryGroup.stories[storyPlayer.storyIndex] ?? null : null;
  const storyMediaHeight = storyKeyboardH > 0
    ? Math.max(180, SCREEN_HEIGHT - storyKeyboardH - 280)
    : SCREEN_HEIGHT - 340;
  const visibleFeedPosts = useMemo(() => feedPosts.slice(0, visibleFeedCount), [feedPosts, visibleFeedCount]);

  const storyGroupIndexByStaffId = useMemo(() => {
    const m = new Map<string, number>();
    storyGroups.forEach((g, i) => {
      m.set(g.staff_id, i);
    });
    return m;
  }, [storyGroups]);

  useEffect(() => {
    if (!activeStory || activeStory.media_type !== 'video') return;
    setStoryVideoReady(false);
    const t = setTimeout(() => {
      storyVideoRef.current?.playAsync().catch(() => {});
      storyVideoRef.current?.setVolumeAsync(1.0).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [activeStory?.id, activeStory?.media_type]);

  useEffect(() => {
    if (!activeStory?.id || !myGuestId) return;
    markStoryAsViewedForGuest(activeStory.id, myGuestId).catch(() => {});
  }, [activeStory?.id, myGuestId]);

  useEffect(() => {
    if (!activeStory?.id) {
      setStoryLikeCount(0);
      setStoryLikedByMe(false);
      setStoryReplyText('');
      setStoryReplies([]);
      return;
    }
    let cancelled = false;
    Promise.all([
      supabase.from('feed_story_reactions').select('id', { count: 'exact', head: true }).eq('story_id', activeStory.id),
      myGuestId
        ? supabase.from('feed_story_reactions').select('id').eq('story_id', activeStory.id).eq('guest_id', myGuestId).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('feed_story_replies')
        .select('id, content, created_at, staff:staff_id(full_name), guest:guest_id(full_name)')
        .eq('story_id', activeStory.id)
        .order('created_at', { ascending: false })
        .limit(5),
    ]).then(([countRes, mineRes, repliesRes]) => {
      if (cancelled) return;
      setStoryLikeCount(countRes.count ?? 0);
      setStoryLikedByMe(!!(mineRes as { data?: { id?: string } | null }).data?.id);
      const repliesData = (repliesRes as { data?: unknown[] }).data;
      setStoryReplies(
        ((repliesData ?? []) as Array<{
          id: string;
          content: string;
          created_at: string;
          staff?: { full_name?: string | null } | null;
          guest?: { full_name?: string | null } | null;
        }>).map((r) => ({
          id: r.id,
          content: r.content,
          created_at: r.created_at,
          author: (r.staff?.full_name ?? r.guest?.full_name ?? i18n.t('guestDefaultName')).trim() || i18n.t('guestDefaultName'),
        }))
      );
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeStory?.id, myGuestId]);

  const openStoryAt = useCallback((groupIndex: number, storyIndex = 0) => {
    setStoryPlayer({ groupIndex, storyIndex });
  }, []);

  const closeStoryPlayer = useCallback(() => {
    setStoryPlayer(null);
    setStoryVideoReady(false);
    setStoryReplyText('');
    setStoryReplies([]);
    setStoryKeyboardH(0);
  }, []);

  const goToStoryAuthorProfile = useCallback(() => {
    const id = activeStoryGroup?.staff_id;
    if (!id) return;
    closeStoryPlayer();
    router.push(`/customer/staff/${id}`);
  }, [activeStoryGroup?.staff_id, closeStoryPlayer, router]);

  const toggleStoryLikeAsGuest = useCallback(async () => {
    if (!activeStory?.id || !myGuestId || storyBusy) return;
    setStoryBusy(true);
    try {
      if (storyLikedByMe) {
        await supabase.from('feed_story_reactions').delete().eq('story_id', activeStory.id).eq('guest_id', myGuestId);
        setStoryLikedByMe(false);
        setStoryLikeCount((v) => Math.max(0, v - 1));
      } else {
        await supabase.from('feed_story_reactions').insert({ story_id: activeStory.id, guest_id: myGuestId, reaction: 'like' });
        setStoryLikedByMe(true);
        setStoryLikeCount((v) => v + 1);
        if (activeStory.staff_id) {
          const displayName = getDisplayName() || t('aGuest');
          await sendNotification({
            staffId: activeStory.staff_id,
            title: feedSharedText('notifStoryLikeTitle'),
            body: feedSharedText('notifStoryLikeBody', { name: displayName }),
            category: 'staff',
            notificationType: 'story_like',
            data: { screen: 'staff_feed', url: '/staff/feed', storyId: activeStory.id },
          }).catch(() => {});
        }
      }
    } catch {}
    setStoryBusy(false);
  }, [activeStory?.id, activeStory?.staff_id, myGuestId, storyBusy, storyLikedByMe, t, i18n.language]);

  const submitStoryReplyAsGuest = useCallback(async () => {
    if (!activeStory?.id || !myGuestId || storyBusy) return;
    const text = storyReplyText.trim();
    if (!text) return;
    setStoryBusy(true);
    try {
      const { data: inserted } = await supabase
        .from('feed_story_replies')
        .insert({ story_id: activeStory.id, guest_id: myGuestId, content: text })
        .select('id, content, created_at')
        .single();
      setStoryReplyText('');
      if (inserted) {
        setStoryReplies((prev) => [
          {
            id: (inserted as { id: string }).id,
            content: (inserted as { content: string }).content,
            created_at: (inserted as { created_at: string }).created_at,
            author: getDisplayName() || t('guestDefaultName'),
          },
          ...prev,
        ].slice(0, 5));
      }
      if (activeStory.staff_id) {
        const displayName = getDisplayName() || t('aGuest');
        await sendNotification({
          staffId: activeStory.staff_id,
          title: feedSharedText('notifStoryReplyTitle'),
          body: `${displayName}: ${text.slice(0, 60)}${text.length > 60 ? '…' : ''}`,
          category: 'staff',
          notificationType: 'story_reply',
          data: { screen: 'staff_feed', url: '/staff/feed', storyId: activeStory.id },
        }).catch(() => {});
      }
    } catch {}
    setStoryBusy(false);
  }, [activeStory?.id, activeStory?.staff_id, myGuestId, storyBusy, storyReplyText, t, i18n.language]);

  const load = useCallback(async () => {
    // Zustand `user` geç yüklenirse (misafir oturumu varken null) yine de RPC ile guest çöz
    const guestRow = await getOrCreateGuestForCurrentSession();
    const guestIdForState = guestRow?.guest_id ?? null;
    setMyGuestId(guestIdForState);
    const hidden = guestRow?.guest_id
      ? await getHiddenUsersForGuest(guestRow.guest_id)
      : { hiddenStaffIds: new Set<string>(), hiddenGuestIds: new Set<string>() };

    const [staffRes, hotelRes, feedRes, facilitiesRes] = await Promise.all([
      (async () => {
        const { data } = await supabase
          .from('staff')
          .select('id, full_name, department, organization:organization_id(name, kind), profile_image, is_online, last_active, work_status, verification_badge, email, role')
          .eq('is_active', true)
          .is('deleted_at', null)
          .order('is_online', { ascending: false })
          .order('last_active', { ascending: false });
        const rows = (data ?? []) as (StaffRow & { email?: string | null })[];
        const byKey = new Map<string, StaffRow>();
        rows.forEach((r) => {
          const key = (r.email && r.email.trim()) ? r.email.trim().toLowerCase() : r.id;
          if (!byKey.has(key)) {
            byKey.set(key, {
              id: r.id,
              full_name: r.full_name,
              department: r.department,
              organization: r.organization,
              profile_image: r.profile_image,
              is_online: r.is_online,
              last_active: r.last_active,
              work_status: r.work_status,
              verification_badge: r.verification_badge,
              role: r.role,
            });
          } else {
            const existing = byKey.get(key)!;
            if (!existing.is_online && r.is_online) byKey.set(key, { ...existing, ...r });
          }
        });
        const deduped = Array.from(byKey.values());
        return {
          data: sortStaffAdminFirst(deduped, (a, b) => {
            const onA = a.is_online ? 1 : 0;
            const onB = b.is_online ? 1 : 0;
            if (onA !== onB) return onB - onA;
            return (b.last_active ?? '').localeCompare(a.last_active ?? '');
          }),
        };
      })(),
      supabase.from('hotel_info').select('id, name, description, address, stars').limit(1).maybeSingle(),
      supabase
        .from('feed_posts')
        .select('id, media_type, media_url, thumbnail_url, title, created_at, staff_id, guest_id, post_tag, lat, lng, location_label, staff:staff_id(full_name, department, profile_image, verification_badge, deleted_at, organization:organization_id(name, kind)), guest:guest_id(full_name, photo_url, deleted_at)')
        .eq('visibility', 'customers')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase.from('facilities').select('name, icon').eq('is_active', true).order('sort_order').limit(6),
    ]);
    const activeStaffFiltered = (staffRes.data ?? []).filter((s) => !hidden.hiddenStaffIds.has(s.id));
    setActiveStaff(activeStaffFiltered);
    const hotel = hotelRes.data ?? null;
    setHotelInfo(hotel);
    const posts = ((feedRes.data ?? []) as FeedPost[]).filter(
      (p) =>
        !(p.staff_id && hidden.hiddenStaffIds.has(p.staff_id)) &&
        !(p.guest_id && hidden.hiddenGuestIds.has(p.guest_id)) &&
        !(p.staff_id && (p.staff as { deleted_at?: string | null } | null)?.deleted_at) &&
        !(p.guest_id && (p.guest as { deleted_at?: string | null } | null)?.deleted_at)
    );
    const postIds = posts.map((p) => p.id);
    const mediaItemsByPost: Record<string, FeedPost['media_items']> = {};
    if (postIds.length > 0) {
      const { data: mediaRows } = await supabase
        .from('feed_post_media_items')
        .select('id, post_id, media_type, media_url, thumbnail_url, sort_order')
        .in('post_id', postIds)
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
    const postsWithMedia = posts.map((p) => ({ ...p, media_items: mediaItemsByPost[p.id] ?? [] }));
    setFeedPosts(postsWithMedia);
    const facilities = facilitiesRes.data ?? [];
    setFacilities(facilities);
    try {
      const groups = await loadActiveStaffStories();
      setStoryGroups(groups);
    } catch {
      setStoryGroups([]);
    }
    const guestId = guestIdForState;
    const ids = postsWithMedia.map((p) => p.id);
    let likeCount: Record<string, number> = {};
    let commentCount: Record<string, number> = {};
    let byPost: Record<string, CustomerCommentRow[]> = {};
    let myLikeIds: string[] = [];
    if (ids.length > 0) {
      const [reactionsRes, commentsRes, myReactionsRes] = await Promise.all([
        supabase.from('feed_post_reactions').select('post_id').in('post_id', ids),
        supabase.from('feed_post_comments').select('post_id, id, staff_id, guest_id, content, created_at, staff:staff_id(full_name, profile_image, deleted_at), guest:guest_id(full_name, photo_url, deleted_at)').in('post_id', ids).order('created_at', { ascending: true }),
        guestId ? supabase.from('feed_post_reactions').select('post_id').in('post_id', ids).eq('guest_id', guestId) : Promise.resolve({ data: [] as { post_id: string }[] }),
      ]);
      const reactions = (reactionsRes.data ?? []) as { post_id: string }[];
      const comments = (commentsRes.data ?? []) as (CustomerCommentRow & { post_id: string })[];
      const myReactions = (myReactionsRes.data ?? []) as { post_id: string }[];
      likeCount = {};
      reactions.forEach((r) => { likeCount[r.post_id] = (likeCount[r.post_id] ?? 0) + 1; });
      commentCount = {};
      byPost = {};
      comments.forEach((c) => {
        if ((c.staff_id && hidden.hiddenStaffIds.has(c.staff_id)) || (c.guest_id && hidden.hiddenGuestIds.has(c.guest_id))) return;
        if ((c.staff_id && (c.staff as { deleted_at?: string | null } | null)?.deleted_at) || (c.guest_id && (c.guest as { deleted_at?: string | null } | null)?.deleted_at)) return;
        commentCount[c.post_id] = (commentCount[c.post_id] ?? 0) + 1;
        if (!byPost[c.post_id]) byPost[c.post_id] = [];
        byPost[c.post_id].push({
          id: c.id,
          staff_id: c.staff_id ?? null,
          guest_id: c.guest_id ?? null,
          content: c.content,
          created_at: c.created_at,
          staff: c.staff,
          guest: c.guest,
        });
      });
      myLikeIds = myReactions.map((r) => r.post_id);
      setLikeCounts(likeCount);
      setCommentCounts(commentCount);
      setMyLikes(new Set(myLikeIds));
      setCommentsByPost(byPost);
      if (guestId) {
        const viewRows = ids.map((post_id) => ({ post_id, guest_id: guestId }));
        supabase.from('feed_post_views').upsert(viewRows, { onConflict: 'post_id,guest_id', ignoreDuplicates: true }).then(() => {});
        const myPostIds = postsWithMedia.filter((p) => p.guest_id === guestId).map((p) => p.id);
        if (myPostIds.length > 0) {
          const { data: vcRows, error: vcErr } = await supabase.rpc('get_my_guest_feed_post_view_counts', {
            p_post_ids: myPostIds,
          });
          if (!vcErr && vcRows) {
            const m: Record<string, number> = {};
            (vcRows as { post_id: string; view_count: number }[]).forEach((r) => {
              m[r.post_id] = Number(r.view_count) || 0;
            });
            setMyGuestViewCounts(m);
          } else {
            setMyGuestViewCounts({});
          }
        } else {
          setMyGuestViewCounts({});
        }
      } else {
        setMyGuestViewCounts({});
      }
    } else {
      setLikeCounts({});
      setCommentCounts({});
      setMyLikes(new Set());
      setCommentsByPost({});
      setMyGuestViewCounts({});
    }

    prefetchImageUrls(
      [
        ...posts.flatMap((p) => [
          p.staff?.profile_image,
          p.guest?.photo_url,
          p.thumbnail_url,
          p.media_type && p.media_type !== 'video' ? p.media_url : null,
        ]),
        ...activeStaffFiltered.map((s) => s.profile_image),
      ],
      56
    );

    let myRoomValue: MyRoom | null = null;
    if (user?.email) {
      const { data: guest } = await supabase
        .from('guests')
        .select('room_id')
        .eq('email', user.email)
        .eq('status', 'checked_in')
        .order('check_in_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (guest?.room_id) {
        const { data: room } = await supabase
          .from('rooms')
          .select('room_number, view_type')
          .eq('id', guest.room_id)
          .single();
        const { data: g } = await supabase
          .from('guests')
          .select('check_in_at, check_out_at')
          .eq('room_id', guest.room_id)
          .eq('status', 'checked_in')
          .limit(1)
          .single();
        if (room && g) {
          myRoomValue = {
            room_number: room.room_number,
            view_type: room.view_type,
            check_in_at: g.check_in_at,
            check_out_at: g.check_out_at,
          };
        }
      }
    }
    setMyRoom(myRoomValue);

    // Son başarılı sonucu cache'le (bir sonraki açılışta anında gösterilecek)
    AsyncStorage.setItem(
      CUSTOMER_HOME_CACHE_KEY,
      JSON.stringify({
        activeStaff: activeStaffFiltered,
        hotelInfo: hotel,
        feedPosts: postsWithMedia,
        facilities,
        likeCounts: likeCount,
        commentCounts: commentCount,
        myLikePostIds: myLikeIds,
        commentsByPost: byPost,
        cachedAt: Date.now(),
      })
    ).catch(() => {});
  }, [user?.email]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
    setLoading(false);
  }, [load]);

  useEffect(() => {
    load().then(() => setLoading(false));
  }, [load]);

  // Android: yorum modalında klavye açılınca input klavyenin üstünde kalsın (manuel padding)
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
    if (!commentsSheetPostId) setCommentSheetKeyboardH(0);
  }, [commentsSheetPostId]);

  useEffect(() => {
    setVisibleFeedCount(30);
  }, [feedPosts]);

  useEffect(() => {
    if (!activeStory) return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setStoryKeyboardH(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setStoryKeyboardH(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [activeStory]);

  useEffect(() => {
    searchStaffMentionCandidates('', 700)
      .then((rows) => setMentionDirectory(rows))
      .catch(() => setMentionDirectory([]));
  }, []);

  const mentionHrefMap = useMemo(() => {
    const map = new Map<string, string>();
    mentionDirectory.forEach((row) => {
      const id = row.id;
      const fullName = (row.full_name ?? '').trim();
      if (!id || !fullName) return;
      const normalizedFull = fullName.toLocaleLowerCase('tr-TR');
      map.set(normalizedFull, id);
      normalizedFull.split(/\s+/).forEach((part) => {
        const p = part.trim();
        if (p && !map.has(p)) map.set(p, id);
      });
    });
    return map;
  }, [mentionDirectory]);

  const resolveMentionHref = useCallback(
    (token: string) => {
      const normalized = token.trim().toLocaleLowerCase('tr-TR');
      if (!normalized) return null;
      const direct = mentionHrefMap.get(normalized);
      if (direct) return `/customer/staff/${direct}`;
      for (const [key, id] of mentionHrefMap) {
        if (key.startsWith(normalized)) return `/customer/staff/${id}`;
      }
      return null;
    },
    [mentionHrefMap]
  );

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

  const toggleLike = useCallback(async (postId: string, authorStaffId: string | null, authorGuestId: string | null) => {
    const guestRow = await getOrCreateGuestForCurrentSession();
    if (!guestRow?.guest_id) {
      Alert.alert(t('loginRequiredTitle'), t('loginRequiredLikeMessage'));
      return;
    }
    setTogglingLike(postId);
    try {
      const liked = myLikes.has(postId);
      if (liked) {
        await supabase.from('feed_post_reactions').delete().eq('post_id', postId).eq('guest_id', guestRow.guest_id);
        setMyLikes((prev) => {
          const next = new Set(prev);
          next.delete(postId);
          return next;
        });
        setLikeCounts((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] ?? 1) - 1) }));
      } else {
        await supabase.from('feed_post_reactions').insert({ post_id: postId, guest_id: guestRow.guest_id, reaction: 'like' });
        setMyLikes((prev) => new Set(prev).add(postId));
        setLikeCounts((prev) => ({ ...prev, [postId]: (prev[postId] ?? 0) + 1 }));
        const displayName = getDisplayName() || t('aGuest');
        if (authorStaffId) {
          await sendNotification({
            staffId: authorStaffId,
            title: t('notifNewLikeTitle'),
            body: t('notifNewLikeBody', { name: displayName }),
            category: 'staff',
            notificationType: 'feed_like',
            data: { screen: 'staff_feed', url: '/staff', postId },
          });
        } else if (authorGuestId) {
          await sendNotification({
            guestId: authorGuestId,
            title: t('notifNewLikeTitle'),
            body: t('notifNewLikeBody', { name: displayName }),
            category: 'guest',
            notificationType: 'feed_like',
            data: { screen: 'customer_feed', url: '/customer/feed/' + postId, postId },
          });
        }
      }
    } catch (e) {
      // ignore
    }
    setTogglingLike(null);
  }, [myLikes, t]);

  const submitComment = useCallback(async (postId: string, authorStaffId: string | null, authorGuestId: string | null) => {
    const guestRow = await getOrCreateGuestForCurrentSession();
    if (!guestRow?.guest_id) {
      Alert.alert(t('loginRequiredTitle'), t('loginRequiredCommentMessage'));
      return;
    }
    const text = (commentText[postId] ?? '').trim();
    if (!text) return;
    setPostingComment(postId);
    try {
      const { data: inserted } = await supabase
        .from('feed_post_comments')
        .insert({ post_id: postId, guest_id: guestRow.guest_id, content: text })
        .select('id, content, created_at')
        .single();
      setCommentText((prev) => ({ ...prev, [postId]: '' }));
      const displayName = getDisplayName() || t('guestDefaultName');
      const newComment: CustomerCommentRow = {
        id: (inserted as { id: string }).id,
        content: text,
        created_at: (inserted as { created_at: string }).created_at,
        staff: null,
        guest: { full_name: displayName },
      };
      setCommentsByPost((prev) => ({
        ...prev,
        [postId]: [...(prev[postId] ?? []), newComment],
      }));
      setCommentCounts((prev) => ({ ...prev, [postId]: (prev[postId] ?? 0) + 1 }));
      const notifyBody = `${displayName}: ${text.slice(0, 60)}${text.length > 60 ? '…' : ''}`;
      const notifiedStaffIds = new Set<string>();
      if (authorStaffId) {
        notifiedStaffIds.add(authorStaffId);
        await sendNotification({
          staffId: authorStaffId,
          title: t('notifNewCommentTitle'),
          body: notifyBody,
          category: 'staff',
          notificationType: 'feed_comment',
          data: { screen: 'staff_feed', url: '/staff', postId },
        });
      } else if (authorGuestId) {
        await sendNotification({
          guestId: authorGuestId,
          title: t('notifNewCommentTitle'),
          body: notifyBody,
          category: 'guest',
          notificationType: 'feed_comment',
          data: { screen: 'customer_feed', url: '/customer/feed/' + postId, postId },
        });
      }
      const mentionStaffIds = await resolveMentionedStaffIdsFromText(text);
      for (const sid of mentionStaffIds) {
        if (notifiedStaffIds.has(sid)) continue;
        await sendNotification({
          staffId: sid,
          title: feedSharedText('notifMentionInCommentTitle'),
          body: feedSharedText('notifMentionInCommentBody', { name: displayName }),
          category: 'staff',
          notificationType: 'staff_mention',
          data: { screen: 'staff_feed', url: '/staff', postId },
        });
      }
    } catch (e) {
      // ignore
    }
    setPostingComment(null);
  }, [commentText, t]);

  const deleteOwnComment = useCallback(async (postId: string, commentId: string) => {
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
          setCommentsByPost((prev) => ({
            ...prev,
            [postId]: (prev[postId] ?? []).filter((c) => c.id !== commentId),
          }));
          setCommentCounts((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] ?? 1) - 1) }));
        },
      },
    ]);
  }, [t]);

  const openReportModal = (post: FeedPost) => {
    setMenuPostId(null);
    setReportPost(post);
    setReportReason('');
    setReportDetails('');
  };

  const handleDeleteOwnPost = useCallback(async (post: FeedPost) => {
    const guestRow = await getOrCreateGuestForCurrentSession();
    if (!guestRow?.guest_id || post.guest_id !== guestRow.guest_id) return;
    Alert.alert(t('deletePostTitle'), t('deletePostMessage'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          setMenuPostId(null);
          setDeletingPostId(post.id);
          const { error } = await supabase.from('feed_posts').delete().eq('id', post.id);
          setDeletingPostId(null);
          if (error) {
            Alert.alert(t('error'), error.message || t('postDeleteFailed'));
            return;
          }
          await removeFeedMediaObjectsForPostUrls([post.media_url, post.thumbnail_url]);
          setFeedPosts((prev) => prev.filter((p) => p.id !== post.id));
          setLikeCounts((prev) => {
            const n = { ...prev };
            delete n[post.id];
            return n;
          });
          setCommentCounts((prev) => {
            const n = { ...prev };
            delete n[post.id];
            return n;
          });
          setMyLikes((prev) => {
            const n = new Set(prev);
            n.delete(post.id);
            return n;
          });
          setCommentsByPost((prev) => {
            const n = { ...prev };
            delete n[post.id];
            return n;
          });
          if (commentsSheetPostId === post.id) setCommentsSheetPostId(null);
        },
      },
    ]);
  }, [commentsSheetPostId, t]);

  const handleBlockUser = useCallback(async (post: FeedPost) => {
    const guestRow = await getOrCreateGuestForCurrentSession();
    if (!guestRow?.guest_id) {
      Alert.alert(t('loginRequiredTitle'), t('loginRequiredBlockMessage'));
      return;
    }
    const targetStaffId = post.staff_id ?? null;
    const targetGuestId = post.guest_id ?? null;
    if (targetGuestId && targetGuestId === guestRow.guest_id) {
      Alert.alert(t('warning'), t('cannotBlockSelf'));
      return;
    }
    const targetType = targetStaffId ? 'staff' : targetGuestId ? 'guest' : null;
    const targetId = targetStaffId ?? targetGuestId;
    if (!targetType || !targetId) return;
    const rawStaff = post.staff as { full_name?: string | null } | null;
    const rawGuest = post.guest as { full_name?: string | null } | null;
    const targetName = targetStaffId
      ? ((rawStaff?.full_name ?? '').trim() || t('thisUser'))
      : guestDisplayName(rawGuest?.full_name, t('thisUser'));

    Alert.alert(t('blockUserTitle'), t('blockUserMessage', { name: targetName }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('block'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await blockUserForGuest({
            blockerGuestId: guestRow.guest_id,
            blockedType: targetType,
            blockedId: targetId,
          });
          if (error && error.code !== '23505') {
            Alert.alert(t('error'), error.message || t('blockUserFailed'));
            return;
          }
          setMenuPostId(null);
          await load();
        },
      },
    ]);
  }, [load, t]);

  const submitReport = async () => {
    if (!reportPost || !reportReason.trim()) return;
    const guestRow = await getOrCreateGuestForCurrentSession();
    if (!guestRow?.guest_id) {
      Alert.alert(t('loginRequiredTitle'), t('loginRequiredReportMessage'));
      return;
    }
    const appToken = guestRow.app_token || (await syncGuestMessagingAppToken());
    if (!appToken) {
      Alert.alert(t('loginRequiredTitle'), t('loginRequiredReportMessage'));
      return;
    }
    const reasonLabel = reportReasons.find((r) => r.value === reportReason)?.label ?? reportReason;
    setSubmittingReport(true);
    try {
      const { data: reportId, error } = await supabase.rpc('report_feed_post_guest', {
        p_app_token: appToken,
        p_post_id: reportPost.id,
        p_reason: reportReason.trim(),
        p_details: reportDetails.trim() || null,
      });
      if (error) {
        Alert.alert(t('error'), error.message ?? t('reportSaveFailed'));
        setSubmittingReport(false);
        return;
      }
      const postTitle = (reportPost.title ?? '').trim() || t('post');
      await notifyAdmins({
        title: t('adminFeedReportGuestTitle'),
        body: `"${postTitle}" — ${reasonLabel}${reportDetails.trim() ? ` — ${reportDetails.trim().slice(0, 40)}…` : ''}`,
        data: { url: '/admin/reports', screen: 'admin', postId: reportPost.id },
      }).catch(() => {});
      setReportPost(null);
      setReportReason('');
      setReportDetails('');
      Alert.alert(
        t('reportReceivedTitle'),
        t('reportReceivedMessage'),
        [{ text: t('ok') }]
      );
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('reportSendFailed'));
    }
    setSubmittingReport(false);
  };


  if (loading && activeStaff.length === 0 && !hotelInfo) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Skeleton height={118} borderRadius={theme.radius.lg} style={{ marginBottom: theme.spacing.md }} />
        <View style={styles.quickActionsRow}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={72} borderRadius={theme.radius.md} style={{ flex: 1, minWidth: 0 }} />
          ))}
        </View>
        <View style={styles.categoryRow}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} width={56} height={56} borderRadius={12} style={{ marginRight: 12 }} />
          ))}
        </View>
        <Text style={styles.sectionTitle}>{feedSharedText('guestHomeStaff')}</Text>
        <View style={{ flexDirection: 'row', gap: 16, marginBottom: 24 }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} width={72} height={72} borderRadius={36} />
          ))}
        </View>
        <SkeletonCard />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      scrollEnabled={!commentsSheetPostId}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
      }
    >
      {myRoom ? (
        <>
          <Text style={[styles.sectionTitle, styles.sectionTitleAfterHero]}>{feedSharedText('guestHomeMyRoom')}</Text>
          <View style={styles.roomCard}>
            <View style={styles.roomCardAccent} />
            <View style={styles.roomCardInner}>
              <View style={styles.roomCardHeader}>
                <View style={styles.roomNumberBadge}>
                  <Ionicons name="bed-outline" size={20} color={theme.colors.primary} />
                  <Text style={styles.roomTitle}>{feedSharedText('guestHomeRoomNumber', { room: myRoom.room_number })}</Text>
                </View>
                {myRoom.view_type ? (
                  <View style={styles.roomViewChip}>
                    <Text style={styles.roomViewChipText}>{myRoom.view_type}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.roomDatesRow}>
                {myRoom.check_in_at && (
                  <View style={styles.roomDateItem}>
                    <Ionicons name="log-in-outline" size={14} color={theme.colors.textSecondary} />
                    <Text style={styles.roomMeta}>{new Date(myRoom.check_in_at).toLocaleDateString(locTag)} · 14:00</Text>
                  </View>
                )}
                {myRoom.check_out_at && (
                  <View style={styles.roomDateItem}>
                    <Ionicons name="log-out-outline" size={14} color={theme.colors.textSecondary} />
                    <Text style={styles.roomMeta}>{new Date(myRoom.check_out_at).toLocaleDateString(locTag)} · 11:00</Text>
                  </View>
                )}
              </View>
              <View style={styles.roomActions}>
                <TouchableOpacity style={styles.roomBtn} onPress={() => router.push('/customer/key')} activeOpacity={0.8}>
                  <Ionicons name="key-outline" size={18} color={theme.colors.primary} />
                  <Text style={styles.roomBtnText}>{t('digitalKey')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.roomBtn} onPress={() => router.push('/customer/room-service/')} activeOpacity={0.8}>
                  <Ionicons name="restaurant-outline" size={18} color={theme.colors.primary} />
                  <Text style={styles.roomBtnText}>{t('screenRoomService')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.roomBtn} onPress={() => router.push('/(tabs)/messages')} activeOpacity={0.8}>
                  <Ionicons name="sparkles-outline" size={18} color={theme.colors.primary} />
                  <Text style={styles.roomBtnText}>{feedSharedText('guestRequestCleaning')}</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.complaintBtn}
                onPress={() => router.push('/customer/complaints/new')}
                activeOpacity={0.85}
              >
                <Ionicons name="flag-outline" size={18} color="#fff" />
                <Text style={styles.complaintBtnText}>{complaintsText('homeComplaintCta')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      ) : null}

      {facilities.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>{feedSharedText('guestHomeFacilities')}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.facilitiesRow}
            style={styles.storyScroll}
          >
            {facilities.map((f, idx) => (
              <View key={`${f.name}-${idx}`} style={styles.facilityChip}>
                <View style={styles.facilityIconCircle}>
                  <Ionicons name={getFacilityIonIcon(f.icon, f.name)} size={22} color={theme.colors.primaryDark} />
                </View>
                <Text style={styles.facilityChipName} numberOfLines={2}>
                  {f.name}
                </Text>
              </View>
            ))}
          </ScrollView>
        </>
      ) : null}

      {/* Personeller - kart stili */}
      <Text style={styles.sectionLabel}>{feedSharedText('guestHomeStaff')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.staffCardsRow}
        style={styles.storyScroll}
      >
        {activeStaff.map((staff) => {
          const presenceColor = staff.is_online ? theme.colors.success : theme.colors.error;
          const storyGIdx = storyGroupIndexByStaffId.get(staff.id);
          const hasStory = storyGIdx !== undefined;
          return (
            <View key={staff.id} style={styles.staffCard}>
              <View style={styles.staffCardInner}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    if (hasStory) openStoryAt(storyGIdx, 0);
                    else router.push(`/customer/staff/${staff.id}`);
                  }}
                  onLongPress={hasStory ? () => router.push(`/customer/staff/${staff.id}`) : undefined}
                  delayLongPress={1000}
                >
                  <LinearGradient
                    colors={['#ff2d55', '#ff375f', '#ff8a00', '#7c3aed']}
                    start={{ x: 0.1, y: 0.2 }}
                    end={{ x: 0.9, y: 0.8 }}
                    style={styles.staffCardRing}
                  >
                    <AvatarWithBadge badge={staff.verification_badge ?? null} avatarSize={68} badgeSize={14}>
                      {staff.profile_image ? (
                        <CachedImage uri={staff.profile_image} style={styles.staffCardAvatar} contentFit="cover" />
                      ) : (
                        <View style={[styles.staffCardAvatar, styles.staffCardPlaceholder]}>
                          <Text style={styles.staffCardLetter}>{(staff.full_name || 'P').charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                    </AvatarWithBadge>
                    <Animated.View
                      style={[
                        styles.statusDot,
                        styles.statusDotOnline,
                        {
                          backgroundColor: presenceColor,
                          opacity: onlineBlinkOpacity,
                        },
                      ]}
                    />
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => router.push(`/customer/staff/${staff.id}`)}
                  style={styles.staffCardTextBlock}
                >
                  <StaffNameWithBadge
                    name={staff.full_name?.split(' ')[0] || t('visitorTypeStaff')}
                    badge={staff.verification_badge ?? null}
                    textStyle={styles.staffCardName}
                  />
                  <Text style={styles.staffCardDept} numberOfLines={1}>{staff.department || '—'}</Text>
                  {staff.organization?.name ? (
                    <Text style={styles.staffCardOrg} numberOfLines={2}>
                      {staff.organization.name}
                      {staff.organization.kind === 'tour_office' ? ' • Ofis' : staff.organization.kind ? ' • Otel' : ''}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <Text style={styles.feedSectionHeading}>{feedSharedText('guestHomeFeed')}</Text>
      {loading && feedPosts.length === 0 ? (
        <View style={{ gap: 14 }}>
          {[1, 2, 3].map((i) => (
            <SkeletonCard key={`feed-sk-${i}`} />
          ))}
        </View>
      ) : feedPosts.length === 0 ? (
        <View style={styles.emptyFeed}>
          <View style={styles.emptyFeedIconWrap}>
            <Ionicons name="images-outline" size={40} color={theme.colors.primary} />
          </View>
          <Text style={styles.emptyFeedTitle}>{feedSharedText('guestHomeEmptyFeedTitle')}</Text>
          <Text style={styles.emptyFeedText}>
            {feedSharedText('guestHomeEmptyFeedSub')}
          </Text>
          <TouchableOpacity style={styles.emptyFeedCta} onPress={() => router.push('/customer/feed/new')} activeOpacity={0.85}>
            <Ionicons name="camera-outline" size={20} color="#fff" />
            <Text style={styles.emptyFeedCtaText}>{feedSharedText('guestHomeCreatePost')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.feedList}>
          {visibleFeedPosts.map((post) => {
            const rawStaff = post.staff as {
              full_name?: string;
              department?: string;
              profile_image?: string | null;
              verification_badge?: 'blue' | 'yellow' | null;
              organization?: { name?: string | null; kind?: string | null } | null;
            } | null;
            const rawGuest = post.guest;
            const staffInfo = Array.isArray(rawStaff) ? rawStaff[0] ?? null : rawStaff;
            const guestInfo = Array.isArray(rawGuest) ? (rawGuest[0] as { full_name?: string | null; photo_url?: string | null } | null) ?? null : (rawGuest as { full_name?: string | null; photo_url?: string | null } | null);

            const isGuestPost = !staffInfo && !!(guestInfo || post.guest_id);
            const authorName = staffInfo ? (staffInfo.full_name?.trim() || t('visitorTypeStaff')) : guestDisplayName(guestInfo?.full_name, t('visitorTypeGuest'));
            const orgName = staffInfo?.organization?.name?.trim() || null;
            const orgKind = staffInfo?.organization?.kind === 'tour_office' ? 'Ofis' : staffInfo?.organization?.kind ? 'Otel' : null;
            const orgLabel = orgName ? `${orgName}${orgKind ? ` (${orgKind})` : ''}` : null;
            const roleLabel = staffInfo
              ? [staffInfo.department ?? null, orgLabel].filter(Boolean).join(' • ')
              : t('visitorTypeGuest');
            const authorBadge = staffInfo?.verification_badge ?? null;
            const authorAvatarUrl = staffInfo?.profile_image ?? guestInfo?.photo_url ?? null;

            const hasLocation = (post.lat != null && post.lng != null) || (post.location_label && post.location_label.trim());
            const titlePrefix = hasLocation
              ? `📍 ${post.location_label?.trim() || feedSharedText('feedMapLineFallback')}\n\n`
              : '';
            const mergedTitle = `${titlePrefix}${(post.title ?? '').trim()}`.trim() || null;

            const postMediaItems = (post.media_items && post.media_items.length > 0)
              ? post.media_items
              : (post.media_type !== 'text' && (post.media_url || post.thumbnail_url)
                ? [{ id: `${post.id}-legacy`, media_type: post.media_type === 'video' ? 'video' as const : 'image' as const, media_url: post.media_url || post.thumbnail_url || '', thumbnail_url: post.thumbnail_url, sort_order: 0 }]
                : []);
            const imageUri = postMediaItems.length > 0 ? (postMediaItems[0].thumbnail_url || postMediaItems[0].media_url) : null;
            const hasMedia = !!imageUri;

            const mediaEl =
              hasMedia ? (
                <TouchableOpacity
                  activeOpacity={1}
                  onPress={() => {
                    const firstItem = postMediaItems[0];
                    const isVideo = firstItem?.media_type === 'video';
                    if (isVideo) {
                      setFullscreenPostMedia({
                        uri: firstItem.media_url || firstItem.thumbnail_url || '',
                        mediaType: 'video',
                        posterUri: firstItem.thumbnail_url || firstItem.media_url || undefined,
                      });
                    } else {
                      setFullscreenPostMedia({
                        uri: firstItem?.media_url || firstItem?.thumbnail_url || '',
                        mediaType: 'image',
                      });
                    }
                  }}
                >
                  <View style={styles.postImageWrap}>
                    <FeedMediaCarousel
                      items={postMediaItems.map((m) => ({
                        id: m.id,
                        media_type: m.media_type,
                        media_url: m.media_url,
                        thumbnail_url: m.thumbnail_url,
                      }))}
                      width={SCREEN_WIDTH - HORIZONTAL_GUTTER * 2}
                      height={Math.round((SCREEN_WIDTH - HORIZONTAL_GUTTER * 2) * 1.25)}
                      onPressItem={(item) => {
                        if (item.media_type === 'video') {
                          setFullscreenPostMedia({
                            uri: item.media_url || item.thumbnail_url || '',
                            mediaType: 'video',
                            posterUri: item.thumbnail_url || item.media_url || undefined,
                          });
                        } else {
                          setFullscreenPostMedia({
                            uri: item.media_url || item.thumbnail_url || '',
                            mediaType: 'image',
                          });
                        }
                      }}
                    />
                  </View>
                </TouchableOpacity>
              ) : null;

            const comments = commentsByPost[post.id] ?? [];
            const commentPreview = comments
              .slice(-2)
              .map((c) => ({
                author: c.staff
                  ? ((c.staff as { full_name?: string | null } | null)?.full_name?.trim() || t('visitorTypeStaff'))
                  : guestDisplayName((c.guest as { full_name?: string | null } | null)?.full_name, t('visitorTypeGuest')),
                text: (c.content ?? '').trim(),
              }))
              .filter((x) => x.text);

            const isMyGuestPost = !!(myGuestId && post.guest_id === myGuestId);
            return (
              <View key={post.id}>
                <StaffFeedPostCard
                  horizontalInset={16}
                  postTag={post.post_tag ?? null}
                  authorName={authorName}
                  authorAvatarUrl={authorAvatarUrl}
                  authorBadge={authorBadge}
                  isGuestPost={isGuestPost}
                  roleLabel={roleLabel}
                  timeAgo={timeAgoFn(post.created_at) || feedSharedText('timeJustNow')}
                  createdAtLabel={formatDateTime(post.created_at)}
                  title={mergedTitle}
                  media={mediaEl}
                  hasMedia={!!hasMedia}
                  liked={myLikes.has(post.id)}
                  likeCount={likeCounts[post.id] ?? 0}
                  commentCount={commentCounts[post.id] ?? 0}
                  viewCount={isMyGuestPost ? (myGuestViewCounts[post.id] ?? 0) : 0}
                  showViewStats={isMyGuestPost}
                  viewersListEnabled={false}
                  commentPreview={commentPreview}
                  togglingLike={togglingLike === post.id}
                  deletingPost={deletingPostId === post.id}
                  onAuthorPress={post.staff_id ? () => router.push(`/customer/staff/${post.staff_id}`) : undefined}
                  onAvatarPress={
                    post.staff_id
                      ? () => {
                          const gIdx = storyGroupIndexByStaffId.get(post.staff_id);
                          if (gIdx !== undefined) {
                            openStoryAt(gIdx, 0);
                          } else {
                            router.push(`/customer/staff/${post.staff_id}`);
                          }
                        }
                      : undefined
                  }
                  onAvatarLongPress={
                    post.staff_id && storyGroupIndexByStaffId.get(post.staff_id) !== undefined
                      ? () => router.push(`/customer/staff/${post.staff_id}`)
                      : undefined
                  }
                  onLike={() => toggleLike(post.id, post.staff_id ?? null, post.guest_id ?? null)}
                  onComment={() => setCommentsSheetPostId(commentsSheetPostId === post.id ? null : post.id)}
                  onDetailsPress={() => setCommentsSheetPostId(commentsSheetPostId === post.id ? null : post.id)}
                  onViewers={() => {}}
                  onMenu={() => {
                    if (user && myGuestId && post.guest_id === myGuestId) {
                      handleDeleteOwnPost(post);
                      return;
                    }
                    setMenuPostId(menuPostId === post.id ? null : post.id);
                  }}
                />

                <Modal visible={menuPostId === post.id} transparent animationType="fade" onRequestClose={() => setMenuPostId(null)}>
                  <Pressable style={styles.menuModalOverlay} onPress={() => setMenuPostId(null)}>
                    <View style={styles.menuModalBox}>
                      <TouchableOpacity style={styles.menuModalItem} onPress={() => handleBlockUser(post)} activeOpacity={0.7}>
                        <Ionicons name="ban-outline" size={22} color={theme.colors.error} />
                        <Text style={[styles.menuModalItemText, { color: theme.colors.error }]}>{t('block')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.menuModalItem} onPress={() => openReportModal(post)} activeOpacity={0.7}>
                        <Ionicons name="flag-outline" size={22} color={theme.colors.text} />
                        <Text style={styles.menuModalItemText}>{feedSharedText('reportVerb')}</Text>
                      </TouchableOpacity>
                    </View>
                  </Pressable>
                </Modal>
              </View>
            );
          })}
          {feedPosts.length > visibleFeedCount ? (
            <TouchableOpacity onPress={() => setVisibleFeedCount((c) => c + 30)} style={styles.showAllBtn}>
              <Text style={styles.showAllText}>{feedSharedText('guestShowMore')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {/* Yorum kartı */}
      <Modal
        visible={!!commentsSheetPostId}
        animationType="slide"
        transparent
        onRequestClose={() => setCommentsSheetPostId(null)}
      >
        <View style={styles.commentSheetOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setCommentsSheetPostId(null)} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.commentSheetKeyboard}
            pointerEvents="box-none"
          >
            <View
              style={[styles.commentSheetCard, Platform.OS === 'android' && commentSheetKeyboardH > 0 && { paddingBottom: commentSheetKeyboardH + 24 }]}
            >
              <View style={styles.commentSheetHeader}>
                <Text style={styles.commentSheetTitle}>{feedSharedText('guestComments')}</Text>
                <TouchableOpacity onPress={() => setCommentsSheetPostId(null)} hitSlop={16}>
                  <Ionicons name="close" size={24} color={theme.colors.text} />
                </TouchableOpacity>
              </View>
              {commentsSheetPostId && (() => {
                const post = feedPosts.find((p) => p.id === commentsSheetPostId);
                const comments = commentsByPost[commentsSheetPostId] ?? [];
                if (!post) return null;
                return (
                  <>
                    <View style={styles.commentSheetBody}>
                      <FlatList
                        style={styles.commentSheetScroll}
                        contentContainerStyle={styles.commentSheetScrollContent}
                        data={comments}
                        keyExtractor={(item) => item.id}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="on-drag"
                        showsVerticalScrollIndicator={false}
                      nestedScrollEnabled={false}
                        scrollEnabled
                      removeClippedSubviews={false}
                        ListEmptyComponent={<Text style={styles.commentSheetEmpty}>{feedSharedText('guestCommentsEmpty')}</Text>}
                        renderItem={({ item: c }) => {
                          const isGuestComment = !c.staff_id && !!c.guest_id;
                          const authorName = isGuestComment
                            ? guestDisplayName(c.guest?.full_name, '—')
                            : ((c.staff?.full_name ?? '—').trim() || '—');
                          const avatarUri = c.staff?.profile_image ?? c.guest?.photo_url ?? null;
                          const canDelete = !!(myGuestId && c.guest_id && c.guest_id === myGuestId && !c.staff_id);
                          return (
                            <View style={styles.commentSheetRow}>
                              {avatarUri ? (
                                <CachedImage uri={avatarUri} style={styles.commentSheetAvatar} contentFit="cover" />
                              ) : (
                                <View style={isGuestComment ? styles.commentSheetAvatarPlaceholderGuest : styles.commentSheetAvatarPlaceholder}>
                                  <Text style={isGuestComment ? styles.commentSheetAvatarInitialGuest : styles.commentSheetAvatarInitial}>{(authorName || '—').charAt(0).toUpperCase()}</Text>
                                </View>
                              )}
                              <View style={styles.commentSheetRowBody}>
                                <Text style={styles.commentSheetAuthor}>{authorName}</Text>
                                <MentionableText
                                  text={c.content}
                                  textStyle={styles.commentSheetText}
                                  mentionStyle={styles.commentMention}
                                  resolveMentionHref={resolveMentionHref}
                                  onMentionPress={(href) => router.push(href)}
                                />
                                <View style={styles.commentSheetMetaRow}>
                                  <Text style={styles.commentSheetTime}>{formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: dateLocale })}</Text>
                                  {canDelete ? (
                                    <TouchableOpacity onPress={() => deleteOwnComment(post.id, c.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                      <Text style={styles.commentDeleteText}>{t('delete')}</Text>
                                    </TouchableOpacity>
                                  ) : null}
                                </View>
                              </View>
                            </View>
                          );
                        }}
                      />
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
                          <Text style={styles.mentionEmptyText}>{feedSharedText('guestMentionNoResults')}</Text>
                        </View>
                      ) : null}
                      <View style={styles.commentSheetInputRow}>
                        <TextInput
                          style={styles.commentSheetInput}
                          placeholder={feedSharedText('guestCommentPlaceholder')}
                          placeholderTextColor={theme.colors.textMuted}
                          value={commentText[post.id] ?? ''}
                          onChangeText={(text) => setCommentText((prev) => ({ ...prev, [post.id]: text }))}
                          multiline
                          maxLength={500}
                          editable={postingComment !== post.id}
                        />
                        <TouchableOpacity
                          style={[styles.commentSendBtn, (!(commentText[post.id] ?? '').trim() || postingComment === post.id) && styles.commentSendBtnDisabled]}
                          onPress={() => submitComment(post.id, post.staff_id ?? null, post.guest_id ?? null)}
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
                    </View>
                  </>
                );
              })()}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        visible={!!activeStory}
        transparent
        animationType="fade"
        onRequestClose={closeStoryPlayer}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
        <Pressable style={styles.fullscreenOverlay} onPress={closeStoryPlayer}>
          {activeStory ? (
            <Pressable style={styles.fullscreenImageWrap} onPress={(e) => e.stopPropagation()}>
              <TouchableOpacity
                style={styles.storyPlayerAuthorRow}
                onPress={goToStoryAuthorProfile}
                activeOpacity={0.85}
                disabled={!activeStoryGroup?.staff_id}
                accessibilityRole="button"
                accessibilityLabel={activeStoryGroup?.author_name ? `${activeStoryGroup.author_name} · profil` : undefined}
              >
                {activeStoryGroup?.author_avatar ? (
                  <CachedImage
                    uri={activeStoryGroup.author_avatar}
                    style={styles.storyPlayerAuthorAvatar}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.storyPlayerAuthorAvatar, styles.storyPlayerAuthorAvatarPh]}>
                    <Text style={styles.storyPlayerAuthorAvatarLetter}>
                      {(activeStoryGroup?.author_name ?? '?').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={styles.storyPlayerAuthorName} numberOfLines={1}>
                  {activeStoryGroup?.author_name ?? t('visitorTypeStaff')}
                </Text>
              </TouchableOpacity>
              {!!activeStory.caption?.trim() ? (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ color: '#fff', fontSize: 13, textAlign: 'center' }}>{activeStory.caption}</Text>
                </View>
              ) : null}
              <View
                style={[
                  styles.storyMediaSlot,
                  { width: SCREEN_WIDTH - 24, height: storyMediaHeight },
                ]}
                pointerEvents="box-none"
              >
                {activeStory.media_type === 'video' ? (
                  <>
                    <Video
                      key={activeStory.id}
                      ref={storyVideoRef}
                      source={{ uri: activeStory.media_url }}
                      style={[styles.fullscreenImage, styles.fullscreenVideo, { width: '100%', height: '100%' }]}
                      useNativeControls
                      resizeMode="contain"
                      shouldPlay
                      isLooping={false}
                      onLoad={() => setStoryVideoReady(true)}
                    />
                    {activeStory.thumbnail_url && !storyVideoReady ? (
                      <CachedImage
                        uri={activeStory.thumbnail_url}
                        style={[StyleSheet.absoluteFillObject, styles.fullscreenPosterImage]}
                        contentFit="contain"
                      />
                    ) : null}
                  </>
                ) : (
                  <CachedImage
                    uri={activeStory.media_url}
                    style={[styles.fullscreenImage, { width: '100%', height: '100%' }]}
                    contentFit="contain"
                  />
                )}
                <TouchableOpacity
                  style={[styles.storyLikeMiniBtn, storyLikedByMe && styles.storyLikeMiniBtnOn]}
                  onPress={toggleStoryLikeAsGuest}
                  activeOpacity={0.85}
                  disabled={storyBusy || !myGuestId}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons
                    name={storyLikedByMe ? 'heart' : 'heart-outline'}
                    size={14}
                    color={storyLikedByMe ? theme.colors.error : '#fff'}
                  />
                  <Text style={[styles.storyLikeMiniText, storyLikedByMe && styles.storyLikeMiniTextOn]}>
                    {storyLikeCount}
                  </Text>
                </TouchableOpacity>
              </View>
              <View
                style={{
                  width: SCREEN_WIDTH - 24,
                  marginTop: 12,
                  gap: 8,
                  marginBottom: storyKeyboardH > 0 ? Math.max(8, storyKeyboardH - 10) : 0,
                }}
              >
                <View style={styles.storyReplyInputRow}>
                  <TextInput
                    style={styles.storyReplyInput}
                    placeholder="Hikayeye yanit yaz..."
                    placeholderTextColor="rgba(255,255,255,0.55)"
                    value={storyReplyText}
                    onChangeText={setStoryReplyText}
                    editable={!storyBusy}
                    maxLength={300}
                  />
                  <TouchableOpacity
                    style={[styles.commentSendBtn, (!storyReplyText.trim() || storyBusy) && styles.commentSendBtnDisabled]}
                    onPress={submitStoryReplyAsGuest}
                    disabled={!storyReplyText.trim() || storyBusy}
                    activeOpacity={0.8}
                  >
                    {storyBusy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={20} color="#fff" />}
                  </TouchableOpacity>
                </View>
                {storyReplies.length > 0 ? (
                  <View style={styles.storyRepliesBox}>
                    {storyReplies.slice(0, 3).map((r) => (
                      <Text key={r.id} style={styles.storyReplyItem} numberOfLines={2}>
                        <Text style={styles.storyReplyAuthor}>{r.author}: </Text>
                        {r.content}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            </Pressable>
          ) : null}
          <TouchableOpacity
            style={[styles.fullscreenCloseBtn, { top: insets.top + 8 }]}
            onPress={closeStoryPlayer}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={40} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Bildir modal: sebep + açıklama */}
      <Modal
        visible={!!reportPost}
        animationType="slide"
        transparent
        onRequestClose={() => setReportPost(null)}
      >
        <Pressable style={styles.reportModalOverlay} onPress={() => setReportPost(null)}>
          <Pressable style={styles.reportModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.reportModalHeader}>
              <Text style={styles.reportModalTitle}>{feedSharedText('feedReportTitle')}</Text>
              <TouchableOpacity onPress={() => setReportPost(null)} hitSlop={16}>
                <Ionicons name="close" size={28} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.reportModalScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.reportModalSubtitle}>{feedSharedText('feedReportReasonPrompt')}</Text>
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
              <Text style={styles.reportModalSubtitle}>{feedSharedText('feedReportNoteOptional')}</Text>
              <TextInput
                style={styles.reportDetailsInput}
                placeholder={feedSharedText('feedReportDetailsPlaceholder')}
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
                  <Text style={styles.reportSubmitBtnText}>{t('submit')}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Gönderi medyası tam ekran (resim / video) — personel ile aynı */}
      <Modal
        visible={!!fullscreenPostMedia}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenPostMedia(null)}
      >
        <Pressable
          style={[styles.fullscreenOverlay, { width: SCREEN_WIDTH, height: SCREEN_HEIGHT }]}
          onPress={() => setFullscreenPostMedia(null)}
        >
          {fullscreenPostMedia ? (
            <>
              <View style={styles.fullscreenImageWrap} pointerEvents="box-none">
                {fullscreenPostMedia.mediaType === 'video' ? (
                  <>
                    <Video
                      key={fullscreenPostMedia.uri}
                      ref={fullscreenVideoRef}
                      source={{ uri: fullscreenPostMedia.uri }}
                      usePoster={false}
                      style={[styles.fullscreenImage, styles.fullscreenVideo, { width: SCREEN_WIDTH - 48, height: SCREEN_HEIGHT - 96 }]}
                      useNativeControls={false}
                      resizeMode="contain"
                      isLooping={false}
                      shouldPlay
                      isMuted={false}
                      onLoad={() => {
                        setFullscreenVideoReady(true);
                        fullscreenVideoRef.current?.playAsync().catch(() => {});
                        fullscreenVideoRef.current?.setVolumeAsync(1.0).catch(() => {});
                      }}
                    />
                    {fullscreenPostMedia.posterUri && !fullscreenVideoReady ? (
                      <CachedImage
                        uri={fullscreenPostMedia.posterUri}
                        style={[StyleSheet.absoluteFillObject, styles.fullscreenPosterImage, { width: SCREEN_WIDTH - 48, height: SCREEN_HEIGHT - 96 }]}
                        contentFit="contain"
                        pointerEvents="none"
                      />
                    ) : null}
                  </>
                ) : (
                  <CachedImage
                    uri={fullscreenPostMedia.uri}
                    style={[styles.fullscreenImage, { width: SCREEN_WIDTH - 48, height: SCREEN_HEIGHT - 96 }]}
                    contentFit="contain"
                  />
                )}
              </View>
              <TouchableOpacity
                style={[styles.fullscreenCloseBtn, { top: insets.top + 8 }]}
                onPress={() => setFullscreenPostMedia(null)}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              >
                <Ionicons name="close-circle" size={40} color="rgba(255,255,255,0.9)" />
              </TouchableOpacity>
            </>
          ) : null}
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: pds.pageBg },
  content: { padding: HORIZONTAL_GUTTER, paddingBottom: theme.spacing.xxl + 24 },
  heroCard: {
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: `${theme.colors.primary}28`,
    ...theme.shadows.md,
  },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  heroTitle: { fontSize: 24, fontWeight: '800', color: theme.colors.text, lineHeight: 30, marginBottom: 6 },
  heroSubtitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginTop: 6,
    lineHeight: 22,
  },
  heroLocationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    maxWidth: '100%',
  },
  heroLocationChipText: { flex: 1, fontSize: 13, color: theme.colors.text, fontWeight: '500' },
  heroDescription: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.textSecondary,
  },
  heroCta: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    borderWidth: 1,
    borderColor: `${theme.colors.primaryDark}22`,
  },
  heroCtaText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  facilitiesRow: {
    flexDirection: 'row',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    gap: 12,
    paddingRight: theme.spacing.xl,
  },
  facilityChip: {
    width: 88,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  facilityIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: `${theme.colors.primary}12`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  facilityChipName: { fontSize: 11, fontWeight: '600', color: theme.colors.text, textAlign: 'center', lineHeight: 14 },
  sectionTitleAfterHero: { marginTop: theme.spacing.sm },
  feedSectionHeading: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.sm,
    letterSpacing: 0.2,
  },
  highlightsBlock: { marginBottom: 6 },
  highlightsHead: { paddingHorizontal: 4, marginBottom: 8 },
  highlightsTitle: { fontSize: 14, fontWeight: '900', color: theme.colors.text, letterSpacing: 0.2 },
  highlightsSub: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted, marginTop: 2 },
  highlightsRow: { flexDirection: 'row', paddingHorizontal: theme.spacing.lg, gap: 12, paddingRight: theme.spacing.xl },
  highlightCard: {
    width: 160,
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.md,
  },
  highlightThumb: { width: '100%', height: 84, borderRadius: 14, overflow: 'hidden', backgroundColor: theme.colors.borderLight, marginBottom: 10 },
  highlightCardTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.text, lineHeight: 18, minHeight: 36 },
  highlightMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  highlightMeta: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary },
  storyPlayerAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 12,
    paddingHorizontal: 8,
    alignSelf: 'center',
    maxWidth: SCREEN_WIDTH - 24,
  },
  storyPlayerAuthorAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  storyPlayerAuthorAvatarPh: { justifyContent: 'center', alignItems: 'center' },
  storyPlayerAuthorAvatarLetter: { fontSize: 18, fontWeight: '700', color: '#fff' },
  storyPlayerAuthorName: { color: '#fff', fontWeight: '700', fontSize: 14, flex: 1, minWidth: 0 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
    letterSpacing: 0.3,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.md,
    letterSpacing: 0.2,
  },
  storyScroll: { marginHorizontal: -theme.spacing.lg },
  staffCardsRow: {
    flexDirection: 'row',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    gap: 24,
    paddingRight: theme.spacing.xl,
  },
  staffCard: { width: 80, alignItems: 'center' },
  staffCardInner: { alignItems: 'center' },
  staffCardRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    padding: 2.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    overflow: 'visible',
    position: 'relative',
  },
  staffCardAvatar: { width: 68, height: 68, borderRadius: 34, backgroundColor: theme.colors.borderLight },
  staffCardPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.primaryLight + '50',
  },
  staffCardPlaceholderGuest: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.guestAvatarBg,
  },
  staffCardLetter: { fontSize: 26, fontWeight: '700', color: theme.colors.primary },
  staffCardLetterGuest: { fontSize: 26, fontWeight: '700', color: theme.colors.guestAvatarLetter },
  staffCardTextBlock: { minHeight: 36, alignItems: 'center', justifyContent: 'flex-start' },
  staffCardName: { fontWeight: '600', fontSize: 13, color: theme.colors.text, textAlign: 'center' },
  staffCardDept: { fontSize: 11, color: theme.colors.textMuted, marginTop: 4, textAlign: 'center' },
  staffCardOrg: { fontSize: 10, color: theme.colors.primary, marginTop: 2, textAlign: 'center', fontWeight: '700' },
  statusDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: theme.colors.surface,
    zIndex: 5,
  },
  statusDotOnline: {},
  messageAvatarWrap: { position: 'relative', marginRight: 12 },
  messageOnlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.success,
    borderWidth: 2,
    borderColor: theme.colors.surface,
  },
  hotelCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    ...theme.shadows.md,
    position: 'relative',
  },
  hotelCardAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: theme.colors.primary,
    borderTopLeftRadius: theme.radius.lg,
    borderBottomLeftRadius: theme.radius.lg,
  },
  hotelCardInner: { padding: theme.spacing.lg, paddingLeft: theme.spacing.lg + 4 },
  hotelCardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  hotelIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: `${theme.colors.primary}18`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  hotelCardHead: { flex: 1 },
  hotelCardTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 4 },
  hotelStarsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: theme.radius.full,
    backgroundColor: `${theme.colors.primary}20`,
  },
  hotelStarsText: { fontSize: 12, fontWeight: '600', color: theme.colors.primaryDark },
  hotelFacilities: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 14, lineHeight: 20 },
  hotelCardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  hotelCardLink: { color: theme.colors.primary, fontWeight: '600', fontSize: 14 },
  hotelQuickLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  quickLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  quickLinkText: { fontSize: 14, color: theme.colors.text, fontWeight: '600' },
  roomCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    ...theme.shadows.md,
    position: 'relative',
  },
  roomCardAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: theme.colors.primary,
    borderTopLeftRadius: theme.radius.lg,
    borderBottomLeftRadius: theme.radius.lg,
  },
  roomCardInner: { padding: theme.spacing.lg, paddingLeft: theme.spacing.lg + 4 },
  roomCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  roomNumberBadge: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roomTitle: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  roomViewChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.borderLight,
  },
  roomViewChipText: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
  roomDatesRow: { gap: 8, marginBottom: 4 },
  roomDateItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  roomMeta: { fontSize: 13, color: theme.colors.textSecondary },
  roomActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  roomBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: `${theme.colors.primary}14`,
    borderWidth: 1,
    borderColor: `${theme.colors.primary}30`,
  },
  roomBtnText: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  complaintBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.error,
  },
  complaintBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  messageList: { gap: 8 },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    ...theme.shadows.sm,
  },
  messageAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.borderLight },
  messageAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primaryLight + '40',
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageAvatarLetter: { fontSize: 18, fontWeight: '700', color: theme.colors.primary },
  messageBody: { flex: 1 },
  messageLabel: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  messageDept: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
  collapseSection: { marginBottom: 4 },
  collapseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  feedList: { gap: 14 },
  feedItem: {
    flexDirection: 'column',
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: `${theme.colors.primary}18`,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 22,
    elevation: 6,
  },
  feedItemAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: theme.colors.primaryLight,
    zIndex: 2,
    opacity: 0.9,
  },
  feedLocationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  feedLocationText: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: '600',
    flex: 1,
  },
  feedItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  feedAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.borderLight,
  },
  feedAvatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.primary + '20',
  },
  feedAvatarPlaceholderGuest: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.guestAvatarBg,
  },
  feedAvatarLetter: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  feedAvatarLetterGuest: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.guestAvatarLetter,
  },
  feedItemHeaderText: { flex: 1, minWidth: 0 },
  feedHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  feedDeleteHeaderBtn: { padding: 8 },
  feedMenuBtn: { padding: 8 },
  feedAuthorName: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  menuModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  menuModalBox: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    minWidth: 200,
    overflow: 'hidden',
  },
  menuModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  menuModalItemText: { fontSize: 16, fontWeight: '500', color: theme.colors.text },
  reportModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  reportModalContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    paddingBottom: 34,
  },
  reportModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  reportModalTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  reportModalScroll: { paddingHorizontal: 20, paddingTop: 16 },
  reportModalSubtitle: { fontSize: 14, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: 10 },
  reportReasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  reportReasonRowSelected: { backgroundColor: theme.colors.primaryLight + '30', borderRadius: 10 },
  reportReasonLabel: { fontSize: 15, color: theme.colors.text },
  reportDetailsInput: {
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  reportSubmitBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  reportSubmitBtnDisabled: { opacity: 0.5 },
  reportSubmitBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  postMediaTouchable: { width: '100%', paddingHorizontal: 12 },
  postImageWrap: {
    position: 'relative',
    width: '100%',
    aspectRatio: 4 / 5,
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
  feedItemBody: { padding: 12, paddingTop: 4 },
  feedItemTitle: { fontWeight: '600', fontSize: 15, color: theme.colors.text },
  feedItemTitleTextOnly: { fontSize: 16, lineHeight: 24, marginBottom: 0 },
  feedItemMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  feedItemMeta: { fontSize: 12, color: theme.colors.textMuted },
  feedItemDate: { fontSize: 12, color: theme.colors.textMuted },
  feedActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.colors.borderLight },
  feedCommentPreviewWrap: {
    marginTop: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: `${theme.colors.primary}08`,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  feedCommentPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  feedCommentPreviewAuthor: { fontSize: 12, fontWeight: '900', color: theme.colors.text, maxWidth: '42%' },
  feedCommentPreviewText: { flex: 1, fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
  feedCommentPreviewMore: { marginTop: 2, fontSize: 12, fontWeight: '800', color: theme.colors.primary },
  feedActionPill: {
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
  feedActionPillActive: { backgroundColor: `${theme.colors.error}10`, borderColor: `${theme.colors.error}33` },
  feedActionPillText: { fontSize: 13, fontWeight: '800', color: theme.colors.textSecondary, minWidth: 16 },
  feedActionPillTextActive: { color: theme.colors.error },
  feedDetailLink: { fontSize: 13, fontWeight: '800', color: theme.colors.primary },
  commentSheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  commentSheetKeyboard: { flex: 1, justifyContent: 'flex-end' },
  commentSheetCard: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 24,
    height: '72%',
    minHeight: 320,
    maxHeight: '92%',
  },
  commentSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.borderLight },
  commentSheetTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  commentSheetBody: { flex: 1, minHeight: 0 },
  commentSheetScroll: { flex: 1, minHeight: 0 },
  commentSheetScrollContent: { padding: 20, paddingBottom: 16 },
  commentSheetRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 10 },
  commentSheetAvatar: { width: 36, height: 36, borderRadius: 18 },
  commentSheetAvatarPlaceholder: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.borderLight, justifyContent: 'center', alignItems: 'center' },
  commentSheetAvatarPlaceholderGuest: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.guestAvatarBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentSheetAvatarInitial: { fontSize: 16, fontWeight: '700', color: theme.colors.textSecondary },
  commentSheetAvatarInitialGuest: { fontSize: 16, fontWeight: '700', color: theme.colors.guestAvatarLetter },
  commentSheetRowBody: { flex: 1, minWidth: 0 },
  commentSheetAuthor: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  commentSheetText: { fontSize: 14, color: theme.colors.text, marginTop: 2 },
  commentMention: { color: '#0095f6', fontWeight: '700', textDecorationLine: 'underline' },
  commentSheetMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  commentSheetTime: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  commentDeleteText: { fontSize: 12, color: theme.colors.error, fontWeight: '700' },
  commentSheetEmpty: { fontSize: 15, color: theme.colors.textMuted, textAlign: 'center', paddingVertical: 24 },
  commentSheetInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 20, paddingTop: 12 },
  commentSheetInput: { flex: 1, borderWidth: 1, borderColor: theme.colors.borderLight, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: theme.colors.text, maxHeight: 100 },
  commentSendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center' },
  commentSendBtnDisabled: { opacity: 0.5 },
  storyReplyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  storyReplyInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    backgroundColor: 'rgba(255,255,255,0.08)',
    fontSize: 14,
  },
  storyRepliesBox: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.28)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  storyReplyItem: {
    color: '#fff',
    fontSize: 13,
    lineHeight: 18,
  },
  storyReplyAuthor: {
    fontWeight: '700',
    color: '#fff',
  },
  storyMediaSlot: {
    position: 'relative',
    alignSelf: 'center',
    borderRadius: 14,
    overflow: 'hidden',
  },
  storyLikeMiniBtn: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  storyLikeMiniBtnOn: {
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderColor: 'rgba(239,68,68,0.6)',
  },
  storyLikeMiniText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    minWidth: 12,
  },
  storyLikeMiniTextOn: {
    color: '#fecaca',
  },
  mentionPanel: {
    marginTop: 8,
    marginHorizontal: 20,
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
  emptyFeed: {
    padding: theme.spacing.xl,
    paddingVertical: theme.spacing.xxl,
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    marginBottom: theme.spacing.md,
  },
  emptyFeedIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: `${theme.colors.primary}16`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  emptyFeedTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyFeedText: {
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  emptyFeedCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: theme.radius.md,
  },
  emptyFeedCtaText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  emptyFeedCtaSecondary: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  emptyFeedCtaSecondaryText: { color: theme.colors.primary, fontWeight: '700', fontSize: 15 },
  showAllBtn: { padding: theme.spacing.md, alignItems: 'center' },
  showAllText: { color: theme.colors.primary, fontWeight: '600', fontSize: 14 },
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImageWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  fullscreenImage: { backgroundColor: '#000' },
  fullscreenVideo: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  fullscreenPosterImage: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  fullscreenCloseBtn: {
    position: 'absolute',
    right: 16,
    zIndex: 30,
  },
});
