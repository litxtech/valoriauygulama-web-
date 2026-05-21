import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  useWindowDimensions,
  Modal,
  Pressable,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { getOrCreateGuestForCurrentSession, syncGuestMessagingAppToken } from '@/lib/getOrCreateGuestForCaller';
import { guestGetOrCreateConversationWithStaff } from '@/lib/messagingApi';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { AvatarWithBadge, StaffNameWithBadge } from '@/components/VerifiedBadge';
import { CachedImage } from '@/components/CachedImage';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { blockUserForGuest, getHiddenUsersForGuest } from '@/lib/userBlocks';
import type { HubReview } from '@/components/StaffEvaluationHub';
import { StaffReviewsFullModal } from '@/components/StaffEvaluationHub';
import { STAFF_SOCIAL_KEYS, staffSocialOpenUrl, type StaffSocialKey } from '@/lib/staffSocialLinks';
import { loadGuestMyReviewForStaff, loadStaffProfileReviews } from '@/lib/loadStaffProfileReviews';
import { recordStaffProfileVisit } from '@/lib/staffProfileVisits';
import { readStaffProfileViewCache, writeStaffProfileViewCache } from '@/lib/staffProfileViewCache';
import { LinkifiedText } from '@/components/LinkifiedText';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';
import { StaffProfileFeedGrid } from '@/components/StaffProfileFeedGrid';
import { ProfileStatsCard } from '@/components/ProfileStatsCard';
import { loadStaffEngagementStats, type StaffEngagementStats } from '@/lib/staffEngagementStats';
import { ProfileCover } from '@/components/ProfileCover';

const COVER_HEIGHT = 260;
const AVATAR_SIZE = 116;
const HEADER_AVATAR_SIZE = 64;

type StaffDetail = {
  id: string;
  created_at?: string | null;
  tenure_note?: string | null;
  full_name: string | null;
  department: string | null;
  position: string | null;
  profile_image: string | null;
  cover_image: string | null;
  bio: string | null;
  is_online: boolean | null;
  hire_date: string | null;
  average_rating: number | null;
  total_reviews: number | null;
  specialties: string[] | null;
  languages: string[] | null;
  office_location: string | null;
  achievements: string[] | null;
  show_phone_to_guest: boolean | null;
  show_email_to_guest: boolean | null;
  show_whatsapp_to_guest: boolean | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  shift?: { start_time: string; end_time: string } | null;
  role?: string | null;
  verification_badge?: 'blue' | 'yellow' | null;
  evaluation_score?: number | null;
  evaluation_discipline?: number | null;
  evaluation_communication?: number | null;
  evaluation_speed?: number | null;
  evaluation_responsibility?: number | null;
  evaluation_insight?: string | null;
  social_links?: Record<string, string> | null;
  organization?: { name: string | null; kind: string | null } | null;
  profile_hidden_by_admin?: boolean | null;
  profile_visit_restricted?: boolean | null;
};

type Review = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  stay_room_label?: string | null;
  stay_nights_label?: string | null;
  guest?: { full_name: string | null; room_number?: string | null; photo_url?: string | null } | null;
};

const CUSTOMER_REVIEW_LIMIT = 50;

