import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Switch,
  Alert,
  Modal,
  Pressable,
  Dimensions,
  useWindowDimensions,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { AvatarWithBadge, StaffNameWithBadge } from '@/components/VerifiedBadge';
import { formatDateShort } from '@/lib/date';
import { sendNotification } from '@/lib/notificationService';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { pickProfileCoverUri } from '@/lib/profileCoverPicker';
import { loadStaffProfileSelf } from '@/lib/loadStaffProfileForViewer';
import {
  fetchMyStaffProfileVisits,
  readMyStaffProfileVisitsCache,
  type StaffProfileVisitRow,
} from '@/lib/staffProfileVisits';
import { LinkifiedText } from '@/components/LinkifiedText';
import { LinearGradient } from 'expo-linear-gradient';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';
import { usePersonelDesign } from '@/hooks/usePersonelDesign';
import { getFloatingTabBarTotalHeight } from '@/constants/floatingTabBarMetrics';
import { loadStaffProfileExtendedStats, type StaffProfileExtendedStats } from '@/lib/staffProfileExtendedStats';
import { calculateDaysWithUs } from '@/lib/modernProfileTenure';
import { ProfileTenureModal } from '@/components/modernProfile/ProfileTenureModal';
import {
  ModernStaffProfileShell,
  type QuickAction,
} from '@/components/modernProfile/ModernStaffProfileShell';
import type { ModernProfileStaffInput } from '@/lib/modernProfileModel';
import { getDepartmentLabel } from '@/lib/departmentLabels';
import { buildStaffProfileContactActions } from '@/lib/staffProfileContactActions';
import { resolveStaffTipsEnabledForGuest } from '@/lib/staffTipsEnabled';
import { getBlobCacheRaw, setBlobCache, hydrateBlobCache } from '@/lib/listCache';
import {
  peekStaffSelfTabCache,
  staffProfileFromAuth,
  staffSelfTabCacheKey,
  writeStaffSelfTabMemoryCache,
} from '@/lib/staffSelfTabCache';
import type { StaffProfile as AuthStaffProfile } from '@/stores/authStore';
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const STAFF_HERO_HEIGHT = P.hero.height;

type StaffProfile = {
  id: string;
  created_at?: string | null;
  tenure_note?: string | null;
  full_name: string | null;
  department: string | null;
  profile_image: string | null;
  cover_image: string | null;
  bio: string | null;
  specialties: string[] | null;
  languages: string[] | null;
  is_online: boolean | null;
  total_reviews: number | null;
  average_rating: number | null;
  position: string | null;
  hire_date: string | null;
  office_location: string | null;
  achievements: string[] | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  show_phone_to_guest: boolean | null;
  show_email_to_guest: boolean | null;
  show_whatsapp_to_guest: boolean | null;
  verification_badge?: 'blue' | 'yellow' | null;
  shift?: { start_time: string; end_time: string } | null;
  app_permissions?: Record<string, boolean> | null;
  evaluation_score?: number | null;
  evaluation_discipline?: number | null;
  evaluation_communication?: number | null;
  evaluation_speed?: number | null;
  evaluation_responsibility?: number | null;
  evaluation_insight?: string | null;
};

type SalaryPaymentRow = {
  id: string;
  period_month: number;
  period_year: number;
  amount: number;
  payment_date: string;
  status: string;
  staff_approved_at: string | null;
  staff_rejected_at: string | null;
  rejection_reason: string | null;
};

const LANGUAGE_FLAGS: Record<string, string> = {
  tr: '🇹🇷',
  en: '🇬🇧',
  ar: '🇸🇦',
  de: '🇩🇪',
  fr: '🇫🇷',
  ru: '🇷🇺',
  es: '🇪🇸',
};

function extendedStatsCacheKey(staffId: string) {
  return `staff-self-extended-stats:${staffId}`;
}

function initialStaffProfile(authStaff: AuthStaffProfile | null | undefined): StaffProfile | null {
  if (!authStaff?.id) return null;
  const mem = peekStaffSelfTabCache<StaffProfile, SalaryPaymentRow>(authStaff.id);
  if (mem?.profile) return mem.profile;
  return staffProfileFromAuth(authStaff) as StaffProfile;
}

