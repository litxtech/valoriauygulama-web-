import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
  Modal,
  Pressable,
  Linking,
  StatusBar,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useNavigation, usePathname, useRouter } from 'expo-router';
import { navigateStaffBack, STAFF_TABS_FALLBACK } from '@/lib/staffStackBack';
import type { HubReview } from '@/components/StaffEvaluationHub';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { staffGetOrCreateDirectConversation } from '@/lib/messagingApi';
import { theme } from '@/constants/theme';
import { StaffNameWithBadge, AvatarWithBadge } from '@/components/VerifiedBadge';
import { CachedImage } from '@/components/CachedImage';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { blockUserForStaff, getHiddenUsersForStaff } from '@/lib/userBlocks';
import { StaffReviewsFullModal } from '@/components/StaffEvaluationHub';
import { loadStaffProfileForViewer } from '@/lib/loadStaffProfileForViewer';
import { loadStaffProfileReviews } from '@/lib/loadStaffProfileReviews';
import {
  buildRestrictedStaffProfileView,
  shouldRestrictStaffProfileView,
} from '@/lib/staffProfilePrivacy';
import { recordStaffProfileVisit } from '@/lib/staffProfileVisits';
import { readStaffProfileViewCache, writeStaffProfileViewCache } from '@/lib/staffProfileViewCache';
import { LinkifiedText } from '@/components/LinkifiedText';
import { useTranslation } from 'react-i18next';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';
import { StaffProfileFeedGrid } from '@/components/StaffProfileFeedGrid';
import { ProfileStatsCard } from '@/components/ProfileStatsCard';
import { loadStaffEngagementStats, type StaffEngagementStats } from '@/lib/staffEngagementStats';
import { ProfileCover } from '@/components/ProfileCover';
import { formatLocaleDateShort } from '@/lib/date';
import { getDepartmentLabel } from '@/lib/departmentLabels';

const COVER_HEIGHT = 260;
const AVATAR_SIZE = 116;
const HEADER_AVATAR_SIZE = 64;

type StaffProfile = {
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
  verification_badge?: 'blue' | 'yellow' | null;
  shift?: { start_time: string; end_time: string } | null;
  role?: string | null;
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  show_phone_to_guest?: boolean | null;
  show_email_to_guest?: boolean | null;
  show_whatsapp_to_guest?: boolean | null;
  evaluation_score?: number | null;
  evaluation_discipline?: number | null;
  evaluation_communication?: number | null;
  evaluation_speed?: number | null;
  evaluation_responsibility?: number | null;
  evaluation_insight?: string | null;
  organization?: { name: string | null; kind: string | null } | null;
  profile_hidden_by_admin?: boolean | null;
};

function formatReviewDateShort(iso: string) {
  return formatLocaleDateShort(iso);
}