export default function StaffProfileScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : undefined;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const safeTop = Math.max(insets.top, StatusBar.currentHeight ?? 0);
  const [staff, setStaff] = useState<StaffDetail | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingChat, setStartingChat] = useState(false);
  const [coverModalVisible, setCoverModalVisible] = useState(false);
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);
  const [rateModalVisible, setRateModalVisible] = useState(false);
  const [reviewsModalVisible, setReviewsModalVisible] = useState(false);
  const [rateStars, setRateStars] = useState(0);
  const [rateComment, setRateComment] = useState('');
  const [rateStayRoom, setRateStayRoom] = useState('');
  const [rateStayNights, setRateStayNights] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [myReview, setMyReview] = useState<Review | null>(null);
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);
  const [languagesModalVisible, setLanguagesModalVisible] = useState(false);
  const [tenureModalVisible, setTenureModalVisible] = useState(false);
  const [engagement, setEngagement] = useState<StaffEngagementStats>({ posts: 0, likes: 0, comments: 0, visits: 0 });
  const [todayAnchor, setTodayAnchor] = useState(() => Date.now());
  const loadStaff = useCallback(async () => {
    if (!id) return;

    const cached = await readStaffProfileViewCache<StaffDetail>('guest', id);
    const hadCache = !!cached?.profile;
    if (hadCache) {
      setStaff(cached.profile);
      if (cached.reviews) setReviews(cached.reviews as Review[]);
      if (cached.myReview !== undefined) setMyReview(cached.myReview as Review | null);
      if (cached.engagement) setEngagement(cached.engagement);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const [guestRow, profRes] = await Promise.all([
        getOrCreateGuestForCurrentSession(),
        supabase.rpc('get_staff_public_profile', { p_staff_id: id }),
      ]);
      if (guestRow?.guest_id) {
        const hidden = await getHiddenUsersForGuest(guestRow.guest_id);
        if (hidden.hiddenStaffIds.has(id)) {
          setStaff(null);
          return;
        }
      }
      const { data: rows, error: e } = profRes;
      const s = Array.isArray(rows) ? rows[0] : rows;
      if (e || !s) {
        setStaff(null);
        return;
      }
      const raw = s as StaffDetail & {
        profile_contact?: {
          phone?: string | null;
          email?: string | null;
          whatsapp?: string | null;
          show_phone_to_guest?: boolean | null;
          show_email_to_guest?: boolean | null;
          show_whatsapp_to_guest?: boolean | null;
        };
        shift_id?: string | null;
      };
      const c = raw.profile_contact;
      const rawSocial = (raw as { social_links?: Record<string, string> | null }).social_links;
      const visitRestricted = !!(raw as { profile_visit_restricted?: boolean }).profile_visit_restricted;
      const profileHiddenByAdmin = !!(raw as { profile_hidden_by_admin?: boolean }).profile_hidden_by_admin;
      let joinFallback: { created_at: string | null; hire_date: string | null } | null = null;
      if (!visitRestricted && !raw.created_at && !raw.hire_date) {
        const { data: joinRow } = await supabase
          .from('staff')
          .select('created_at, hire_date')
          .eq('id', id)
          .maybeSingle();
        joinFallback = joinRow as { created_at: string | null; hire_date: string | null } | null;
      }
      const staffData: StaffDetail = {
        ...raw,
        shift: cached?.profile?.shift,
        created_at: raw.created_at ?? joinFallback?.created_at ?? null,
        hire_date: raw.hire_date ?? joinFallback?.hire_date ?? null,
        phone: c?.phone ?? raw.phone,
        email: c?.email ?? raw.email,
        whatsapp: c?.whatsapp ?? raw.whatsapp,
        show_phone_to_guest: c?.show_phone_to_guest ?? raw.show_phone_to_guest,
        show_email_to_guest: c?.show_email_to_guest ?? raw.show_email_to_guest,
        show_whatsapp_to_guest: c?.show_whatsapp_to_guest ?? raw.show_whatsapp_to_guest,
        social_links: rawSocial && typeof rawSocial === 'object' ? rawSocial : null,
        profile_visit_restricted: visitRestricted,
        profile_hidden_by_admin: profileHiddenByAdmin,
        organization: cached?.profile?.organization ?? null,
      };
      if (!visitRestricted && !staffData.organization) {
        const { data: orgRow } = await supabase
          .from('staff')
          .select('organization:organization_id(name,kind)')
          .eq('id', id)
          .maybeSingle();
        staffData.organization =
          (orgRow as { organization?: { name: string | null; kind: string | null } | null } | null)?.organization ?? null;
      } else if (visitRestricted) {
        staffData.organization = null;
      }
      setStaff(staffData);
      setLoading(false);
      recordStaffProfileVisit(id).catch(() => {});

      const loadSecondary = async () => {
        if (visitRestricted) {
          setReviews([]);
          setMyReview(null);
          setEngagement({ posts: 0, likes: 0, comments: 0, visits: 0 });
          void writeStaffProfileViewCache('guest', id, {
            profile: staffData,
            reviews: [],
            myReview: null,
            engagement: { posts: 0, likes: 0, comments: 0, visits: 0 },
          });
          return;
        }

        let viewerGuestId: string | null = guestRow?.guest_id ?? null;
        if (!viewerGuestId) {
          const email = (user?.email ?? user?.user_metadata?.email ?? '').toString().trim();
          if (email) {
            const { data: guest } = await supabase.from('guests').select('id').eq('email', email).limit(1).maybeSingle();
            viewerGuestId = guest?.id ?? null;
          }
        }

        const [nextReviews, nextMyReview, nextEngagement] = await Promise.all([
          loadStaffProfileReviews(id, CUSTOMER_REVIEW_LIMIT),
          loadGuestMyReviewForStaff(id, viewerGuestId),
          loadStaffEngagementStats(id).catch(() => ({ posts: 0, likes: 0, comments: 0, visits: 0 })),
        ]);

        setReviews(nextReviews as Review[]);
        setMyReview(nextMyReview as Review | null);
        setEngagement(nextEngagement);

        void writeStaffProfileViewCache('guest', id, {
          profile: staffData,
          reviews: nextReviews,
          myReview: nextMyReview,
          engagement: nextEngagement,
        });
      };

      if (!visitRestricted && raw.shift_id) {
        void supabase
          .from('shifts')
          .select('start_time, end_time')
          .eq('id', raw.shift_id)
          .single()
          .then(({ data: shift }) => {
            setStaff((prev) => {
              if (!prev || prev.id !== id) return prev;
              return { ...prev, shift: shift ?? null };
            });
          });
      }

      void loadSecondary();
    } finally {
      setLoading(false);
    }
  }, [id, user?.email, user?.user_metadata?.email]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const delay = Math.max(1000, nextMidnight.getTime() - now.getTime());
    let interval: ReturnType<typeof setInterval> | null = null;
    const timeout = setTimeout(() => {
      setTodayAnchor(Date.now());
      interval = setInterval(() => setTodayAnchor(Date.now()), 24 * 60 * 60 * 1000);
    }, delay);
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);

  const onMessage = async () => {
    if (!id) return;
    const token = await syncGuestMessagingAppToken();
    if (!token) {
      router.push({ pathname: '/customer/new-chat', params: { staffId: id } });
      return;
    }
    setStartingChat(true);
    try {
      const convId = await guestGetOrCreateConversationWithStaff(token, id);
      if (convId) router.push({ pathname: '/customer/chat/[id]', params: { id: convId } });
      else router.push({ pathname: '/customer/new-chat', params: { staffId: id } });
    } catch {
      router.push({ pathname: '/customer/new-chat', params: { staffId: id } });
    }
    setStartingChat(false);
  };

  const openRateModal = () => {
    if (myReview) return;
    setRateStars(0);
    setRateComment('');
    setRateStayRoom('');
    setRateStayNights('');
    setRateModalVisible(true);
  };

  const submitReview = async () => {
    if (!id || rateStars < 1 || rateStars > 5) return;
    setSubmittingReview(true);
    try {
      await supabase.auth.refreshSession();
      const guestRow = await getOrCreateGuestForCurrentSession();
      if (!guestRow?.guest_id) {
        Alert.alert(
          t('error'),
          t('reviewLoginRequired')
        );
        setSubmittingReview(false);
        return;
      }
      const guestId = guestRow.guest_id;
      const roomTrim = rateStayRoom.trim();
      const nightsTrim = rateStayNights.trim();
      const basePayload = {
        staff_id: id,
        guest_id: guestId,
        rating: rateStars,
        comment: rateComment.trim() || null,
      };
      const fullPayload = {
        ...basePayload,
        stay_room_label: roomTrim || null,
        stay_nights_label: nightsTrim || null,
      };
      let { error } = await supabase.from('staff_reviews').insert(fullPayload);
      const msg = String(error?.message ?? '');
      if (
        error &&
        (msg.includes('stay_room_label') ||
          msg.includes('stay_nights_label') ||
          msg.includes('schema cache') ||
          error.code === 'PGRST204')
      ) {
        ({ error } = await supabase.from('staff_reviews').insert(basePayload));
      }
      if (error) {
        if (error.code === '23505') {
          setRateModalVisible(false);
          await loadStaff();
          Alert.alert(t('error'), t('reviewAlreadySubmitted'));
          setSubmittingReview(false);
          return;
        }
        throw error;
      }
      setRateModalVisible(false);
      await loadStaff();
    } catch (e) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as Error).message) : String(e);
      Alert.alert(t('error'), msg || t('reviewSubmitFailed'));
    }
    setSubmittingReview(false);
  };

  const onCall = () => {
    const phone = staff?.phone?.trim();
    if (phone) Linking.openURL(`tel:${phone}`);
  };

  const handleBlockFromProfile = async () => {
    const guestRow = await getOrCreateGuestForCurrentSession();
    if (!guestRow?.guest_id || !id) {
      Alert.alert(t('loginRequiredTitle'), t('loginRequiredBlockMessage'));
      return;
    }
    Alert.alert(t('blockUserTitle'), t('blockUserMessage', { name: staff?.full_name?.trim() || t('userShort') }), [
      { text: t('cancelAction'), style: 'cancel' },
      {
        text: t('block'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await blockUserForGuest({
            blockerGuestId: guestRow.guest_id,
            blockedType: 'staff',
            blockedId: id,
          });
          if (error && error.code !== '23505') {
            Alert.alert(t('error'), error.message || t('blockUserFailed'));
            return;
          }
          setProfileMenuVisible(false);
          router.back();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>{t('loading')}</Text>
      </View>
    );
  }
  if (!staff) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{t('staffProfileNotFound')}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>{t('back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const hasPhone = !!staff.phone?.trim();
  const hasEmail = !!staff.email?.trim();
  const hasWhatsApp = !!staff.whatsapp?.trim();
  const showPhone = (staff.show_phone_to_guest !== false) && hasPhone;
  const showEmail = (staff.show_email_to_guest !== false) && hasEmail;
  const showWhatsApp = (staff.show_whatsapp_to_guest !== false) && hasWhatsApp;
  const yearsExperience = staff.hire_date
    ? Math.max(0, new Date().getFullYear() - new Date(staff.hire_date).getFullYear())
    : null;
  const joinDateIso = staff.hire_date ?? staff.created_at;
  const daysWithUs = joinDateIso ? calculateDaysWithUs(joinDateIso, todayAnchor) : null;
  const tenureCopy = useMemo(
    () => ({
      title: t('tenureTitle'),
      badge: t('tenureBadge'),
      headline: t('tenureHeadline', { days: daysWithUs ?? 0 }),
      subtitle: t('tenureSubtitle'),
      timelineTitle: t('tenureTimelineTitle'),
      startLabel: t('tenureStartLabel'),
      todayLabel: t('tenureTodayLabel'),
      monthLabel: t('tenureMonthLabel'),
      close: t('tenureClose'),
    }),
    [t, i18n.language, daysWithUs]
  );
  const tenureSubtitle = staff.tenure_note?.trim() || tenureCopy.subtitle;
  const tenureTimeline = joinDateIso ? buildTenureTimeline(joinDateIso, todayAnchor) : [];
  const statItems = [
    { value: engagement.posts, label: 'Paylasim' },
    { value: engagement.likes, label: 'Begeni' },
    { value: engagement.comments, label: 'Yorum' },
    { value: engagement.visits, label: 'Ziyaret' },
  ];
  const profileVisitRestricted = !!staff.profile_visit_restricted;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { width: windowWidth, minWidth: windowWidth }]}
        showsVerticalScrollIndicator={false}
      >
      <Modal
        visible={profileMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setProfileMenuVisible(false)}
      >
        <Pressable style={styles.imageModalOverlay} onPress={() => setProfileMenuVisible(false)}>
          <View style={styles.profileMenuBox}>
            <TouchableOpacity style={styles.profileMenuItem} onPress={handleBlockFromProfile} activeOpacity={0.7}>
              <Ionicons name="ban-outline" size={20} color={theme.colors.error} />
              <Text style={styles.profileMenuItemText}>{t('block')}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <ProfileCover
        imageUri={staff.cover_image}
        height={COVER_HEIGHT}
        onPress={() => staff.cover_image && setCoverModalVisible(true)}
        disabled={!staff.cover_image}
      >
        <View style={[styles.profileTopBar, { paddingTop: safeTop + 12 }]}>
          <TouchableOpacity
            style={styles.coverActionBtn}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={24} color={theme.colors.white} />
          </TouchableOpacity>
          {!profileVisitRestricted ? (
          <TouchableOpacity
            style={styles.coverActionBtn}
            onPress={() => setProfileMenuVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={theme.colors.white} />
          </TouchableOpacity>
          ) : <View style={{ width: 40 }} />}
        </View>
      </ProfileCover>
      <View style={styles.heroOverlap}>
        {profileVisitRestricted ? (
          <View style={styles.privacyBanner}>
            <Ionicons name="eye-off-outline" size={22} color="#92400e" />
            <Text style={styles.privacyBannerText}>{t('staffProfileHiddenByAdminBanner')}</Text>
          </View>
        ) : null}
        <TouchableOpacity activeOpacity={1} onPress={() => staff.profile_image && setAvatarModalVisible(true)}>
          <AvatarWithBadge badge={staff.verification_badge ?? null} avatarSize={HEADER_AVATAR_SIZE} badgeSize={18} showBadge={false}>
            {staff.profile_image ? (
              <CachedImage uri={staff.profile_image} style={[styles.avatar, styles.avatarSmall]} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder, styles.avatarSmall]}>
                <Text style={styles.avatarLetterSmall}>{(staff.full_name || '?').charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </AvatarWithBadge>
        </TouchableOpacity>
        <View style={styles.header}>
          <StaffNameWithBadge name={staff.full_name || t('visitorTypeStaff')} badge={staff.verification_badge ?? null} badgeSize={18} textStyle={styles.name} center />
          {!profileVisitRestricted ? (
          <View style={styles.headerMetaRow}>
            <View style={styles.jobBadge}>
              <Text style={styles.jobBadgeText}>{staff.position || staff.department || '—'}</Text>
            </View>
            {!!staff.organization?.name && (
              <View style={styles.orgBadge}>
                <Ionicons name="business-outline" size={14} color="#0369a1" />
                <Text style={styles.orgBadgeText}>
                  {staff.organization.name}
                  {staff.organization.kind ? ` • ${staff.organization.kind === 'office' ? 'Ofis' : 'Otel'}` : ''}
                </Text>
              </View>
            )}
            <TouchableOpacity style={styles.reviewToggleBtn} onPress={() => setReviewsModalVisible(true)} activeOpacity={0.85}>
              <Ionicons name="star-outline" size={14} color={theme.colors.primary} />
              <Text style={styles.reviewToggleText}>Degerlendirmeler</Text>
            </TouchableOpacity>
            {!!staff.languages?.length && (
              <TouchableOpacity style={styles.langBadgeTop} onPress={() => setLanguagesModalVisible(true)} activeOpacity={0.85}>
                <Ionicons name="language-outline" size={14} color="#fff" />
                <Text style={styles.langBadgeTopText}>
                  {t('guestStaffLanguages', { count: staff.languages.length })}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          ) : null}
          <View style={styles.onlineRow}>
            <View style={[styles.dot, staff.is_online ? styles.dotOn : styles.dotOff]} />
            <Text style={styles.onlineText}>
              {staff.is_online ? t('staffStatusOnline') : t('staffStatusOffline')}
            </Text>
          </View>
        </View>
        {!profileVisitRestricted && daysWithUs != null ? (
          <TouchableOpacity activeOpacity={0.9} style={styles.tenureButtonWrap} onPress={() => setTenureModalVisible(true)}>
            <LinearGradient
              colors={['#0f766e', '#0ea5e9']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.tenureButton}
            >
              <View style={styles.tenureBadge}>
                <Ionicons name="ribbon-outline" size={14} color="#fff" />
                <Text style={styles.tenureBadgeText}>{tenureCopy.badge}</Text>
              </View>
              <Text style={styles.tenureButtonText}>{tenureCopy.headline}</Text>
              <Text style={styles.tenureButtonSubText}>{tenureSubtitle}</Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : null}
        {!profileVisitRestricted ? (
        <View style={styles.statsWrap}>
          <ProfileStatsCard items={statItems} />
        </View>
        ) : null}
        {!profileVisitRestricted ? (
        <View style={styles.headerActionsTop}>
          {showPhone && (
            <TouchableOpacity onPress={onCall} style={[styles.pillBtn, styles.pillBtnPhone]} activeOpacity={0.85}>
              <Ionicons name="call-outline" size={14} color="#fff" />
              <Text style={styles.pillBtnText}>Telefon</Text>
            </TouchableOpacity>
          )}
          {showWhatsApp && (
            <TouchableOpacity
              onPress={() => Linking.openURL(`https://wa.me/${staff.whatsapp!.trim().replace(/\D/g, '')}`)}
              style={[styles.pillBtn, styles.pillBtnWhatsApp]}
              activeOpacity={0.85}
            >
              <Ionicons name="logo-whatsapp" size={14} color="#fff" />
              <Text style={styles.pillBtnText}>WhatsApp</Text>
            </TouchableOpacity>
          )}
          {showEmail && (
            <TouchableOpacity
              onPress={() => Linking.openURL(`mailto:${staff.email!.trim()}`)}
              style={[styles.pillBtn, styles.pillBtnMail]}
              activeOpacity={0.85}
            >
              <Ionicons name="mail-outline" size={14} color="#fff" />
              <Text style={styles.pillBtnText}>Mail</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={onMessage}
            style={[styles.pillBtn, styles.pillBtnMessage]}
            disabled={startingChat}
            activeOpacity={0.85}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={14} color="#fff" />
            <Text style={styles.pillBtnText}>Mesaj</Text>
          </TouchableOpacity>
        </View>
        ) : null}
      </View>

      {!profileVisitRestricted ? (
      <>
      {staff.bio ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📝 {t('staffProfileAbout')}</Text>
          <View style={styles.card}>
            <LinkifiedText text={staff.bio} textStyle={styles.bio} linkStyle={styles.bioLink} />
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.postsPreviewCard}>
          <View style={styles.postsHeaderRow}>
            <Text style={styles.postsHeaderTitle}>{t('profileFeedPostsSection')}</Text>
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/customer/staff-posts/[id]', params: { id: staff.id } } as never)}
              activeOpacity={0.8}
              style={styles.postsSeeAllBtn}
            >
              <Text style={styles.postsSeeAllText}>Tumunu gor</Text>
            </TouchableOpacity>
          </View>
          <StaffProfileFeedGrid staffId={staff.id} linkVariant="customer" maxPreview={6} showEmptyHint={false} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📋 {t('staffProfileBasicInfo')}</Text>
        <View style={styles.quickStats}>
          {staff.department ? <StatPill label="Departman" value={staff.department} /> : null}
          {staff.position ? <StatPill label="Pozisyon" value={staff.position} /> : null}
          {yearsExperience != null ? <StatPill label="Deneyim" value={`${yearsExperience}+ yil`} /> : null}
          {staff.hire_date ? (
            <StatPill
              label={t('staffHireDateLabel')}
              value={new Date(staff.hire_date).toLocaleDateString(
                i18n.language?.startsWith('tr') ? 'tr-TR' : i18n.language || 'en-US'
              )}
            />
          ) : null}
          {staff.shift ? <StatPill label={t('staffShiftLabel')} value={`${staff.shift.start_time} - ${staff.shift.end_time}`} /> : null}
          {staff.office_location ? <StatPill label={t('staffLocationLabel')} value={staff.office_location} /> : null}
        </View>
      </View>

      {staff.specialties?.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔧 {t('staffProfileSpecialties')}</Text>
          <View style={styles.card}>
            <View style={styles.chipWrap}>
              {staff.specialties.map((s, i) => (
                <View key={i} style={styles.infoChip}>
                  <Text style={styles.infoChipText}>{s}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      ) : null}

      {staff.achievements?.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏆 {t('staffProfileAchievements')}</Text>
          <View style={styles.card}>
            {staff.achievements.map((a, i) => (
              <Text key={i} style={styles.bullet}>• {a}</Text>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.avatarActionsRow}>
        {STAFF_SOCIAL_KEYS.map((key) => {
          const raw = staff.social_links?.[key]?.trim();
          if (!raw) return null;
          const href = staffSocialOpenUrl(key as StaffSocialKey, raw);
          if (!href) return null;
          const icon =
            key === 'instagram'
              ? ('logo-instagram' as const)
              : key === 'facebook'
                ? ('logo-facebook' as const)
                : key === 'linkedin'
                  ? ('logo-linkedin' as const)
                  : ('logo-twitter' as const);
          const circleStyle =
            key === 'instagram'
              ? styles.avatarActionInstagram
              : key === 'facebook'
                ? styles.avatarActionFacebook
                : key === 'linkedin'
                  ? styles.avatarActionLinkedin
                  : styles.avatarActionX;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => Linking.openURL(href)}
              style={[styles.avatarActionCircle, circleStyle]}
              activeOpacity={0.8}
            >
              <Ionicons name={icon} size={20} color={theme.colors.white} />
            </TouchableOpacity>
          );
        })}
      </View>
      </>
      ) : null}
      <View style={styles.bottomPad} />

      <ImagePreviewModal
        visible={coverModalVisible}
        uri={staff.cover_image ?? null}
        onClose={() => setCoverModalVisible(false)}
      />
      <ImagePreviewModal
        visible={avatarModalVisible}
        uri={staff.profile_image ?? null}
        onClose={() => setAvatarModalVisible(false)}
      />

      <StaffReviewsFullModal
        visible={reviewsModalVisible}
        onClose={() => setReviewsModalVisible(false)}
        staffName={staff?.full_name || 'Personel'}
        reviews={reviews as HubReview[]}
        formatReviewDate={formatReviewDate}
        footerExtra={
          <View style={styles.reviewsModalActions}>
            {myReview ? (
              <View style={[styles.reviewsModalCloseBtn, styles.reviewsModalRateDone, { flex: 1 }]}>
                <Ionicons name="star" size={18} color={theme.colors.primary} />
                <Text style={styles.reviewsModalRateDoneText}>Puan verdiniz</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.reviewsModalCloseBtn, styles.reviewsModalRateBtn, { flex: 1 }]}
                onPress={() => {
                  setReviewsModalVisible(false);
                  openRateModal();
                }}
              >
                <Ionicons name="star-outline" size={18} color={theme.colors.white} />
                <Text style={styles.reviewsModalRateText}>Puan ver</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      <Modal
        visible={tenureModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTenureModalVisible(false)}
      >
        <Pressable style={styles.languagesOverlay} onPress={() => setTenureModalVisible(false)}>
          <Pressable style={styles.tenureModalBox} onPress={() => {}}>
            <Text style={styles.tenureModalTitle}>{tenureCopy.title}</Text>
            <Text style={styles.tenureModalSubtitle}>{tenureCopy.timelineTitle}</Text>
            <View style={styles.tenureModalList}>
              {tenureTimeline.map((d, idx) => (
                <View key={`${d.toISOString()}-${idx}`} style={styles.tenureModalRow}>
                  <Text style={styles.tenureModalRowLeft}>
                    {idx === 0 ? tenureCopy.startLabel : idx === tenureTimeline.length - 1 ? tenureCopy.todayLabel : `${idx}. ${tenureCopy.monthLabel}`}
                  </Text>
                  <Text style={styles.tenureModalRowRight}>{formatTenureDate(d, i18n.language)}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={styles.tenureModalCloseBtn} onPress={() => setTenureModalVisible(false)} activeOpacity={0.85}>
              <Text style={styles.tenureModalCloseText}>{tenureCopy.close}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={languagesModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLanguagesModalVisible(false)}
      >
        <Pressable style={styles.languagesOverlay} onPress={() => setLanguagesModalVisible(false)}>
          <Pressable style={styles.languagesModalBox} onPress={() => {}}>
            <Text style={styles.languagesModalTitle}>{t('guestStaffLanguagesTitle')}</Text>
            {(staff.languages ?? []).map((lang, idx) => (
              <Text key={`${lang}-${idx}`} style={styles.languagesModalLine}>• {lang}</Text>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={rateModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !submittingReview && setRateModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.rateModalKbRoot}
          behavior="padding"
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 8 : 0}
        >
          <View style={styles.rateModalOuter}>
            <Pressable
              style={styles.rateModalBackdrop}
              onPress={() => !submittingReview && setRateModalVisible(false)}
            />
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.rateModalScrollContent}
              bounces={false}
              nestedScrollEnabled
            >
              <Pressable onPress={() => {}}>
                <View style={styles.rateModalBox}>
                  <Text style={styles.rateModalTitle}>{t('reviewFormTitle')}</Text>
                  <Text style={styles.rateModalSubtitle}>{staff?.full_name || 'Personel'}</Text>
                  <View style={styles.starRow}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <TouchableOpacity
                        key={n}
                        onPress={() => setRateStars(n)}
                        style={styles.starBtn}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name={rateStars >= n ? 'star' : 'star-outline'}
                          size={36}
                          color={theme.colors.primary}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    style={styles.rateMetaInput}
                    placeholder={t('reviewStayRoomPlaceholder')}
                    placeholderTextColor={theme.colors.textMuted}
                    value={rateStayRoom}
                    onChangeText={setRateStayRoom}
                    editable={!submittingReview}
                  />
                  <TextInput
                    style={styles.rateMetaInput}
                    placeholder={t('reviewStayNightsPlaceholder')}
                    placeholderTextColor={theme.colors.textMuted}
                    value={rateStayNights}
                    onChangeText={setRateStayNights}
                    editable={!submittingReview}
                  />
                  <TextInput
                    style={styles.rateCommentInput}
                    placeholder={t('reviewCommentOptional')}
                    placeholderTextColor={theme.colors.textMuted}
                    value={rateComment}
                    onChangeText={setRateComment}
                    multiline
                    scrollEnabled
                    textAlignVertical="top"
                    editable={!submittingReview}
                  />
                  <View style={styles.rateModalActions}>
                    <TouchableOpacity
                      style={[styles.rateModalBtn, styles.rateModalBtnCancel]}
                      onPress={() => !submittingReview && setRateModalVisible(false)}
                      disabled={submittingReview}
                    >
                      <Text style={styles.rateModalBtnCancelText}>{t('cancelAction')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.rateModalBtn, styles.rateModalBtnSubmit]}
                      onPress={submitReview}
                      disabled={submittingReview || rateStars < 1}
                      activeOpacity={0.8}
                    >
                      {submittingReview ? (
                        <ActivityIndicator size="small" color={theme.colors.white} />
                      ) : (
                        <Text style={styles.rateModalBtnSubmitText}>{t('submit')}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      </ScrollView>
    </View>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statPillLabel}>{label}</Text>
      <Text style={styles.statPillValue}>{value}</Text>
    </View>
  );
}

function formatReviewDate(iso: string) {
  const i18n = require('@/i18n').default;
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
  const lang = (i18n.language || 'tr').split('-')[0];
  if (diff === 0) return i18n.t('relativeToday');
  if (diff === 1) return i18n.t('relativeYesterday');
  if (diff < 7) return i18n.t('relativeDaysAgo', { count: diff });
  if (diff < 30) return i18n.t('relativeWeeksAgo', { count: Math.floor(diff / 7) });
  return d.toLocaleDateString(lang === 'tr' ? 'tr-TR' : lang === 'ar' ? 'ar-SA' : 'en-US');
}

function calculateDaysWithUs(isoDate: string, anchorMs: number) {
  const joinedAt = new Date(isoDate);
  if (Number.isNaN(joinedAt.getTime())) return null;
  const anchor = new Date(anchorMs);
  const joinedDay = Date.UTC(joinedAt.getFullYear(), joinedAt.getMonth(), joinedAt.getDate());
  const anchorDay = Date.UTC(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  return Math.max(1, Math.floor((anchorDay - joinedDay) / (24 * 60 * 60 * 1000)) + 1);
}

function resolveLocale(lang: string) {
  const code = (lang || 'en').toLowerCase();
  if (code.startsWith('tr')) return 'tr-TR';
  if (code.startsWith('de')) return 'de-DE';
  if (code.startsWith('fr')) return 'fr-FR';
  if (code.startsWith('es')) return 'es-ES';
  if (code.startsWith('ru')) return 'ru-RU';
  if (code.startsWith('ar')) return 'ar-SA';
  return 'en-US';
}

function formatTenureDate(d: Date, lang: string) {
  return d.toLocaleDateString(resolveLocale(lang), { day: '2-digit', month: 'long', year: 'numeric' });
}

function buildTenureTimeline(isoDate: string, anchorMs: number) {
  const start = new Date(isoDate);
  if (Number.isNaN(start.getTime())) return [];
  const anchor = new Date(anchorMs);
  const rows: Date[] = [start];
  const cursor = new Date(start);
  let safety = 0;
  while (cursor.getTime() < anchor.getTime() && safety < 360) {
    cursor.setMonth(cursor.getMonth() + 1);
    if (cursor.getTime() <= anchor.getTime()) rows.push(new Date(cursor));
    safety += 1;
  }
  if (rows[rows.length - 1]?.toDateString() !== anchor.toDateString()) rows.push(anchor);
  return rows;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32, width: '100%', minWidth: '100%', alignItems: 'stretch' as const },
  privacyBanner: {
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fcd34d',
    gap: 8,
  },
  privacyBannerText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#78350f',
    fontWeight: '600',
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 8, fontSize: 15, color: theme.colors.textMuted },
  errorText: { fontSize: 16, color: theme.colors.text },
  backBtn: { marginTop: 16, paddingVertical: 12, paddingHorizontal: 24, backgroundColor: theme.colors.primary, borderRadius: 12 },
  backBtnText: { color: theme.colors.white, fontWeight: '600' },
  profileTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 0,
    zIndex: 40,
    elevation: 20,
  },
  coverActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 20,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  heroOverlap: {
    marginTop: -(HEADER_AVATAR_SIZE / 2),
    marginHorizontal: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 4,
    borderColor: theme.colors.surface,
    backgroundColor: theme.colors.borderLight,
    shadowOpacity: 0.2,
    elevation: 6,
  },
  avatarSmall: { width: HEADER_AVATAR_SIZE, height: HEADER_AVATAR_SIZE, borderRadius: HEADER_AVATAR_SIZE / 2, borderWidth: 2 },
  avatarPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  avatarLetterSmall: { fontSize: 24, fontWeight: '700', color: theme.colors.primary },
  header: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 0 },
  name: { ...theme.typography.title, fontSize: 24, color: theme.colors.text, textAlign: 'center' },
  dept: { fontSize: 16, fontWeight: '600', color: theme.colors.primary, marginTop: 4 },
  headerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' },
  jobBadge: {
    backgroundColor: theme.colors.primary + '18',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.colors.primary + '35',
  },
  jobBadgeText: { fontSize: 12, fontWeight: '700', color: theme.colors.primary },
  orgBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#7dd3fc',
    backgroundColor: '#e0f2fe',
  },
  orgBadgeText: { fontSize: 12, fontWeight: '700', color: '#0369a1' },
  reviewToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  reviewToggleText: { fontSize: 12, fontWeight: '700', color: theme.colors.primary },
  langBadgeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#2563eb',
  },
  langBadgeTopText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  onlineRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  dotOn: { backgroundColor: theme.colors.success },
  dotOff: { backgroundColor: theme.colors.textMuted },
  onlineText: { fontSize: 13, color: theme.colors.textMuted },
  statsWrap: { width: '100%', marginTop: 10 },
  tenureButtonWrap: { width: '100%', marginTop: 10, borderRadius: 16, overflow: 'hidden' },
  tenureButton: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    shadowColor: '#0f766e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 4,
  },
  tenureBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 6,
  },
  tenureBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  tenureButtonText: { color: '#fff', fontSize: 17, fontWeight: '900' },
  tenureButtonSubText: { marginTop: 2, color: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: '600' },
  headerActionsTop: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  pillBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  pillBtnPhone: { backgroundColor: '#2563eb' },
  pillBtnWhatsApp: { backgroundColor: '#16a34a' },
  pillBtnMail: { backgroundColor: '#7c3aed' },
  pillBtnMessage: { backgroundColor: '#0ea5e9' },
  section: { paddingHorizontal: theme.spacing.lg, marginTop: theme.spacing.lg },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  quickStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statPill: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: '48%',
  },
  statPillLabel: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statPillValue: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: 2,
  },
  evaluatePrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    ...theme.shadows.sm,
  },
  evaluatePrimaryBtnText: { color: theme.colors.white, fontSize: 16, fontWeight: '800' },
  evaluateDoneBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: theme.colors.success + '22',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.success + '55',
  },
  evaluateDoneText: { flex: 1, fontSize: 14, fontWeight: '600', color: theme.colors.text },
  rateMetaInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 10,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: theme.spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  postsNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: theme.spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  postsNavText: { flex: 1, fontSize: 17, fontWeight: '600', color: theme.colors.text },
  postsPreviewCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: theme.spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  postsHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  postsHeaderTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  postsSeeAllBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.primary + '18',
  },
  postsSeeAllText: { color: theme.colors.primary, fontWeight: '700', fontSize: 12 },
  bullet: { fontSize: 14, color: theme.colors.text, marginBottom: 4 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  infoChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  infoChipText: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  bio: { fontSize: 14, color: theme.colors.text, lineHeight: 22 },
  bioLink: { color: theme.colors.primary, fontWeight: '600' },
  rating: { fontSize: 14, color: theme.colors.primary, fontWeight: '600' },
  reviewCard: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.borderLight },
  reviewMeta: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 4 },
  reviewStars: { color: theme.colors.primary, marginBottom: 4 },
  reviewComment: { fontSize: 13, color: theme.colors.text, fontStyle: 'italic' },
  reviewsTapHint: { fontSize: 12, color: theme.colors.primary, marginTop: 4 },
  reviewsMore: { fontSize: 12, color: theme.colors.textMuted, marginTop: 8, textAlign: 'center' },
  avatarActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    marginTop: 8,
  },
  avatarActionCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarActionPhone: { backgroundColor: theme.colors.primary },
  avatarActionWhatsApp: { backgroundColor: '#25D366' },
  avatarActionMail: { backgroundColor: theme.colors.accent },
  avatarActionInstagram: { backgroundColor: '#E4405F' },
  avatarActionFacebook: { backgroundColor: '#1877F2' },
  avatarActionLinkedin: { backgroundColor: '#0A66C2' },
  avatarActionX: { backgroundColor: '#0f1419' },
  avatarActionMessage: { backgroundColor: theme.colors.primary },
  bottomPad: { height: 32 },
  reviewsModalRateDone: { flex: 1, paddingVertical: 12, borderRadius: theme.radius.md, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, backgroundColor: theme.colors.borderLight },
  reviewsModalRateDoneText: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  reviewsModalBox: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '80%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    ...theme.shadows.lg,
  },
  reviewsModalTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 4 },
  reviewsModalSubtitle: { fontSize: 13, color: theme.colors.textMuted, marginBottom: theme.spacing.md },
  reviewsModalList: { maxHeight: 320, marginBottom: theme.spacing.md },
  reviewsModalEmpty: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', paddingVertical: 24 },
  reviewsModalItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  reviewsModalItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  reviewsModalItemStars: { fontSize: 16, color: theme.colors.primary },
  reviewsModalItemDate: { fontSize: 12, color: theme.colors.textMuted },
  reviewsModalItemMeta: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 4 },
  reviewsModalItemComment: { fontSize: 14, color: theme.colors.text, fontStyle: 'italic' },
  reviewsModalItemNoComment: { fontSize: 13, color: theme.colors.textMuted, fontStyle: 'italic' },
  reviewsModalActions: { flexDirection: 'row', gap: 12 },
  reviewsModalCloseBtn: { flex: 1, paddingVertical: 12, borderRadius: theme.radius.md, alignItems: 'center', backgroundColor: theme.colors.borderLight },
  reviewsModalCloseText: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  reviewsModalRateBtn: { backgroundColor: theme.colors.primary },
  reviewsModalRateText: { fontSize: 15, fontWeight: '600', color: theme.colors.white },
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalContent: { maxWidth: '100%', maxHeight: '90%', justifyContent: 'center', alignItems: 'center' },
  imageModalImage: { width: '100%', height: 280, maxWidth: '100%' },
  profileMenuBox: {
    marginTop: 80,
    marginLeft: 'auto',
    marginRight: 24,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    minWidth: 160,
    paddingVertical: 8,
  },
  profileMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  profileMenuItemText: { color: theme.colors.error, fontSize: 15, fontWeight: '600' },
  rateModalKbRoot: { flex: 1 },
  rateModalOuter: { flex: 1, justifyContent: 'flex-end' },
  rateModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  rateModalScrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  rateModalBox: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    marginBottom: 8,
    ...theme.shadows.lg,
  },
  rateModalTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.text, marginBottom: 4 },
  rateModalSubtitle: { fontSize: 14, color: theme.colors.textMuted, marginBottom: theme.spacing.lg },
  starRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: theme.spacing.lg },
  starBtn: { padding: 4 },
  rateCommentInput: {
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.colors.text,
    minHeight: 100,
    maxHeight: 160,
    textAlignVertical: 'top',
    marginBottom: theme.spacing.lg,
  },
  rateModalActions: { flexDirection: 'row', gap: 12 },
  rateModalBtn: { flex: 1, paddingVertical: 14, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  rateModalBtnCancel: { backgroundColor: theme.colors.borderLight },
  rateModalBtnCancelText: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  rateModalBtnSubmit: { backgroundColor: theme.colors.primary },
  rateModalBtnSubmitText: { fontSize: 15, fontWeight: '600', color: theme.colors.white },
  languagesModalBox: {
    width: '86%',
    maxWidth: 360,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 12,
  },
  languagesOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  languagesModalTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text, marginBottom: 10 },
  languagesModalLine: { fontSize: 14, color: theme.colors.text, marginBottom: 6 },
  tenureModalBox: {
    width: '90%',
    maxWidth: 420,
    maxHeight: '78%',
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 16,
  },
  tenureModalTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  tenureModalSubtitle: { marginTop: 4, fontSize: 12, color: theme.colors.textMuted, marginBottom: 12 },
  tenureModalList: { borderWidth: 1, borderColor: theme.colors.borderLight, borderRadius: 12, overflow: 'hidden' },
  tenureModalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  tenureModalRowLeft: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  tenureModalRowRight: { fontSize: 13, color: theme.colors.textSecondary },
  tenureModalCloseBtn: {
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    paddingVertical: 11,
    alignItems: 'center',
  },
  tenureModalCloseText: { color: theme.colors.white, fontSize: 14, fontWeight: '700' },
});