export default function StaffProfileScreen() {
  const router = useRouter();
  const palette = usePersonelDesign();
  const cardShell = useMemo(
    () => ({ backgroundColor: palette.cardBg, borderColor: palette.cardBorder }),
    [palette]
  );
  const tabRowShell = useMemo(
    () => ({ backgroundColor: palette.secondaryBtn, borderColor: palette.cardBorder }),
    [palette]
  );
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const { staff: authStaff, loadSession } = useAuthStore();
  const [profile, setProfile] = useState<StaffProfile | null>(() => initialStaffProfile(authStaff));
  const [salaryPayments, setSalaryPayments] = useState<SalaryPaymentRow[]>(() => {
    if (!authStaff?.id) return [];
    return peekStaffSelfTabCache<StaffProfile, SalaryPaymentRow>(authStaff.id)?.salaryPayments ?? [];
  });
  const [uploading, setUploading] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [imageViewVisible, setImageViewVisible] = useState(false);
  const [coverImageViewVisible, setCoverImageViewVisible] = useState(false);
  const [extendedStats, setExtendedStats] = useState<StaffProfileExtendedStats | null>(() =>
    authStaff?.id ? getBlobCacheRaw<StaffProfileExtendedStats>(extendedStatsCacheKey(authStaff.id)) : null
  );
  const [profileVisits, setProfileVisits] = useState<StaffProfileVisitRow[]>([]);
  const [profileVisitsLoading, setProfileVisitsLoading] = useState(false);
  const [profileVisitsRefreshing, setProfileVisitsRefreshing] = useState(false);
  const [presenceUpdating, setPresenceUpdating] = useState(false);
  const [tenureModalVisible, setTenureModalVisible] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [tipsReceivingEnabled, setTipsReceivingEnabled] = useState(false);
  const [todayAnchor, setTodayAnchor] = useState(() => Date.now());
  const profileRef = useRef<StaffProfile | null>(null);
  /** İlk yükleme ile useFocusEffect çift fetch yapmasın */
  const lastInitialLoadAtRef = useRef(0);
  const lastProfileFocusSyncRef = useRef(0);
  const lastVisitorsFocusLoadRef = useRef(0);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

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

  useEffect(() => {
    if (!authStaff?.id) return;
    lastProfileFocusSyncRef.current = Date.now();
    let cancelled = false;
    const key = staffSelfTabCacheKey(authStaff.id);
    const memCached = peekStaffSelfTabCache<StaffProfile, SalaryPaymentRow>(authStaff.id);
    if (memCached?.profile && !cancelled) {
      setProfile(memCached.profile);
      setSalaryPayments(memCached.salaryPayments);
    } else if (!profileRef.current && !cancelled) {
      setProfile(staffProfileFromAuth(authStaff) as StaffProfile);
    }
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(key);
        if (raw && !cancelled) {
          const parsed = JSON.parse(raw) as { profile?: StaffProfile; salaryPayments?: SalaryPaymentRow[] };
          if (parsed.profile && typeof parsed.profile === 'object') {
            setProfile(parsed.profile);
            writeStaffSelfTabMemoryCache(authStaff.id, parsed.profile, parsed.salaryPayments ?? []);
          }
          if (Array.isArray(parsed.salaryPayments)) {
            setSalaryPayments(parsed.salaryPayments);
          }
        }
      } catch (_) {}

      const load = async () => {
        const [res, salRes] = await Promise.all([
          loadStaffProfileSelf(authStaff.id),
          supabase
            .from('salary_payments')
            .select('id, period_month, period_year, amount, payment_date, status, staff_approved_at, staff_rejected_at, rejection_reason')
            .eq('staff_id', authStaff.id)
            .order('period_year', { ascending: false })
            .order('period_month', { ascending: false }),
        ]);
        let nextProfile: StaffProfile | null = null;
        if (res.data) {
          const data = res.data;
          nextProfile = { ...data, shift: null } as StaffProfile;
          if (!cancelled) setProfile(nextProfile);
          if (data.shift_id) {
            const { data: shift } = await supabase
              .from('shifts')
              .select('start_time, end_time')
              .eq('id', data.shift_id)
              .single();
            nextProfile = nextProfile ? { ...nextProfile, shift } : null;
            if (!cancelled && nextProfile) setProfile(nextProfile);
          }
        }
        const salRows = (salRes.data ?? []) as SalaryPaymentRow[];
        if (!cancelled) setSalaryPayments(salRows);
        if (!cancelled && nextProfile) {
          writeStaffSelfTabMemoryCache(authStaff.id, nextProfile, salRows);
          AsyncStorage.setItem(key, JSON.stringify({ profile: nextProfile, salaryPayments: salRows })).catch(() => {});
        }
        if (!cancelled) {
          lastInitialLoadAtRef.current = Date.now();
          lastProfileFocusSyncRef.current = lastInitialLoadAtRef.current;
        }
      };
      await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [authStaff?.id]);

  const pickImage = async () => {
    if (!profile) return;
    const granted = await ensureMediaLibraryPermission({
      title: t('galleryPermission'),
      message: t('galleryPermissionMessage'),
      settingsMessage: t('settingsPermissionMessage'),
    });
    if (!granted) {
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
      });
      if (result.canceled || !result.assets[0]?.uri) return;
      setUploading(true);
      const { publicUrl } = await uploadUriToPublicBucket({
        bucketId: 'profiles',
        uri: result.assets[0].uri,
        subfolder: `staff/${profile.id}`,
      });
      await supabase.from('staff').update({ profile_image: publicUrl }).eq('id', profile.id);
      setProfile((p) => (p ? { ...p, profile_image: publicUrl } : null));
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('avatarUploadError'));
    } finally {
      setUploading(false);
    }
  };

  const onAvatarPress = () => {
    const uri = profile?.profile_image || undefined;
    if (uri) {
      setImageViewVisible(true);
    } else {
      pickImage();
    }
  };

  const onCoverPress = () => {
    if (profile?.cover_image) {
      setCoverImageViewVisible(true);
      return;
    }
    pickCoverImage();
  };

  const pickCoverImage = async () => {
    if (!profile || uploadingCover) return;
    try {
      const uri = await pickProfileCoverUri(t('settingsPermissionMessage'));
      if (!uri) return;
      setUploadingCover(true);
      const { publicUrl } = await uploadUriToPublicBucket({
        bucketId: 'profiles',
        uri,
        subfolder: `staff/${profile.id}/cover`,
      });
      await supabase.from('staff').update({ cover_image: publicUrl }).eq('id', profile.id);
      setProfile((p) => (p ? { ...p, cover_image: publicUrl } : null));
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('coverUploadError'));
    } finally {
      setUploadingCover(false);
    }
  };

  const confirmDeleteProfileImage = () => {
    if (!profile?.profile_image || uploading) return;
    Alert.alert(t('delete'), t('deleteProfilePhotoConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setUploading(true);
            try {
              const { error } = await supabase
                .from('staff')
                .update({ profile_image: null })
                .eq('id', profile.id);
              if (error) throw error;
              setProfile((p) => (p ? { ...p, profile_image: null } : null));
              setImageViewVisible(false);
            } catch (e) {
              Alert.alert(t('error'), (e as Error)?.message ?? t('avatarUploadError'));
            } finally {
              setUploading(false);
            }
          })();
        },
      },
    ]);
  };

  const confirmDeleteCoverImage = () => {
    if (!profile?.cover_image || uploadingCover) return;
    Alert.alert(t('delete'), t('deleteCoverPhotoConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setUploadingCover(true);
            try {
              const { error } = await supabase
                .from('staff')
                .update({ cover_image: null })
                .eq('id', profile.id);
              if (error) throw error;
              setProfile((p) => (p ? { ...p, cover_image: null } : null));
              setCoverImageViewVisible(false);
            } catch (e) {
              Alert.alert(t('error'), (e as Error)?.message ?? t('coverUploadError'));
            } finally {
              setUploadingCover(false);
            }
          })();
        },
      },
    ]);
  };

  const updateOnline = async (value: boolean) => {
    if (!profile || presenceUpdating) return;
    if ((profile.is_online ?? false) === value) return;
    setPresenceUpdating(true);
    const { error } = await supabase
      .from('staff')
      .update({ is_online: value, work_status: value ? 'active' : 'off', last_active: new Date().toISOString() })
      .eq('id', profile.id);
    if (error) {
      Alert.alert(t('error'), error.message || t('recordError'));
      setPresenceUpdating(false);
      return;
    }
    setProfile((p) => (p ? { ...p, is_online: value } : null));
    try {
      const key = staffSelfTabCacheKey(profile.id);
      const raw = await AsyncStorage.getItem(key);
      const parsed = raw ? (JSON.parse(raw) as { profile?: StaffProfile; salaryPayments?: SalaryPaymentRow[] }) : {};
      const nextProfile = parsed.profile ? { ...parsed.profile, is_online: value } : { ...profile, is_online: value };
      writeStaffSelfTabMemoryCache(profile.id, nextProfile, parsed.salaryPayments ?? salaryPayments);
      await AsyncStorage.setItem(key, JSON.stringify({ profile: nextProfile, salaryPayments: parsed.salaryPayments ?? salaryPayments }));
    } catch {
      // cache yazımı başarısız olsa da akış bozulmasın
    }

    // Profildeki çevrim içi/dışı anahtarı değişince aynı organizasyondaki personele bilgi bildirimi.
    try {
      const orgId = authStaff?.organization_id;
      if (orgId) {
        const { data: staffRows } = await supabase
          .from('staff')
          .select('id')
          .eq('organization_id', orgId)
          .eq('is_active', true)
          .neq('id', profile.id);
        const recipientIds = (staffRows ?? []).map((r: { id: string }) => r.id).filter(Boolean);
        if (recipientIds.length > 0) {
          const actorName = (profile.full_name || authStaff?.full_name || 'Personel').trim();
          const actorDept = (profile.department || authStaff?.department || '').trim();
          const actorLabel = actorDept ? `${actorName} (${actorDept})` : actorName;
          const statusText = value ? t('staffOnlineStatusOn') : t('staffOnlineStatusOff');
          const capabilityText = value ? t('staffCanOperateOn') : t('staffCanOperateOff');
          const title = t('staffPresenceNotifyTitle');
          const body = `${actorLabel} ${statusText}; ${capabilityText}`;
          await Promise.allSettled(
            recipientIds.map((staffId) =>
              sendNotification({
                staffId,
                title,
                body,
                category: 'staff',
                notificationType: 'staff_shift_changes',
                data: {
                  screen: '/staff/(tabs)/profile',
                  event: 'staff_presence_changed',
                  staffId: profile.id,
                  isOnline: value,
                },
                createdByStaffId: profile.id,
              })
            )
          );
        }
      }
    } catch {
      // Bildirim başarısız olsa da kullanıcı toggle akışı etkilenmesin.
    }
    setPresenceUpdating(false);
  };

  const reloadProfile = useCallback(async () => {
    if (!authStaff?.id) return;
    const key = staffSelfTabCacheKey(authStaff.id);
    const res = await loadStaffProfileSelf(authStaff.id);
    if (res.data) {
      const data = res.data;
      let next: StaffProfile = { ...data, shift: null } as StaffProfile;
      setProfile(next);
      if (data.shift_id) {
        const { data: shift } = await supabase.from('shifts').select('start_time, end_time').eq('id', data.shift_id).single();
        next = { ...next, shift };
        setProfile((p) => (p ? { ...p, shift } : null));
      }
      try {
        const raw = await AsyncStorage.getItem(key);
        const sp = (raw ? JSON.parse(raw) : {}) as { salaryPayments?: SalaryPaymentRow[] };
        writeStaffSelfTabMemoryCache(authStaff.id, next, sp.salaryPayments ?? []);
        await AsyncStorage.setItem(key, JSON.stringify({ profile: next, salaryPayments: sp.salaryPayments ?? [] }));
      } catch (_) {}
    }
  }, [authStaff?.id]);

  const refreshExtendedStats = useCallback(async () => {
    if (!authStaff?.id) {
      setExtendedStats(null);
      return;
    }
    const joinIso = profileRef.current?.hire_date ?? profileRef.current?.created_at ?? null;
    const days = joinIso ? calculateDaysWithUs(joinIso, todayAnchor) : null;
    const stats = await loadStaffProfileExtendedStats(authStaff.id, days);
    setExtendedStats(stats);
    setBlobCache(extendedStatsCacheKey(authStaff.id), stats);
  }, [authStaff?.id, todayAnchor]);

  useEffect(() => {
    if (!authStaff?.id) return;
    let cancelled = false;
    void hydrateBlobCache<StaffProfileExtendedStats>(extendedStatsCacheKey(authStaff.id)).then((cached) => {
      if (!cancelled && cached) setExtendedStats(cached);
    });
    return () => {
      cancelled = true;
    };
  }, [authStaff?.id]);

  const loadProfileVisits = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!authStaff?.id) return;
      if (mode === 'refresh') {
        setProfileVisitsRefreshing(true);
      } else {
        const cached = await readMyStaffProfileVisitsCache();
        if (cached?.length) {
          setProfileVisits(cached);
          setProfileVisitsLoading(false);
        } else {
          setProfileVisitsLoading(true);
        }
      }
      try {
        const { rows, error } = await fetchMyStaffProfileVisits(200);
        if (!error) setProfileVisits(rows);
      } finally {
        setProfileVisitsLoading(false);
        setProfileVisitsRefreshing(false);
      }
    },
    [authStaff?.id]
  );

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      const stale = now - lastProfileFocusSyncRef.current > 60_000;
      if (stale) {
        lastProfileFocusSyncRef.current = now;
        void loadSession();
        reloadProfile();
      }
      void refreshExtendedStats();
      if (now - lastVisitorsFocusLoadRef.current > 30_000) {
        lastVisitorsFocusLoadRef.current = now;
        loadProfileVisits('initial');
      }
    }, [reloadProfile, refreshExtendedStats, authStaff?.id, loadProfileVisits, loadSession])
  );

  useEffect(() => {
    if (authStaff?.id) loadProfileVisits('initial');
  }, [authStaff?.id, loadProfileVisits]);

  useFocusEffect(
    useCallback(() => {
      if (!authStaff?.id) return;
      void resolveStaffTipsEnabledForGuest(authStaff.id, {}).then(setTipsReceivingEnabled);
    }, [authStaff?.id])
  );

  const joinDateIso = profile?.hire_date ?? profile?.created_at ?? null;
  const daysWithUs = joinDateIso ? calculateDaysWithUs(joinDateIso, todayAnchor) : null;
  if (!profile) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.pageBg }]}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  const avatarUri = profile.profile_image || 'https://via.placeholder.com/120';
  const tenureSubtitle = profile.tenure_note?.trim() || t('tenureSubtitle');

  const modernProfileInput: ModernProfileStaffInput = {
    fullName: profile.full_name,
    role: authStaff?.role ?? null,
    position: profile.position,
    department: profile.department,
    organizationName: authStaff?.organization?.name ?? null,
    officeLocation: profile.office_location,
    hireDate: profile.hire_date,
    createdAt: profile.created_at,
    bio: profile.bio,
    profileImage: profile.profile_image,
    coverImage: profile.cover_image,
    phone: profile.phone,
    email: profile.email,
    whatsapp: profile.whatsapp,
    verificationBadge: profile.verification_badge ?? null,
    achievements: profile.achievements,
    specialties: profile.specialties,
    languages: profile.languages,
    isOnline: profile.is_online,
    shiftLabel: profile.shift ? `${profile.shift.start_time} – ${profile.shift.end_time}` : null,
    daysWithUs: daysWithUs ?? null,
    stats: extendedStats,
  };

  const profileContactActions = buildStaffProfileContactActions({
    t,
    mode: 'self',
    phone: profile.phone,
    email: profile.email,
    whatsapp: profile.whatsapp,
    onMessage: () => router.push('/staff/(tabs)/messages' as never),
    onTips: tipsReceivingEnabled ? () => router.push('/staff/tips' as never) : undefined,
    onEdit: () => router.push('/staff/profile/edit' as never),
  });

  const profileMenuActions: QuickAction[] = [
    {
      id: 'avatar',
      icon: 'camera-outline',
      label: t('modernProfileMenuChangePhoto'),
      onPress: () => pickImage(),
    },
    {
      id: 'cover',
      icon: 'image-outline',
      label: t('modernProfileMenuChangeCover'),
      onPress: () => pickCoverImage(),
    },
    ...(profile.cover_image
      ? [
          {
            id: 'cover-delete',
            icon: 'trash-outline' as const,
            label: t('modernProfileMenuDeleteCover'),
            destructive: true,
            onPress: () => confirmDeleteCoverImage(),
          },
        ]
      : []),
    {
      id: 'presence-on',
      icon: 'checkmark-circle-outline',
      label: t('staffProfileOnlineChip'),
      onPress: () => void updateOnline(true),
      disabled: presenceUpdating || (profile.is_online ?? false),
    },
    {
      id: 'presence-off',
      icon: 'pause-circle-outline',
      label: t('staffProfileOfflineChip'),
      onPress: () => void updateOnline(false),
      disabled: presenceUpdating || !(profile.is_online ?? false),
    },
    {
      id: 'card',
      icon: 'card-outline',
      label: t('modernProfileQuickCard'),
      onPress: () => router.push('/staff/profile/edit' as never),
    },
  ];

  const scrollBottomPad = insets.bottom + getFloatingTabBarTotalHeight(insets) + 32;

  return (
    <View style={[styles.container, { backgroundColor: palette.pageBg }]}>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: scrollBottomPad,
          width: windowWidth,
          minWidth: windowWidth,
          alignItems: 'stretch',
        }}
        refreshControl={
          <RefreshControl
            refreshing={profileVisitsRefreshing}
            onRefresh={() => {
              void loadProfileVisits('refresh');
              void refreshExtendedStats();
            }}
            tintColor={theme.colors.primary}
          />
        }
      >
        <ModernStaffProfileShell
          input={modernProfileInput}
          mode="self"
          staffId={profile.id}
          feedLinkVariant="staff"
          contactActions={profileContactActions}
          menuActions={profileMenuActions}
          menuOpen={profileMenuOpen}
          onMenuOpenChange={setProfileMenuOpen}
          showCompletion
          showVisitorsTab
          profileVisits={profileVisits}
          profileVisitsLoading={profileVisitsLoading}
          onTenurePress={() => setTenureModalVisible(true)}
          onEditPress={() => router.push('/staff/profile/edit')}
          onAccountPress={() => router.push('/staff/profile/account' as never)}
          onReviewsPress={() => router.push('/staff/performance')}
          onCoverPress={onCoverPress}
          onAvatarPress={onAvatarPress}
          topInset={insets.top}
          uploadingCover={uploadingCover}
          allowOwnPostDelete
          viewerStaffId={profile.id}
          cardStyle={cardShell}
        />

        {salaryPayments.some((p) => p.status === 'pending_approval') ? (
          <TouchableOpacity
            style={styles.pendingSalaryBanner}
            onPress={() => router.push('/staff/salary-history' as never)}
            activeOpacity={0.88}
          >
            <View style={styles.pendingSalaryBannerIcon}>
              <Ionicons name="wallet-outline" size={22} color="#b45309" />
            </View>
            <View style={styles.pendingSalaryBannerText}>
              <Text style={styles.pendingSalaryBannerTitle}>{t('pendingSalaryNotice')}</Text>
              <Text style={styles.pendingSalaryBannerSub} numberOfLines={2}>
                {t('staffSalaryPendingBannerSub', {
                  count: salaryPayments.filter((p) => p.status === 'pending_approval').length,
                })}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#b45309" />
          </TouchableOpacity>
        ) : null}

      </ScrollView>

      {/* Tam ekran profil resmi – boşluğa tıklayınca kapanır */}
      <Modal
        visible={imageViewVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setImageViewVisible(false)}
      >
        <Pressable style={styles.imageModalOverlay} onPress={() => setImageViewVisible(false)}>
          <CachedImage uri={avatarUri} style={styles.imageModalImageFull} contentFit="contain" pointerEvents="none" />
          {profile.profile_image ? (
            <TouchableOpacity style={styles.imageModalDeleteBtn} onPress={confirmDeleteProfileImage} activeOpacity={0.85}>
              <Ionicons name="trash-outline" size={16} color="#fff" />
              <Text style={styles.imageModalDeleteText}>{t('delete')}</Text>
            </TouchableOpacity>
          ) : null}
        </Pressable>
      </Modal>

      {/* Tam ekran kapak resmi */}
      <Modal
        visible={coverImageViewVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCoverImageViewVisible(false)}
      >
        <Pressable style={styles.imageModalOverlay} onPress={() => setCoverImageViewVisible(false)}>
          {profile.cover_image ? (
            <CachedImage
              uri={profile.cover_image}
              style={styles.imageModalImageFull}
              contentFit="contain"
              pointerEvents="none"
            />
          ) : null}
          {profile.cover_image ? (
            <TouchableOpacity style={styles.imageModalDeleteBtn} onPress={confirmDeleteCoverImage} activeOpacity={0.85}>
              <Ionicons name="trash-outline" size={16} color="#fff" />
              <Text style={styles.imageModalDeleteText}>{t('delete')}</Text>
            </TouchableOpacity>
          ) : null}
        </Pressable>
      </Modal>

      <ProfileTenureModal
        visible={tenureModalVisible}
        onClose={() => setTenureModalVisible(false)}
        daysWithUs={daysWithUs ?? 0}
        joinDateIso={joinDateIso}
        anchorMs={todayAnchor}
        subtitle={tenureSubtitle}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: P.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  coverBlock: { position: 'relative', overflow: 'visible' },
  coverBlockInner: {
    alignSelf: 'stretch',
    width: '100%',
    minWidth: '100%',
    height: STAFF_HERO_HEIGHT + 16,
    overflow: 'hidden',
  },
  coverImageClip: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  /** Kapak yokken gradient: soldan sağa tam dolgu (absoluteFill tek başına bazen %100 çözülmez) */
  heroGrad: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    minWidth: '100%',
    height: '100%',
    minHeight: '100%',
  },
  coverPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  coverPlaceholderText: { color: theme.colors.textMuted, fontSize: 14 },
  coverUploadOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverMenuBtn: {
    position: 'absolute',
    top: 12,
    right: 14,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(15,23,42,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 12,
  },
  coverEditBtn: {
    position: 'absolute',
    bottom: 16,
    right: 14,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(15,23,42,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  coverDeleteBtn: {
    position: 'absolute',
    bottom: 10,
    right: 48,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(220,38,38,0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  heroBackdropOrbA: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    top: -65,
    left: -30,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  heroBackdropOrbB: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    bottom: -52,
    right: -20,
    backgroundColor: 'rgba(16,185,129,0.22)',
  },
  heroBackdropOrbC: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    top: 42,
    right: 54,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroOverlap: {
    marginTop: -(P.avatar.size / 2),
    marginBottom: 8,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 0,
    zIndex: 5,
    alignItems: 'center',
  },
  avatarEditRow: { width: '100%', marginTop: 10, marginBottom: 4, alignItems: 'center' },
  avatarEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: P.cardMuted,
    borderWidth: 1,
    borderColor: P.border,
  },
  avatarEditBtnText: { fontSize: 12, fontWeight: '700', color: P.text },
  statsWrap: {
    width: '100%',
    marginTop: 14,
  },
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
  severeWarnNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    marginHorizontal: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  severeWarnDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#dc2626',
  },
  severeWarnNoteTextCol: { flex: 1, minWidth: 0 },
  severeWarnNoteTitle: { fontSize: 14, fontWeight: '800', color: '#7f1d1d' },
  severeWarnNoteHint: { fontSize: 12, fontWeight: '600', color: '#991b1b', marginTop: 2 },
  severeWarnModalBox: {
    width: '90%',
    maxWidth: 420,
    maxHeight: '78%',
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: '#fecaca',
  },
  severeWarnModalTitle: { fontSize: 18, fontWeight: '800', color: '#7f1d1d' },
  severeWarnModalMeta: { marginTop: 6, fontSize: 12, fontWeight: '600', color: theme.colors.textMuted },
  severeWarnModalSubject: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  severeWarnModalScroll: { maxHeight: 280, marginTop: 8 },
  severeWarnModalBody: { fontSize: 15, lineHeight: 22, color: theme.colors.text },
  severeWarnModalLinkBtn: {
    marginTop: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
  },
  severeWarnModalLinkText: { fontSize: 14, fontWeight: '700', color: theme.colors.primary },
  heroOnlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  heroOnlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: P.subtext,
  },
  heroOnlineDotOn: {
    backgroundColor: P.accent.green,
  },
  heroOnlineText: {
    fontSize: 13,
    fontWeight: '600',
    color: P.subtext,
  },
  heroPresenceCard: {
    width: '100%',
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  heroPresenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  heroPresenceTitle: { fontSize: 13, fontWeight: '800', color: '#334155' },
  heroPresenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
  },
  heroPresenceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 128,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  heroPresenceChipOn: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  heroPresenceChipOff: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  heroPresenceChipText: { fontSize: 12, fontWeight: '800', color: '#166534' },
  heroPresenceChipTextOn: { color: '#fff' },
  heroAvatarShadow: {
    borderRadius: P.avatar.size / 2,
    ...P.avatarShadow,
  },
  heroAvatarWrap: { position: 'relative', marginBottom: 8 },
  heroAvatarImg: {
    width: P.avatar.size,
    height: P.avatar.size,
    borderRadius: P.avatar.size / 2,
    borderWidth: P.avatar.border,
    borderColor: '#fff',
    backgroundColor: theme.colors.borderLight,
  },
  heroAvatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 44,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroAvatarCam: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: P.accent.purple,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  heroAvatarDelete: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  heroName: { ...theme.typography.titleSmall, color: P.text, textAlign: 'center' },
  heroOrgTag: {
    fontSize: 14,
    fontWeight: '600',
    color: P.subtext,
    textAlign: 'center',
    marginTop: 4,
  },
  heroSubtitle: {
    fontSize: 14,
    color: P.subtext,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  heroEditCtaOuter: {
    marginTop: 16,
    alignSelf: 'stretch',
    borderRadius: 12,
    overflow: 'hidden',
  },
  heroEditCtaGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  heroEditCtaText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  heroEditHint: {
    fontSize: 12,
    color: P.subtext,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 16,
    paddingHorizontal: 8,
  },
  pageSectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: P.subtext,
    letterSpacing: 0.4,
    marginTop: theme.spacing.xl,
    marginBottom: 10,
  },
  menuCard: {
    ...P.cardShell,
    overflow: 'hidden',
    marginBottom: 4,
  },
  menuCardModern: {
    borderRadius: 20,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: P.border,
    gap: 12,
  },
  menuRowLast: { borderBottomWidth: 0 },
  menuIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: P.iconBg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: P.border,
  },
  menuRowTitle: { fontSize: 15, fontWeight: '700', color: P.text, flex: 1 },
  menuRowTextCol: { flex: 1, minWidth: 0 },
  menuDetailTitle: { fontSize: 15, fontWeight: '700', color: P.text },
  menuDetailSub: { fontSize: 12, color: P.subtext, marginTop: 2 },
  menuBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: theme.colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  personnelWarnBanner: {
    borderWidth: 2,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  personnelWarnIconCircle: { backgroundColor: '#b91c1c' },
  personnelWarnTitle: { color: '#7f1d1d' },
  personnelWarnSub: { color: '#991b1b', fontWeight: '600' },
  warnBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 8,
    backgroundColor: '#b91c1c',
    justifyContent: 'center',
    alignItems: 'center',
  },
  warnBadgeText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  body: { padding: theme.spacing.lg, paddingTop: theme.spacing.sm },
  name: { ...theme.typography.title, color: theme.colors.text, textAlign: 'center' },
  dept: { fontSize: 15, color: theme.colors.textSecondary, marginTop: 4, textAlign: 'center' },
  position: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2, textAlign: 'center' },
  onlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  onlineLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  onlineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.textMuted },
  onlineDotOn: { backgroundColor: theme.colors.success },
  onlineLabel: { fontSize: 16, fontWeight: '600', color: P.text },
  jobInfoCard: {
    ...P.cardShell,
    padding: theme.spacing.lg,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  evaluationTeaserWrap: {
    marginTop: theme.spacing.lg,
  },
  jobInfoLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  jobInfoLineLast: { marginBottom: 0 },
  jobInfoLineText: { flex: 1, fontSize: 14, color: P.text, fontWeight: '500' },
  sectionTitle: {
    ...theme.typography.bodySmall,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  actionsSection: { marginTop: theme.spacing.sm },
  infoSection: { marginTop: 4 },
  label: { fontSize: 14, fontWeight: '600', color: theme.colors.text, marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    fontSize: 14,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.lg,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    ...theme.shadows.sm,
  },
  switchRowLast: { marginBottom: 0 },
  sectionTitleWrap: { marginTop: theme.spacing.lg },
  editProfileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    marginTop: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  editProfileIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.colors.primary + '18',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  editProfileTextWrap: { flex: 1, marginRight: 8 },
  editProfileLabel: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  editProfileHint: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
  editProfileChevron: {},
  card: {
    ...P.cardShell,
    padding: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  linkRowText: { fontSize: 15, color: theme.colors.text, flex: 1 },
  signOutRow: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.lg,
    gap: 8,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  signOutButtonText: { fontSize: 15, fontWeight: '600', color: theme.colors.textSecondary },
  deleteAccountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  deleteAccountText: { fontSize: 15, color: theme.colors.error, fontWeight: '600' },
  mutedRow: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 8 },
  switchLabel: { fontSize: 14, color: theme.colors.text, flex: 1 },
  shiftBox: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    ...theme.shadows.sm,
  },
  shiftText: { fontSize: 14, color: theme.colors.text },
  reviewsSection: { marginTop: theme.spacing.xl },
  reviewCard: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.borderLight },
  reviewStars: { color: theme.colors.primary, marginBottom: 4 },
  reviewComment: { fontSize: 14, color: theme.colors.text },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: theme.spacing.xl,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    ...theme.shadows.sm,
  },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '700', color: theme.colors.primary },
  statLabel: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 },
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  langModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  langModalContent: {
    width: Math.min(SCREEN_WIDTH - 32, 400),
    alignSelf: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    paddingHorizontal: 24,
    marginHorizontal: 16,
    ...theme.shadows.md,
    shadowRadius: 16,
    elevation: 8,
  },
  langModalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  langModalIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.primaryLight + '28',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  langModalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 6,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  langModalSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  langScrollView: { maxHeight: 340 },
  langScrollContent: { paddingBottom: 8 },
  langOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 16,
    marginBottom: 12,
    backgroundColor: theme.colors.backgroundSecondary,
    borderWidth: 2,
    borderColor: 'transparent',
    ...theme.shadows.sm,
  },
  langOptionCardActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primaryDark,
    ...theme.shadows.md,
  },
  langOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  langOptionLeftActive: {},
  langOptionFlag: {
    fontSize: 28,
  },
  langOptionLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.colors.text,
  },
  langOptionLabelActive: {
    color: theme.colors.white,
    fontWeight: '700',
  },
  langOptionCheckWrap: {},
  langOptionChevron: { opacity: 0.7 },
  langCloseBtn: {
    marginTop: 20,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: theme.colors.backgroundSecondary,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  langCloseText: {
    fontSize: 16,
    color: theme.colors.primary,
    fontWeight: '700',
  },
  imageModalImageFull: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  imageModalDeleteBtn: {
    position: 'absolute',
    bottom: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(220,38,38,0.92)',
  },
  imageModalDeleteText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  pendingSalaryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    gap: 12,
  },
  pendingSalaryBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingSalaryBannerText: { flex: 1, minWidth: 0 },
  pendingSalaryBannerTitle: { fontSize: 15, fontWeight: '700', color: '#92400e' },
  pendingSalaryBannerSub: { fontSize: 13, color: '#b45309', marginTop: 2 },
  blockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  blockedRowText: { flex: 1, minWidth: 0, paddingRight: 12 },
  blockedName: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  blockedSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  unblockBtn: {
    backgroundColor: theme.colors.error + '18',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  unblockBtnText: { color: theme.colors.error, fontWeight: '700', fontSize: 13 },
  profileTabRow: {
    flexDirection: 'row',
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    padding: 4,
    borderRadius: 16,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#DDE3FF',
    gap: 4,
    shadowColor: '#312E81',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  profileTabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  profileTabBtnActive: {
    backgroundColor: P.gradient.start,
    borderColor: P.gradient.start,
    shadowColor: P.gradient.start,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 5,
  },
  profileTabLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    textAlign: 'center',
  },
  profileTabLabelActive: {
    color: '#FFFFFF',
  },
  visitorsCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 4,
  },
  visitorsLoading: {
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  visitorsEmpty: {
    paddingVertical: 42,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  visitorsEmptyTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
  },
  visitorsEmptyHint: {
    marginTop: 8,
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  visitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  visitRowLast: {
    borderBottomWidth: 0,
  },
  visitAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.borderLight,
  },
  visitRowText: { flex: 1, minWidth: 0 },
  visitName: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  visitMeta: { fontSize: 13, color: theme.colors.textMuted, marginTop: 4 },
  visitAbout: { marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.borderLight },
  visitAboutText: { fontSize: 13, lineHeight: 19, color: theme.colors.textSecondary },
  visitAboutLink: { color: theme.colors.primary, textDecorationLine: 'underline', fontWeight: '600' },
  aboutBlock: {
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  aboutText: {
    fontSize: 14,
    lineHeight: 22,
    color: P.text,
  },
  aboutLink: {
    color: P.accent.blue,
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
});