export default function StaffProfileViewScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : undefined;
  const router = useRouter();
  const navigation = useNavigation();
  const pathname = usePathname();
  const leaveProfile = () => navigateStaffBack(router, navigation, pathname, STAFF_TABS_FALLBACK);
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const { staff: me } = useAuthStore();
  const safeTop = Math.max(insets.top, StatusBar.currentHeight ?? 0);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [reviews, setReviews] = useState<HubReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [coverModalVisible, setCoverModalVisible] = useState(false);
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);
  const [complaintModalVisible, setComplaintModalVisible] = useState(false);
  const [complaintNote, setComplaintNote] = useState('');
  const [submittingComplaint, setSubmittingComplaint] = useState(false);
  const [reviewsModalVisible, setReviewsModalVisible] = useState(false);
  const [languagesModalVisible, setLanguagesModalVisible] = useState(false);
  const [tenureModalVisible, setTenureModalVisible] = useState(false);
  const [engagement, setEngagement] = useState<StaffEngagementStats>({ posts: 0, likes: 0, comments: 0, visits: 0 });
  const [todayAnchor, setTodayAnchor] = useState(() => Date.now());

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    const loadSecondary = async (staffId: string, restricted: boolean, baseProfile: StaffProfile) => {
      if (restricted) {
        if (!cancelled) {
          setReviews([]);
          setEngagement({ posts: 0, likes: 0, comments: 0, visits: 0 });
        }
        void writeStaffProfileViewCache('staff', staffId, {
          profile: baseProfile,
          reviews: [],
          engagement: { posts: 0, likes: 0, comments: 0, visits: 0 },
        });
        return;
      }
      const [nextReviews, nextEngagement] = await Promise.all([
        loadStaffProfileReviews(staffId, 80),
        loadStaffEngagementStats(staffId).catch(() => ({
          posts: 0,
          likes: 0,
          comments: 0,
          visits: 0,
        })),
      ]);
      if (cancelled) return;
      setReviews(nextReviews);
      setEngagement(nextEngagement);
      void writeStaffProfileViewCache('staff', staffId, {
        profile: baseProfile,
        reviews: nextReviews,
        engagement: nextEngagement,
      });
    };

    (async () => {
      const cached = await readStaffProfileViewCache<StaffProfile>('staff', id);
      if (cancelled) return;
      if (cached?.profile) {
        setProfile(cached.profile);
        if (cached.reviews) setReviews(cached.reviews);
        if (cached.engagement) setEngagement(cached.engagement);
        setLoading(false);
      }

      if (me?.id && me.id !== id) {
        const hidden = await getHiddenUsersForStaff(me.id);
        if (cancelled) return;
        if (hidden.hiddenStaffIds.has(id)) {
          setProfile(null);
          setLoading(false);
          return;
        }
      }

      const { data, error } = await loadStaffProfileForViewer(id);
      if (cancelled) return;
      if (error || !data) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const rawHidden = !!(data as { profile_hidden_by_admin?: boolean }).profile_hidden_by_admin;
      const restricted = shouldRestrictStaffProfileView({
        profileHiddenByAdmin: rawHidden,
        viewerStaffId: me?.id,
        viewerRole: me?.role,
        targetStaffId: id,
      });
      let s = { ...data, shift: (cached?.profile as StaffProfile | undefined)?.shift ?? null } as StaffProfile;
      if (restricted) {
        s = buildRestrictedStaffProfileView(s);
      }
      setProfile(s);
      setLoading(false);

      if (me?.id && me.id !== id) {
        recordStaffProfileVisit(id).catch(() => {});
      }

      if (!restricted && data.shift_id) {
        void supabase
          .from('shifts')
          .select('start_time, end_time')
          .eq('id', data.shift_id)
          .single()
          .then(({ data: shift }) => {
            if (cancelled) return;
            setProfile((prev) => {
              if (!prev || prev.id !== id) return prev;
              const next = { ...prev, shift: shift ?? null };
              void writeStaffProfileViewCache('staff', id, {
                profile: next,
                reviews: cached?.reviews,
                engagement: cached?.engagement,
              });
              return next;
            });
          });
      }

      void loadSecondary(id, restricted, s);
    })();

    return () => {
      cancelled = true;
    };
  }, [id, me?.id, me?.role]);

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

  const [openingChat, setOpeningChat] = useState(false);
  const openChat = async () => {
    if (!id || !me?.id) return;
    setOpeningChat(true);
    try {
      const convId = await staffGetOrCreateDirectConversation(me.id, id, 'staff');
      if (convId) router.push({ pathname: '/staff/chat/[id]', params: { id: convId } });
      else Alert.alert(t('error'), t('messageSendFailedTitle'));
    } catch {
      Alert.alert(t('error'), t('messageSendFailedTitle'));
    }
    setOpeningChat(false);
  };

  const handleBlockFromProfile = () => {
    if (!id || !me?.id || me.id === id) return;
    Alert.alert(t('blockUserTitle'), t('blockUserMessage', { name: profile?.full_name?.trim() || t('thisUser') }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('block'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await blockUserForStaff({
            blockerStaffId: me.id,
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

  const submitStaffComplaint = async () => {
    if (!me?.id || !id) return;
    const note = complaintNote.trim();
    if (!note) {
      Alert.alert(t('warning'), t('required'));
      return;
    }
    if (me.id === id) {
      Alert.alert(t('warning'), t('cannotBlockSelf'));
      return;
    }
    setSubmittingComplaint(true);
    const { error } = await supabase.from('staff_internal_complaints').insert({
      organization_id: me.organization_id,
      complainant_staff_id: me.id,
      complained_staff_id: id,
      note,
    });
    setSubmittingComplaint(false);
    if (error) {
      Alert.alert(t('error'), error.message);
      return;
    }
    setComplaintModalVisible(false);
    setProfileMenuVisible(false);
    setComplaintNote('');
    Alert.alert(t('sent'), t('internalComplaintSentBody'));
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }
  if (!profile) {
    return (
      <View style={styles.centered}>
        <Ionicons name="person-outline" size={64} color={theme.colors.textMuted} />
        <Text style={styles.errorText}>Profil bulunamadı</Text>
        <TouchableOpacity style={styles.backBtn} onPress={leaveProfile} activeOpacity={0.8}>
          <Text style={styles.backBtnText}>Geri</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const avatarUri = profile.profile_image || undefined;
  const isMe = me?.id === profile.id;
  const yearsExperience = profile.hire_date
    ? Math.max(0, new Date().getFullYear() - new Date(profile.hire_date).getFullYear())
    : null;
  const joinDateIso = profile.hire_date ?? profile.created_at;
  const daysWithUs = joinDateIso ? calculateDaysWithUs(joinDateIso, todayAnchor) : null;
  const tenureCopy = getTenureCopy(i18n.language, daysWithUs ?? 0);
  const tenureSubtitle = profile.tenure_note?.trim() || tenureCopy.subtitle;
  const tenureTimeline = joinDateIso ? buildTenureTimeline(joinDateIso, todayAnchor) : [];
  const statItems = [
    { value: engagement.posts, label: 'Paylasim' },
    { value: engagement.likes, label: 'Begeni' },
    { value: engagement.comments, label: 'Yorum' },
    { value: engagement.visits, label: 'Ziyaret' },
  ];
  const profileRestricted = shouldRestrictStaffProfileView({
    profileHiddenByAdmin: !!profile.profile_hidden_by_admin,
    viewerStaffId: me?.id,
    viewerRole: me?.role,
    targetStaffId: profile.id,
  });

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { width: windowWidth, minWidth: windowWidth }]}
        showsVerticalScrollIndicator={false}
      >
      <ProfileCover
        imageUri={profile.cover_image}
        height={COVER_HEIGHT}
        onPress={() => profile.cover_image && setCoverModalVisible(true)}
        disabled={!profile.cover_image}
      >
        <View style={[styles.profileTopBar, { paddingTop: safeTop - 6 }]}>
          <TouchableOpacity
            style={styles.coverActionBtn}
            onPress={leaveProfile}
            activeOpacity={0.7}
            accessibilityLabel="Geri"
          >
            <Ionicons name="chevron-back" size={24} color={theme.colors.white} />
          </TouchableOpacity>
          {!isMe && !profileRestricted ? (
            <TouchableOpacity
              style={styles.coverActionBtn}
              onPress={() => setProfileMenuVisible(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={theme.colors.white} />
            </TouchableOpacity>
          ) : <View style={styles.coverActionGhost} />}
        </View>
      </ProfileCover>
      <View style={styles.heroOverlap}>
        {profileRestricted ? (
          <View style={styles.privacyBanner}>
            <Ionicons name="eye-off-outline" size={22} color="#92400e" />
            <Text style={styles.privacyBannerText}>{t('staffProfileHiddenByAdminBanner')}</Text>
          </View>
        ) : null}
        <TouchableOpacity activeOpacity={1} onPress={() => avatarUri && setAvatarModalVisible(true)}>
          <AvatarWithBadge badge={profile.verification_badge ?? null} avatarSize={HEADER_AVATAR_SIZE} badgeSize={18} showBadge={false}>
            {avatarUri ? (
              <CachedImage uri={avatarUri} style={[styles.avatar, styles.avatarSmall]} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder, styles.avatarSmall]}>
                <Text style={styles.avatarLetterSmall}>{(profile.full_name || '?').charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </AvatarWithBadge>
        </TouchableOpacity>
        <View style={styles.nameBlock}>
          <StaffNameWithBadge name={profile.full_name || '—'} badge={profile.verification_badge ?? null} badgeSize={18} textStyle={styles.name} center />
          {!profileRestricted ? (
          <View style={styles.headerMetaRow}>
            <View style={styles.jobBadge}>
              <Text style={styles.jobBadgeText}>{getDepartmentLabel(profile.position || profile.department)}</Text>
            </View>
            {!!profile.organization?.name && (
              <View style={styles.orgBadge}>
                <Ionicons name="business-outline" size={14} color="#0369a1" />
                <Text style={styles.orgBadgeText}>
                  {profile.organization.name}
                  {profile.organization.kind ? ` • ${profile.organization.kind === 'office' ? 'Ofis' : 'Otel'}` : ''}
                </Text>
              </View>
            )}
            <TouchableOpacity style={styles.reviewToggleBtn} onPress={() => setReviewsModalVisible(true)} activeOpacity={0.85}>
              <Ionicons name="star-outline" size={14} color={theme.colors.primary} />
              <Text style={styles.reviewToggleText}>Degerlendirmeler</Text>
            </TouchableOpacity>
            {!!profile.languages?.length && (
              <TouchableOpacity style={styles.langBadgeTop} onPress={() => setLanguagesModalVisible(true)} activeOpacity={0.85}>
                <Ionicons name="language-outline" size={14} color="#fff" />
                <Text style={styles.langBadgeTopText}>Diller ({profile.languages.length})</Text>
              </TouchableOpacity>
            )}
          </View>
          ) : null}
        </View>
        {!profileRestricted && daysWithUs != null ? (
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
        {!profileRestricted ? (
        <View style={styles.statsWrap}>
          <ProfileStatsCard items={statItems} />
        </View>
        ) : null}
        {!isMe && !profileRestricted && (
          <View style={styles.headerActionsTop}>
            {!!profile.phone?.trim() && (
              <TouchableOpacity
                onPress={() => profile.phone && Linking.openURL(`tel:${profile.phone.trim()}`)}
                style={[styles.pillBtn, styles.pillBtnPhone]}
                activeOpacity={0.85}
              >
                <Ionicons name="call-outline" size={14} color="#fff" />
                <Text style={styles.pillBtnText}>Telefon</Text>
              </TouchableOpacity>
            )}
            {!!profile.whatsapp?.trim() && (
              <TouchableOpacity
                onPress={() =>
                  profile.whatsapp &&
                  Linking.openURL(`https://wa.me/${profile.whatsapp.trim().replace(/\D/g, '')}`)
                }
                style={[styles.pillBtn, styles.pillBtnWhatsApp]}
                activeOpacity={0.85}
              >
                <Ionicons name="logo-whatsapp" size={14} color="#fff" />
                <Text style={styles.pillBtnText}>WhatsApp</Text>
              </TouchableOpacity>
            )}
            {!!profile.email?.trim() && (
              <TouchableOpacity
                onPress={() => profile.email && Linking.openURL(`mailto:${profile.email.trim()}`)}
                style={[styles.pillBtn, styles.pillBtnMail]}
                activeOpacity={0.85}
              >
                <Ionicons name="mail-outline" size={14} color="#fff" />
                <Text style={styles.pillBtnText}>Mail</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={openChat}
              style={[styles.pillBtn, styles.pillBtnMessage]}
              disabled={openingChat}
              activeOpacity={0.85}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={14} color="#fff" />
              <Text style={styles.pillBtnText}>Mesaj</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      <View style={styles.body}>
        {!profileRestricted ? (
        <View>
        <View style={styles.quickStats}>
          {profile.department ? <StatPill label="Departman" value={getDepartmentLabel(profile.department)} /> : null}
          {profile.position ? <StatPill label="Pozisyon" value={getDepartmentLabel(profile.position)} /> : null}
          {yearsExperience != null ? <StatPill label="Deneyim" value={`${yearsExperience}+ yil`} /> : null}
          {profile.hire_date ? (
            <StatPill
              label={t('staffProfileHireDate')}
              value={formatLocaleDateShort(profile.hire_date)}
            />
          ) : null}
          {profile.office_location ? <StatPill label="Lokasyon" value={profile.office_location} /> : null}
          {profile.shift ? (
            <StatPill label="Vardiya" value={`${profile.shift.start_time} - ${profile.shift.end_time}`} />
          ) : null}
        </View>

        {profile.bio ? (
          <View style={styles.bioBlock}>
            <Text style={styles.bioLabel}>Hakkında</Text>
            <LinkifiedText text={profile.bio} textStyle={styles.bio} linkStyle={styles.bioLink} />
          </View>
        ) : null}

        <View style={styles.postsPreviewCard}>
          <View style={styles.postsHeaderRow}>
            <Text style={styles.postsHeaderTitle}>{t('profileFeedPostsSection')}</Text>
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/staff/staff-posts/[id]', params: { id: profile.id } } as never)}
              activeOpacity={0.8}
              style={styles.postsSeeAllBtn}
            >
              <Text style={styles.postsSeeAllText}>Tumunu gor</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sectionSpacer} />

        {profile.specialties?.length ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Uzmanlıklar</Text>
            <View style={styles.chipWrap}>
              {profile.specialties.map((s, i) => (
                <View key={i} style={styles.infoChip}>
                  <Text style={styles.infoChipText}>{s}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {profile.achievements?.length ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Başarılar</Text>
            {profile.achievements.map((a, i) => (
              <Text key={i} style={styles.bullet}>• {a}</Text>
            ))}
          </View>
        ) : null}

        {!isMe && <View style={styles.sectionSpacer} />}
        {isMe && (
          <TouchableOpacity
            style={styles.chatBtn}
            onPress={() => router.replace('/staff/(tabs)/profile')}
            activeOpacity={0.8}
          >
            <Ionicons name="person" size={22} color={theme.colors.white} />
            <Text style={styles.chatBtnText}>Profilimi düzenle</Text>
          </TouchableOpacity>
        )}
        </View>
        ) : null}

        {profile.is_online != null && (
          <View style={styles.onlineRow}>
            <View style={[styles.onlineDot, profile.is_online && styles.onlineDotOn]} />
            <Text style={styles.onlineText}>
              {profile.is_online ? t('staffProfileOnlineChip') : t('staffProfileOfflineChip')}
            </Text>
          </View>
        )}
      </View>

      {!profileRestricted && (
        <View style={styles.igGridSection}>
          <View style={styles.igGridTabBar}>
            <Ionicons name="grid-outline" size={22} color={theme.colors.text} />
          </View>
          <StaffProfileFeedGrid
            staffId={profile.id}
            linkVariant="staff"
            showEmptyHint={false}
            allowOwnPostDelete={isMe}
            viewerStaffId={me?.id ?? null}
            edgeToEdge
          />
        </View>
      )}

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
              <Text style={styles.profileMenuText}>Engelle</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.profileMenuItem}
              onPress={() => {
                setProfileMenuVisible(false);
                setComplaintModalVisible(true);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="alert-circle-outline" size={20} color="#b45309" />
              <Text style={[styles.profileMenuText, { color: '#b45309' }]}>Personeli şikayet et</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={complaintModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setComplaintModalVisible(false)}
      >
        <Pressable style={styles.imageModalOverlay} onPress={() => setComplaintModalVisible(false)}>
          <Pressable style={styles.complaintBox} onPress={() => {}}>
            <Text style={styles.complaintTitle}>Personel Şikayet Notu</Text>
            <Text style={styles.complaintHint}>
              Bu not yalnızca otel sorumlusu tarafından görülür. Yapılan işlemler size ayrıca yansıtılmaz.
            </Text>
            <TextInput
              style={styles.complaintInput}
              value={complaintNote}
              onChangeText={setComplaintNote}
              placeholder="Durumu kısa ve net şekilde yazın..."
              placeholderTextColor={theme.colors.textMuted}
              multiline
            />
            <View style={styles.complaintActions}>
              <TouchableOpacity style={styles.complaintBtnGhost} onPress={() => setComplaintModalVisible(false)}>
                <Text style={styles.complaintBtnGhostText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.complaintBtn} onPress={submitStaffComplaint} disabled={submittingComplaint}>
                <Text style={styles.complaintBtnText}>{submittingComplaint ? 'Gönderiliyor...' : 'Şikayeti Gönder'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ImagePreviewModal
        visible={coverModalVisible}
        uri={profile.cover_image ?? null}
        onClose={() => setCoverModalVisible(false)}
      />
      <ImagePreviewModal
        visible={avatarModalVisible}
        uri={profile.profile_image ?? null}
        onClose={() => setAvatarModalVisible(false)}
      />

      </ScrollView>

      <StaffReviewsFullModal
        visible={reviewsModalVisible}
        onClose={() => setReviewsModalVisible(false)}
        staffName={profile.full_name || '—'}
        reviews={reviews}
        formatReviewDate={formatReviewDateShort}
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
            <Text style={styles.languagesModalTitle}>Konusulan Diller</Text>
            {(profile.languages ?? []).map((lang, idx) => (
              <Text key={`${lang}-${idx}`} style={styles.languagesModalLine}>• {lang}</Text>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
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

function getTenureCopy(lang: string, days: number) {
  const code = (lang || 'en').toLowerCase();
  if (code.startsWith('tr')) {
    return {
      title: 'Çalışma Kıdem Bilgisi',
      badge: 'Kıdem',
      headline: `${days}. gündeyiz`,
      subtitle: 'Valoria ekibindeki aktif çalışma süresi',
      timelineTitle: 'Başlangıç tarihinden bugüne aylık zaman çizelgesi',
      startLabel: 'Başlangıç',
      todayLabel: 'Bugün',
      monthLabel: 'ay',
      close: 'Kapat',
    };
  }
  if (code.startsWith('de')) return { title: 'Betriebszugehörigkeit', badge: 'Dauer', headline: `Tag ${days}`, subtitle: 'Aktive Betriebszugehörigkeit bei Valoria', timelineTitle: 'Monatliche Zeitleiste seit dem Startdatum', startLabel: 'Start', todayLabel: 'Heute', monthLabel: 'Monat', close: 'Schließen' };
  if (code.startsWith('fr')) return { title: "Ancienneté de l'équipe", badge: 'Ancienneté', headline: `Jour ${days}`, subtitle: "Durée active au sein de Valoria", timelineTitle: 'Chronologie mensuelle depuis la date de début', startLabel: 'Début', todayLabel: "Aujourd'hui", monthLabel: 'mois', close: 'Fermer' };
  if (code.startsWith('es')) return { title: 'Antigüedad laboral', badge: 'Antigüedad', headline: `Día ${days}`, subtitle: 'Tiempo activo en Valoria', timelineTitle: 'Cronología mensual desde la fecha de inicio', startLabel: 'Inicio', todayLabel: 'Hoy', monthLabel: 'mes', close: 'Cerrar' };
  if (code.startsWith('ru')) return { title: 'Стаж работы', badge: 'Стаж', headline: `${days}-й день`, subtitle: 'Активный срок работы в Valoria', timelineTitle: 'Помесячная шкала с даты начала', startLabel: 'Начало', todayLabel: 'Сегодня', monthLabel: 'месяц', close: 'Закрыть' };
  if (code.startsWith('ar')) return { title: 'مدة الخدمة', badge: 'الخبرة', headline: `اليوم ${days}`, subtitle: 'مدة العمل الفعلي ضمن Valoria', timelineTitle: 'جدول زمني شهري منذ تاريخ البداية', startLabel: 'البداية', todayLabel: 'اليوم', monthLabel: 'شهر', close: 'إغلاق' };
  return {
    title: 'Employment Tenure',
    badge: 'Tenure',
    headline: `Day ${days}`,
    subtitle: 'Active employment period in Valoria',
    timelineTitle: 'Monthly timeline since start date',
    startLabel: 'Start',
    todayLabel: 'Today',
    monthLabel: 'month',
    close: 'Close',
  };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 0, width: '100%', minWidth: '100%', alignItems: 'stretch' as const },
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  loadingText: { marginTop: 12, fontSize: 15, color: theme.colors.textMuted },
  errorText: { marginTop: 12, fontSize: 16, color: theme.colors.text },
  backBtn: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
  },
  backBtnText: { color: theme.colors.white, fontWeight: '600', fontSize: 15 },
  profileTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
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
  coverActionGhost: { width: 40, height: 40 },
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
    ...theme.shadows.md,
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
  avatarPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  avatarSmall: { width: HEADER_AVATAR_SIZE, height: HEADER_AVATAR_SIZE, borderRadius: HEADER_AVATAR_SIZE / 2, borderWidth: 2 },
  avatarLetter: { fontSize: 36, fontWeight: '700', color: theme.colors.primary },
  avatarLetterSmall: { fontSize: 24, fontWeight: '700', color: theme.colors.primary },
  body: {
    padding: theme.spacing.xl,
    backgroundColor: theme.colors.surface,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 20,
    borderWidth: 0,
    ...theme.shadows.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  nameBlock: { alignItems: 'center', marginBottom: 4 },
  name: { ...theme.typography.title, fontSize: 24, color: theme.colors.text, textAlign: 'center', marginBottom: 6 },
  dept: { fontSize: 16, fontWeight: '600', color: theme.colors.primary, textAlign: 'center', marginBottom: 8 },
  headerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap', justifyContent: 'center' },
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
  infoRow: { marginTop: 8 },
  quickStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    marginBottom: 4,
  },
  statPill: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: '48%',
  },
  statPillLabel: { fontSize: 11, color: theme.colors.textMuted, fontWeight: '700', textTransform: 'uppercase' },
  statPillValue: { fontSize: 13, color: theme.colors.text, fontWeight: '700', marginTop: 2 },
  onlineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, gap: 6 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.textMuted },
  onlineDotOn: { backgroundColor: theme.colors.success },
  onlineText: { fontSize: 13, color: theme.colors.textMuted },
  block: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.borderLight },
  blockTitle: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted, marginBottom: 8 },
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
  infoChipText: { fontSize: 13, color: theme.colors.text, fontWeight: '600' },
  bioBlock: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.borderLight },
  bioLabel: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted, marginBottom: 6 },
  bio: { fontSize: 15, lineHeight: 22, color: theme.colors.text },
  bioLink: { color: theme.colors.primary, fontWeight: '600', textDecorationLine: 'underline' },
  sectionSpacer: { height: 4 },
  postsLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 2,
  },
  postsLinkText: { flex: 1, fontSize: 16, fontWeight: '600', color: theme.colors.text },
  postsPreviewCard: {
    marginTop: 16,
    padding: 12,
    borderRadius: 14,
    backgroundColor: theme.colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  postsHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  postsHeaderTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  postsSeeAllBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.primary + '18',
  },
  postsSeeAllText: { color: theme.colors.primary, fontWeight: '700', fontSize: 12 },
  igGridSection: {
    marginTop: 16,
    backgroundColor: 'transparent',
  },
  igGridTabBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderLight,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  reviewCard: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.borderLight },
  reviewStars: { color: theme.colors.primary, marginBottom: 4 },
  reviewComment: { fontSize: 13, color: theme.colors.text },
  avatarActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 20,
    marginBottom: 8,
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
  chatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
  },
  chatBtnText: { color: theme.colors.white, fontSize: 16, fontWeight: '600' },
  chatBtnDisabled: { opacity: 0.7 },
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
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
  profileMenuText: { color: theme.colors.error, fontSize: 15, fontWeight: '600' },
  complaintBox: {
    width: '90%',
    maxWidth: 420,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 14,
  },
  complaintTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  complaintHint: { marginTop: 6, fontSize: 12, lineHeight: 18, color: theme.colors.textSecondary },
  complaintInput: {
    marginTop: 10,
    minHeight: 110,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: theme.colors.text,
    textAlignVertical: 'top',
  },
  complaintActions: { marginTop: 12, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  complaintBtnGhost: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  complaintBtnGhostText: { color: theme.colors.textSecondary, fontWeight: '700' },
  complaintBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#b45309',
  },
  complaintBtnText: { color: '#fff', fontWeight: '700' },
  imageModalContent: { flex: 1, width: '100%', justifyContent: 'center' },
  imageModalImage: { width: '100%', height: '100%' },
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
