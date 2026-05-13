import { useState, useEffect, useRef, useCallback } from 'react';
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
  Animated,
  Easing,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, LANG_STORAGE_KEY, type LangCode } from '@/i18n';
import { applyRTLAndReloadIfNeeded } from '@/lib/reloadForRTL';
import { supabase } from '@/lib/supabase';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { AvatarWithBadge, StaffNameWithBadge } from '@/components/VerifiedBadge';
import { formatDateShort } from '@/lib/date';
import { notifyAdmins, sendNotification } from '@/lib/notificationService';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { listBlockedUsersForStaff } from '@/lib/userBlocks';
import { StaffEvaluationProfileTeaser } from '@/components/StaffEvaluationHub';
import { resolveStaffEvaluation } from '@/lib/staffEvaluation';
import { loadStaffProfileSelf } from '@/lib/loadStaffProfileForViewer';
import { canAccessDocumentManagement, canAccessIncidentReports, canAccessReservationSales } from '@/lib/staffPermissions';
import { canStaffUseMrzScan } from '@/lib/kbsMrzAccess';
import { canSeeBreakfastModule } from '@/lib/breakfastConfirm';
import { fetchMyStaffProfileVisits, type StaffProfileVisitRow } from '@/lib/staffProfileVisits';
import { LinkifiedText } from '@/components/LinkifiedText';
import { LinearGradient } from 'expo-linear-gradient';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';
import { ProfileStatsCard } from '@/components/ProfileStatsCard';
import { ProfileCover } from '@/components/ProfileCover';
import { loadStaffEngagementStats, type StaffEngagementStats } from '@/lib/staffEngagementStats';

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

const MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
function fmtMoney(n: number): string {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + ' ₺';
}

const LANGUAGE_FLAGS: Record<string, string> = {
  tr: '🇹🇷',
  en: '🇬🇧',
  ar: '🇸🇦',
  de: '🇩🇪',
  fr: '🇫🇷',
  ru: '🇷🇺',
  es: '🇪🇸',
};

type ActionBtn = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  accent: string;
};

type QuickAccessActionCardProps = {
  btn: ActionBtn;
  openTaskCount: number;
  onPress: () => void;
};

function QuickAccessActionCard({ btn, openTaskCount, onPress }: QuickAccessActionCardProps) {
  const cardScale = useRef(new Animated.Value(1)).current;
  const iconFloat = useRef(new Animated.Value(0)).current;
  const acc = btn.accent;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(iconFloat, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(iconFloat, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [iconFloat]);

  const handlePressIn = () => {
    Animated.spring(cardScale, {
      toValue: 0.97,
      friction: 8,
      tension: 180,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(cardScale, {
      toValue: 1,
      friction: 8,
      tension: 180,
      useNativeDriver: true,
    }).start();
  };

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.9} onPressIn={handlePressIn} onPressOut={handlePressOut}>
      <Animated.View
        style={[
          styles.quickAccessCard,
          { borderColor: acc + '40', backgroundColor: acc + '12', borderLeftColor: acc, transform: [{ scale: cardScale }] },
        ]}
      >
        {btn.key === 'gorevlerim' && openTaskCount > 0 ? (
          <View style={styles.actionTaskBadge}>
            <Text style={styles.actionTaskBadgeText}>{openTaskCount > 9 ? '9+' : openTaskCount}</Text>
          </View>
        ) : null}
        <Animated.View
          style={[
            styles.quickAccessIcon,
            {
              backgroundColor: acc + '26',
              transform: [{ translateY: iconFloat.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) }],
            },
          ]}
        >
          <Ionicons name={btn.icon} size={18} color={acc} />
        </Animated.View>
        <Text style={styles.quickAccessLabel} numberOfLines={2}>
          {btn.label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

/** Hızlı erişim kartları — okunaklı, canlı tonlar */
const ACTION_ACCENTS: Record<string, string> = {
  gorevlerim: '#2563eb',
  acil_durum: '#dc2626',
  gorev_ata_panel: '#db2777',
  kahvalti_teyit: '#ea580c',
  satis_komisyon: '#10b981',
  dokuman_yonetimi: '#4f46e5',
  tutanak_olustur: '#7c3aed',
  yarin_temizlik_listesi: '#0f766e',
  demirbaslar: '#7c3aed',
  stok: '#059669',
  stoklarim: '#0d9488',
  harcamalar: '#d97706',
  borc_alacak: '#0369a1',
  pasaportlar_mrz: '#ca8a04',
  personel_sikayet: '#b45309',
};

const actionButtons = (
  t: (k: string) => string,
  ui: ReturnType<typeof getStaffProfileUiCopy>,
  staffLike: {
    role?: string | null;
    kbs_access_enabled?: boolean;
    app_permissions?: Record<string, boolean> | null;
  } | null
): ActionBtn[] => {
  const defAccent = String(theme.colors.primary);
  const base: Omit<ActionBtn, 'accent'>[] = [
    { key: 'acil_durum', label: t('screenEmergencyButton'), icon: 'warning-outline', route: '/staff/emergency' },
    { key: 'gorevlerim', label: t('tasks'), icon: 'checkbox', route: '/staff/tasks' },
    { key: 'personel_sikayet', label: ui.staffComplaint, icon: 'alert-circle-outline', route: '/staff/internal-complaints/new' },
    { key: 'demirbaslar', label: ui.fixedAssets, icon: 'library-outline', route: '/staff/demirbaslar' },
    { key: 'stok', label: t('stockTab'), icon: 'cube', route: '/staff/stock' },
    { key: 'stoklarim', label: t('myStocks'), icon: 'list', route: '/staff/stock/my-movements' },
    { key: 'harcamalar', label: t('expenses'), icon: 'wallet-outline', route: '/staff/expenses' },
    { key: 'borc_alacak', label: 'Borç / alacak', icon: 'swap-horizontal-outline', route: '/staff/debts' },
  ];
  if (canAccessDocumentManagement(staffLike)) {
    base.splice(1, 0, {
      key: 'dokuman_yonetimi',
      label: ui.documentManagement,
      icon: 'folder-open-outline',
      route: '/staff/documents',
    });
  }
  if (canAccessIncidentReports(staffLike)) {
    base.splice(1, 0, {
      key: 'tutanak_olustur',
      label: ui.incidentCreate,
      icon: 'document-text-outline',
      route: '/staff/incident-reports/new',
    });
  }
  if (canAccessReservationSales(staffLike)) {
    base.splice(1, 0, {
      key: 'satis_komisyon',
      label: ui.salesCommission,
      icon: 'cash-outline',
      route: '/staff/sales',
    });
  }
  if (canSeeBreakfastModule(staffLike)) {
    base.splice(1, 0, {
      key: 'kahvalti_teyit',
      label: ui.breakfastUpload,
      icon: 'cafe-outline',
      route: '/staff/breakfast-confirm',
    });
  }
  if (staffLike?.app_permissions?.yarin_oda_temizlik_listesi || staffLike?.role === 'admin') {
    base.splice(1, 0, {
      key: 'yarin_temizlik_listesi',
      label: ui.cleaningPlan,
      icon: 'checkbox-outline',
      route: '/admin/rooms/cleaning-plan',
    });
  }
  if (canStaffUseMrzScan(staffLike)) {
    base.splice(1, 0, {
      key: 'pasaportlar_mrz',
      label: t('staffPassportsTitle'),
      icon: 'id-card-outline',
      route: '/staff/profile/passports',
    });
  }
  if (staffLike?.app_permissions?.gorev_ata && staffLike.role !== 'admin') {
    base.splice(1, 0, {
      key: 'gorev_ata_panel',
      label: t('taskAssignmentPanel'),
      icon: 'clipboard',
      route: '/admin/tasks',
    });
  }
  return base.map((b) => ({ ...b, accent: ACTION_ACCENTS[b.key] ?? defAccent }));
};

function staffSelfTabCacheKey(staffId: string) {
  return `staff_tab_self_v1_${staffId}`;
}

export default function StaffProfileScreen() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const ui = getStaffProfileUiCopy(i18n.language);
  const { staff: authStaff, signOut, loadSession } = useAuthStore();
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [imageViewVisible, setImageViewVisible] = useState(false);
  const [coverImageViewVisible, setCoverImageViewVisible] = useState(false);
  const [salaryPayments, setSalaryPayments] = useState<SalaryPaymentRow[]>([]);
  const [salaryActingId, setSalaryActingId] = useState<string | null>(null);
  const [salaryHistoryOpen, setSalaryHistoryOpen] = useState(false);
  const [blockedCount, setBlockedCount] = useState(0);
  const [personnelWarningUnread, setPersonnelWarningUnread] = useState(0);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [openTaskCount, setOpenTaskCount] = useState(0);
  const [engagement, setEngagement] = useState<StaffEngagementStats>({ posts: 0, likes: 0, comments: 0, visits: 0 });
  const [profileSectionTab, setProfileSectionTab] = useState<'main' | 'visitors'>('main');
  const [profileVisits, setProfileVisits] = useState<StaffProfileVisitRow[]>([]);
  const [profileVisitsLoading, setProfileVisitsLoading] = useState(false);
  const [profileVisitsRefreshing, setProfileVisitsRefreshing] = useState(false);
  const [presenceUpdating, setPresenceUpdating] = useState(false);
  const [tenureModalVisible, setTenureModalVisible] = useState(false);
  const [todayAnchor, setTodayAnchor] = useState(() => Date.now());
  const profileRef = useRef<StaffProfile | null>(null);
  const profileSectionTabRef = useRef(profileSectionTab);
  /** İlk yükleme ile useFocusEffect çift fetch yapmasın */
  const lastInitialLoadAtRef = useRef(0);
  const lastProfileFocusSyncRef = useRef(0);
  const lastVisitorsFocusLoadRef = useRef(0);

  const handleLanguageSelect = async (code: LangCode) => {
    i18n.changeLanguage(code);
    AsyncStorage.setItem(LANG_STORAGE_KEY, code);
    setLanguageModalVisible(false);
    await applyRTLAndReloadIfNeeded(code);
  };

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    profileSectionTabRef.current = profileSectionTab;
  }, [profileSectionTab]);

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
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(key);
        if (raw && !cancelled) {
          const parsed = JSON.parse(raw) as { profile?: StaffProfile; salaryPayments?: SalaryPaymentRow[] };
          if (parsed.profile && typeof parsed.profile === 'object') {
            setProfile(parsed.profile);
          }
          if (Array.isArray(parsed.salaryPayments)) {
            setSalaryPayments(parsed.salaryPayments);
          }
        }
      } catch (_) {}

      const load = async () => {
        const res = await loadStaffProfileSelf(authStaff.id);
        let nextProfile: StaffProfile | null = null;
        if (res.data) {
          const data = res.data;
          nextProfile = { ...data, shift: null } as StaffProfile;
          if (!cancelled) setProfile(nextProfile);
          if (data.shift_id) {
            const { data: shift } = await supabase.from('shifts').select('start_time, end_time').eq('id', data.shift_id).single();
            nextProfile = nextProfile ? { ...nextProfile, shift } : null;
            if (!cancelled && nextProfile) setProfile(nextProfile);
          }
        }
        const { data: sal } = await supabase
          .from('salary_payments')
          .select('id, period_month, period_year, amount, payment_date, status, staff_approved_at, staff_rejected_at, rejection_reason')
          .eq('staff_id', authStaff.id)
          .order('period_year', { ascending: false })
          .order('period_month', { ascending: false });
        const salRows = (sal ?? []) as SalaryPaymentRow[];
        if (!cancelled) setSalaryPayments(salRows);
        if (!cancelled && nextProfile) {
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
    if (!profile) return;
    const granted = await ensureMediaLibraryPermission({
      title: t('galleryPermission'),
      message: t('coverPermissionMessage'),
      settingsMessage: t('settingsPermissionMessage'),
    });
    if (!granted) {
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 2],
        quality: 0.7,
      });
      if (result.canceled || !result.assets[0]?.uri) return;
      setUploadingCover(true);
      const { publicUrl } = await uploadUriToPublicBucket({
        bucketId: 'profiles',
        uri: result.assets[0].uri,
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
          const statusText = value ? 'çevrim içi oldu' : 'çevrim dışı oldu';
          const capabilityText = value ? 'işlem yapabilir.' : 'işlem yapamaz.';
          const title = 'Personel durum bildirimi';
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

  const approveSalary = async (paymentId: string) => {
    setSalaryActingId(paymentId);
    const { error } = await supabase
      .from('salary_payments')
      .update({ status: 'approved', staff_approved_at: new Date().toISOString(), staff_rejected_at: null, rejection_reason: null })
      .eq('id', paymentId)
      .eq('staff_id', profile?.id);
    setSalaryActingId(null);
    if (error) {
      Alert.alert(t('error'), error.message);
      return;
    }
    setSalaryPayments((prev) =>
      prev.map((p) => (p.id === paymentId ? { ...p, status: 'approved', staff_approved_at: new Date().toISOString(), staff_rejected_at: null, rejection_reason: null } : p))
    );
    const paid = salaryPayments.find((x) => x.id === paymentId);
    if (paid) {
      notifyAdmins({
        title: t('approved'),
        body: `${profile?.full_name ?? 'Personel'} maaşını onayladı. Dönem: ${MONTH_NAMES[paid.period_month - 1]} ${paid.period_year} – ${fmtMoney(Number(paid.amount))}`,
        data: { screen: '/admin/salary' },
      }).catch(() => {});
    }
  };

  const rejectSalary = (paymentId: string) => {
    Alert.alert(
      t('rejectAppeal'),
      t('pendingSalaryNotice'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('rejectAppeal'),
          style: 'destructive',
          onPress: async () => {
            setSalaryActingId(paymentId);
            const { error } = await supabase
              .from('salary_payments')
              .update({ status: 'rejected', staff_rejected_at: new Date().toISOString(), staff_approved_at: null, rejection_reason: null })
              .eq('id', paymentId)
              .eq('staff_id', profile?.id);
            setSalaryActingId(null);
            if (error) {
              Alert.alert(t('error'), error.message);
              return;
            }
            setSalaryPayments((prev) =>
              prev.map((p) => (p.id === paymentId ? { ...p, status: 'rejected', staff_rejected_at: new Date().toISOString(), staff_approved_at: null, rejection_reason: null } : p))
            );
            const paid = salaryPayments.find((x) => x.id === paymentId);
            if (paid) {
              notifyAdmins({
                title: t('rejected'),
                body: `${profile?.full_name ?? 'Personel'} maaşını reddetti. Dönem: ${MONTH_NAMES[paid.period_month - 1]} ${paid.period_year} – ${fmtMoney(Number(paid.amount))}`,
                data: { screen: '/admin/salary' },
              }).catch(() => {});
            }
          },
        },
      ]
    );
  };

  const handleSignOut = () => {
    Alert.alert(
      t('signOut'),
      t('signOutConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('signOut'),
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/');
          },
        },
      ]
    );
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
        await AsyncStorage.setItem(key, JSON.stringify({ profile: next, salaryPayments: sp.salaryPayments ?? [] }));
      } catch (_) {}
    }
  }, [authStaff?.id]);

  const refreshOpenTaskCount = useCallback(async () => {
    if (!authStaff?.id) {
      setOpenTaskCount(0);
      return;
    }
    try {
      const { count, error } = await supabase
        .from('staff_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_staff_id', authStaff.id)
        .in('status', ['pending', 'in_progress']);
      if (!error) setOpenTaskCount(count ?? 0);
    } catch {
      setOpenTaskCount(0);
    }
  }, [authStaff?.id]);

  const refreshEngagement = useCallback(async () => {
    if (!authStaff?.id) {
      setEngagement({ posts: 0, likes: 0, comments: 0, visits: 0 });
      return;
    }
    const stats = await loadStaffEngagementStats(authStaff.id);
    setEngagement(stats);
  }, [authStaff?.id]);

  const refreshPersonnelWarnings = useCallback(async () => {
    if (!authStaff?.id) {
      setPersonnelWarningUnread(0);
      return;
    }
    try {
      const { count, error } = await supabase
        .from('staff_personnel_warnings')
        .select('id', { count: 'exact', head: true })
        .eq('subject_staff_id', authStaff.id)
        .is('acknowledged_at', null);
      if (!error) setPersonnelWarningUnread(count ?? 0);
    } catch {
      setPersonnelWarningUnread(0);
    }
  }, [authStaff?.id]);

  const loadProfileVisits = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!authStaff?.id) return;
      if (mode === 'refresh') setProfileVisitsRefreshing(true);
      else setProfileVisitsLoading(true);
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
        if (authStaff?.id) {
          listBlockedUsersForStaff(authStaff.id).then((rows) => setBlockedCount(rows.length));
        }
      }
      void refreshOpenTaskCount();
      void refreshEngagement();
      void refreshPersonnelWarnings();
      if (profileSectionTabRef.current === 'visitors') {
        if (now - lastVisitorsFocusLoadRef.current > 30_000) {
          lastVisitorsFocusLoadRef.current = now;
          loadProfileVisits('initial');
        }
      }
    }, [reloadProfile, refreshOpenTaskCount, refreshEngagement, refreshPersonnelWarnings, authStaff?.id, loadProfileVisits, loadSession])
  );

  useEffect(() => {
    if (profileSectionTab === 'visitors' && authStaff?.id) {
      loadProfileVisits('initial');
    }
  }, [profileSectionTab, authStaff?.id, loadProfileVisits]);

  if (!profile) {
    return (
      <View style={styles.centered}><Text>{t('loading')}</Text></View>
    );
  }

  /** Profil cache'te `{}` veya eksik yetki olabiliyor; oturumdaki app_permissions ile birleştir. */
  const mergedAppPermissions = (() => {
    const a =
      authStaff?.app_permissions && typeof authStaff.app_permissions === 'object' && !Array.isArray(authStaff.app_permissions)
        ? (authStaff.app_permissions as Record<string, boolean>)
        : {};
    const b =
      profile.app_permissions && typeof profile.app_permissions === 'object' && !Array.isArray(profile.app_permissions)
        ? (profile.app_permissions as Record<string, boolean>)
        : {};
    const merged = { ...a, ...b };
    return Object.keys(merged).length ? merged : null;
  })();

  const staffForButtons = {
    role: authStaff?.role ?? null,
    kbs_access_enabled: authStaff?.kbs_access_enabled,
    department: profile.department ?? authStaff?.department ?? null,
    app_permissions: mergedAppPermissions,
  };

  const avatarUri = profile.profile_image || 'https://via.placeholder.com/120';
  const joinDateIso = profile.hire_date ?? profile.created_at;
  const daysWithUs = joinDateIso ? calculateDaysWithUs(joinDateIso, todayAnchor) : null;
  const tenureCopy = getTenureCopy(i18n.language, daysWithUs ?? 0);
  const tenureSubtitle = profile.tenure_note?.trim() || tenureCopy.subtitle;
  const tenureTimeline = joinDateIso ? buildTenureTimeline(joinDateIso, todayAnchor) : [];

  const statItems = [
    { value: engagement.posts, label: ui.statsPosts },
    { value: engagement.likes, label: ui.statsLikes },
    { value: engagement.comments, label: ui.statsComments },
    { value: engagement.visits, label: ui.statsVisits },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 28,
          width: windowWidth,
          minWidth: windowWidth,
          alignItems: 'stretch',
        }}
        refreshControl={
          profileSectionTab === 'visitors' ? (
            <RefreshControl
              refreshing={profileVisitsRefreshing}
              onRefresh={() => loadProfileVisits('refresh')}
              tintColor={theme.colors.primary}
            />
          ) : undefined
        }
      >
        <View style={styles.coverBlock}>
          <ProfileCover
            imageUri={profile.cover_image}
            height={STAFF_HERO_HEIGHT + 16}
            onPress={onCoverPress}
            disabled={uploadingCover}
          >
            <View style={styles.heroBackdropOrbA} />
            <View style={styles.heroBackdropOrbB} />
            <View style={styles.heroBackdropOrbC} />
            {uploadingCover ? (
              <View style={styles.coverUploadOverlay}>
                <ActivityIndicator color={theme.colors.white} size="small" />
              </View>
            ) : null}
          </ProfileCover>
          <TouchableOpacity style={styles.coverEditBtn} onPress={pickCoverImage} activeOpacity={0.85}>
            <Ionicons name="camera-outline" size={20} color={theme.colors.white} />
          </TouchableOpacity>
        </View>

        <View style={styles.heroOverlap}>

          <TouchableOpacity onPress={onAvatarPress} disabled={uploading} activeOpacity={0.92} style={styles.heroAvatarWrap}>
            <View style={styles.heroAvatarShadow}>
              <AvatarWithBadge badge={profile.verification_badge ?? null} avatarSize={P.avatar.size} badgeSize={18} showBadge={false}>
                <CachedImage uri={avatarUri} style={styles.heroAvatarImg} contentFit="cover" />
              </AvatarWithBadge>
            </View>
            {uploading ? (
              <View style={styles.heroAvatarOverlay}>
                <ActivityIndicator color={theme.colors.white} size="small" />
              </View>
            ) : null}
            <TouchableOpacity style={styles.heroAvatarCam} onPress={(e) => { e.stopPropagation(); pickImage(); }} disabled={uploading}>
              <Ionicons name="camera" size={16} color={theme.colors.white} />
            </TouchableOpacity>
          </TouchableOpacity>
          <StaffNameWithBadge
            name={profile.full_name || '—'}
            badge={profile.verification_badge ?? null}
            badgeSize={20}
            textStyle={styles.heroName}
            center
          />
          {authStaff?.organization?.name ? (
            <Text style={styles.heroOrgTag} numberOfLines={1}>
              {authStaff.organization.name}
            </Text>
          ) : null}
          <Text style={styles.heroSubtitle} numberOfLines={2}>
            {[profile.position?.trim(), profile.department?.trim()].filter(Boolean).join(' · ') || t('unspecified')}
          </Text>
          {daysWithUs != null ? (
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
          <View style={styles.heroOnlineRow}>
            <View style={[styles.heroOnlineDot, profile.is_online && styles.heroOnlineDotOn]} />
            <Text style={styles.heroOnlineText}>{profile.is_online ? t('online') : t('offlineStatus')}</Text>
          </View>
          <View style={styles.heroPresenceCard}>
            <View style={styles.heroPresenceHeader}>
              <Text style={styles.heroPresenceTitle}>Çalışma durumu</Text>
              {presenceUpdating ? <ActivityIndicator size="small" color={P.gradient.start} /> : null}
            </View>
            <View style={styles.heroPresenceRow}>
              <TouchableOpacity
                style={[styles.heroPresenceChip, (profile.is_online ?? false) && styles.heroPresenceChipOn]}
                onPress={() => void updateOnline(true)}
                disabled={presenceUpdating || (profile.is_online ?? false)}
                activeOpacity={0.85}
              >
                <Ionicons name="checkmark-circle-outline" size={16} color={(profile.is_online ?? false) ? '#fff' : '#166534'} />
                <Text style={[styles.heroPresenceChipText, (profile.is_online ?? false) && styles.heroPresenceChipTextOn]}>
                  Çevrim içi
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.heroPresenceChip, !(profile.is_online ?? false) && styles.heroPresenceChipOff]}
                onPress={() => void updateOnline(false)}
                disabled={presenceUpdating || !(profile.is_online ?? false)}
                activeOpacity={0.85}
              >
                <Ionicons name="pause-circle-outline" size={16} color={!(profile.is_online ?? false) ? '#fff' : '#dc2626'} />
                <Text style={[styles.heroPresenceChipText, !(profile.is_online ?? false) && styles.heroPresenceChipTextOn]}>
                  Çevrim dışı
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.statsWrap}>
            <ProfileStatsCard items={statItems} />
          </View>
          <TouchableOpacity
            onPress={() => router.push('/staff/profile/edit')}
            activeOpacity={0.88}
            style={styles.heroEditCtaOuter}
          >
            <LinearGradient
              colors={[P.gradient.start, P.gradient.end]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroEditCtaGrad}
            >
              <Ionicons name="create-outline" size={20} color="#fff" />
              <Text style={styles.heroEditCtaText}>{t('editProfileInfo')}</Text>
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.heroEditHint}>{t('editProfileHint')}</Text>
        </View>

        <View style={styles.profileTabRow}>
          <TouchableOpacity
            style={[styles.profileTabBtn, profileSectionTab === 'main' && styles.profileTabBtnActive]}
            onPress={() => setProfileSectionTab('main')}
            activeOpacity={0.85}
          >
            <Text style={[styles.profileTabLabel, profileSectionTab === 'main' && styles.profileTabLabelActive]} numberOfLines={1}>
              {t('profileMainTab')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.profileTabBtn, profileSectionTab === 'visitors' && styles.profileTabBtnActive]}
            onPress={() => setProfileSectionTab('visitors')}
            activeOpacity={0.85}
          >
            <Text style={[styles.profileTabLabel, profileSectionTab === 'visitors' && styles.profileTabLabelActive]} numberOfLines={1}>
              {t('profileVisitorsTab')}
            </Text>
          </TouchableOpacity>
          {authStaff?.id ? (
            <TouchableOpacity
              style={styles.profileTabBtn}
              onPress={() => router.push({ pathname: '/staff/staff-posts/[id]', params: { id: authStaff.id } } as never)}
              activeOpacity={0.85}
            >
              <Text style={styles.profileTabLabel} numberOfLines={1}>
                {t('profileFeedPostsSection')}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {salaryPayments.some((p) => p.status === 'pending_approval') ? (
          <View style={styles.pendingSalaryTabArea}>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>⏳ {t('pendingSalaryNotice')}</Text>
              {salaryPayments
                .filter((p) => p.status === 'pending_approval')
                .map((p) => (
                  <View key={p.id} style={styles.pendingSalaryBlock}>
                    <Text style={styles.pendingSalaryText}>🔔 {t('salaryDeposited')}: {fmtMoney(Number(p.amount))} ({formatDateShort(p.payment_date)})</Text>
                    <Text style={styles.pendingSalaryHint}>{t('pleaseReview')}</Text>
                    <View style={styles.pendingSalaryActions}>
                      <TouchableOpacity
                        style={[styles.pendingSalaryBtn, styles.pendingSalaryBtnApprove]}
                        onPress={() => approveSalary(p.id)}
                        disabled={salaryActingId === p.id}
                      >
                        {salaryActingId === p.id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="checkmark" size={18} color="#fff" />
                            <Text style={styles.pendingSalaryBtnText}>{t('approve')}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.pendingSalaryBtn, styles.pendingSalaryBtnReject]}
                        onPress={() => rejectSalary(p.id)}
                        disabled={salaryActingId === p.id}
                      >
                        <Ionicons name="close" size={18} color="#fff" />
                        <Text style={styles.pendingSalaryBtnText}>{t('rejectAppeal')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
            </View>
          </View>
        ) : null}

        {profileSectionTab === 'main' ? (
        <View style={styles.body}>
          {profile.bio?.trim() ? (
            <>
              <Text style={styles.pageSectionLabel}>{ui.aboutSection}</Text>
              <View style={styles.menuCard}>
                <View style={styles.aboutBlock}>
                  <LinkifiedText text={profile.bio} textStyle={styles.aboutText} linkStyle={styles.aboutLink} />
                </View>
              </View>
            </>
          ) : null}

          <Text style={styles.pageSectionLabel}>{t('quickAccess')}</Text>
          <View style={styles.quickAccessGrid}>
            {actionButtons(t, ui, staffForButtons).map((btn) => (
              <QuickAccessActionCard key={btn.key} btn={btn} openTaskCount={openTaskCount} onPress={() => router.push(btn.route as never)} />
            ))}
          </View>

          {authStaff?.role === 'admin' ? (
            <>
              <Text style={styles.pageSectionLabel}>{t('adminShortcuts')}</Text>
              <View style={styles.quickAccessGrid}>
                {(
                  [
                    { route: '/staff/transfer-tour', icon: 'car-outline' as const, label: t('transferTourNavTitle'), accent: '#0ea5e9' },
                    { route: '/staff/dining-venues', icon: 'restaurant-outline' as const, label: t('diningVenuesNavTitle'), accent: '#f59e0b' },
                    { route: '/admin/local-area-guide', icon: 'map-outline' as const, label: ui.adminAreaGuide, accent: '#14b8a6' },
                    { route: '/staff/breakfast-confirm', icon: 'camera-outline' as const, label: ui.breakfastUpload, accent: '#ea580c' },
                    { route: '/admin/breakfast-confirm', icon: 'cafe-outline' as const, label: ui.breakfastRecords, accent: '#c2410c' },
                    { route: '/admin/expenses/all', icon: 'list-outline' as const, label: ui.allExpenses, accent: '#d97706' },
                    { route: '/admin/salary/all', icon: 'cash-outline' as const, label: ui.allPayments, accent: '#16a34a' },
                    { route: '/admin/contracts/all', icon: 'document-text-outline' as const, label: ui.allContracts, accent: '#6366f1' },
                    { route: '/admin/stock/all', icon: 'layers-outline' as const, label: ui.allStocks, accent: '#64748b' },
                    { route: '/admin/finance-checks', icon: 'document-text-outline' as const, label: 'Çek takibi', accent: '#0369a1' },
                    { route: '/admin/debts', icon: 'swap-horizontal-outline' as const, label: 'Borç / alacak', accent: '#0d9488' },
                  ] as const
                ).map((item) => (
                  <TouchableOpacity
                    key={item.route}
                    onPress={() => router.push(item.route as never)}
                    activeOpacity={0.9}
                  >
                    <View
                      style={[
                        styles.quickAccessCard,
                        {
                          borderColor: item.accent + '40',
                          backgroundColor: item.accent + '12',
                          borderLeftColor: item.accent,
                        },
                      ]}
                    >
                      <View style={[styles.quickAccessIcon, { backgroundColor: item.accent + '26' }]}>
                        <Ionicons name={item.icon} size={18} color={item.accent} />
                      </View>
                      <Text style={styles.quickAccessLabel} numberOfLines={2}>
                        {item.label}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : null}

          {profile?.app_permissions?.tum_sozlesmeler && authStaff?.role !== 'admin' ? (
            <>
              <Text style={styles.pageSectionLabel}>{t('contractsShortcut')}</Text>
              <View style={styles.menuCard}>
                <TouchableOpacity style={[styles.menuRow, styles.menuRowLast]} onPress={() => router.push('/staff/contracts/all')} activeOpacity={0.75}>
                  <View style={styles.menuIconCircle}>
                    <Ionicons name="document-text-outline" size={22} color={P.accent.blue} />
                  </View>
                  <Text style={styles.menuRowTitle}>{t('contractsShortcut')}</Text>
                  <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
                </TouchableOpacity>
              </View>
            </>
          ) : null}

          <Text style={styles.pageSectionLabel}>{t('jobInfo')}</Text>
          <View style={styles.jobInfoCard}>
            <View style={styles.jobInfoRow}>
              <Text style={styles.jobInfoItem}>📌 {profile.department?.trim() || t('unspecified')}</Text>
              <Text style={styles.jobInfoItem}>📅 {profile.hire_date ? new Date(profile.hire_date).toLocaleDateString(i18n.language || 'en') : t('unspecified')}</Text>
            </View>
            <View style={[styles.jobInfoRow, styles.jobInfoRowLast]}>
              <Text style={styles.jobInfoItem}>📍 {profile.office_location?.trim() || t('unspecified')}</Text>
              <View style={styles.jobInfoStatus}>
                <View style={[styles.onlineDot, profile.is_online && styles.onlineDotOn]} />
                <Text style={styles.onlineLabel}>{profile.is_online ? t('online') : t('offlineStatus')}</Text>
              </View>
            </View>
          </View>

          <Text style={styles.pageSectionLabel}>İşyeri ve uyarılar</Text>
          <TouchableOpacity
            style={[styles.menuCard, personnelWarningUnread > 0 && styles.personnelWarnBanner]}
            onPress={() => router.push('/staff/warnings')}
            activeOpacity={0.85}
          >
            <View style={[styles.menuRow, styles.menuRowLast]}>
              <View style={[styles.menuIconCircle, personnelWarningUnread > 0 && styles.personnelWarnIconCircle]}>
                <Ionicons name="warning-outline" size={22} color={personnelWarningUnread > 0 ? '#fff' : '#b91c1c'} />
              </View>
              <View style={styles.menuRowTextCol}>
                <Text style={[styles.menuDetailTitle, personnelWarningUnread > 0 && styles.personnelWarnTitle]}>
                  Resmi uyarılarım
                </Text>
                <Text style={[styles.menuDetailSub, personnelWarningUnread > 0 && styles.personnelWarnSub]}>
                  {personnelWarningUnread > 0
                    ? `${personnelWarningUnread} okunmamış yönetim uyarısı — açıp onaylamanız gerekir.`
                    : 'Yönetimden gelen disiplin ve uyarı kayıtları.'}
                </Text>
              </View>
              {personnelWarningUnread > 0 ? (
                <View style={styles.warnBadge}>
                  <Text style={styles.warnBadgeText}>{personnelWarningUnread > 99 ? '99+' : personnelWarningUnread}</Text>
                </View>
              ) : (
                <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
              )}
            </View>
          </TouchableOpacity>

          <View style={styles.evaluationTeaserWrap}>
            <StaffEvaluationProfileTeaser
              resolved={resolveStaffEvaluation({
                id: profile.id,
                evaluation_score: profile.evaluation_score,
                evaluation_discipline: profile.evaluation_discipline,
                evaluation_communication: profile.evaluation_communication,
                evaluation_speed: profile.evaluation_speed,
                evaluation_responsibility: profile.evaluation_responsibility,
                evaluation_insight: profile.evaluation_insight,
                average_rating: profile.average_rating,
              })}
              averageRating={profile.average_rating}
              totalReviews={profile.total_reviews}
              onPress={() => router.push('/staff/evaluation')}
            />
          </View>

          <Text style={styles.pageSectionLabel}>{t('salaryInfo')}</Text>
          <View style={styles.card}>
            {salaryPayments.length === 0 ? (
              <Text style={styles.salaryMuted}>{t('noSalaryRecords')}</Text>
            ) : (
              <>
                <View style={styles.salaryRow}>
                  <Text style={styles.label}>{t('lastPaidSalary')}</Text>
                  <Text style={styles.salaryAmount}>{fmtMoney(Number(salaryPayments[0].amount))}</Text>
                </View>
                <Text style={styles.salaryDetail}>{t('paymentDate')}: {formatDateShort(salaryPayments[0].payment_date)}</Text>
                <Text style={styles.salaryDetail}>
                  {t('status')}: {salaryPayments[0].status === 'approved' ? `✅ ${t('approved')} (${salaryPayments[0].staff_approved_at ? formatDateShort(salaryPayments[0].staff_approved_at) : '—'})` : salaryPayments[0].status === 'rejected' ? `❌ ${t('rejected')}` : `⏳ ${t('pendingApproval')}`}
                </Text>
                <TouchableOpacity style={styles.salaryHistoryToggle} onPress={() => setSalaryHistoryOpen((v) => !v)}>
                  <Text style={styles.salaryHistoryToggleText}>📜 {t('salaryHistory')}</Text>
                  <Ionicons name={salaryHistoryOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.primary} />
                </TouchableOpacity>
                {salaryHistoryOpen && (
                  <View style={styles.salaryHistoryList}>
                    {salaryPayments.slice(0, 12).map((p) => (
                      <View key={p.id} style={styles.salaryHistoryItem}>
                        <Text style={styles.salaryHistoryText}>{MONTH_NAMES[p.period_month - 1]} {p.period_year}: {fmtMoney(Number(p.amount))} – {formatDateShort(p.payment_date)} {p.status === 'approved' ? '✅' : p.status === 'rejected' ? '❌' : '⏳'}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
          <Text style={styles.pageSectionLabel}>{t('account')}</Text>
          <View style={styles.menuCard}>
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => router.push('/staff/missing-items')}
              activeOpacity={0.75}
            >
              <View style={styles.menuIconCircle}>
                <Ionicons name="alert-circle-outline" size={22} color={P.accent.blue} />
              </View>
              <View style={styles.menuRowTextCol}>
                <Text style={styles.menuDetailTitle}>{t('screenMissingItems')}</Text>
                <Text style={styles.menuDetailSub}>{ui.missingItemsSub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => setLanguageModalVisible(true)}
              activeOpacity={0.75}
            >
              <View style={styles.menuIconCircle}>
                <Ionicons name="language-outline" size={22} color={P.accent.blue} />
              </View>
              <View style={styles.menuRowTextCol}>
                <Text style={styles.menuDetailTitle}>{t('language')}</Text>
                <Text style={styles.menuDetailSub}>
                  {LANGUAGES.find((l) => l.code === (i18n.language || '').split('-')[0])?.label ?? t('selectLanguage')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => router.push('/staff/profile/notifications')}
              activeOpacity={0.75}
            >
              <View style={styles.menuIconCircle}>
                <Ionicons name="notifications-outline" size={22} color={P.accent.blue} />
              </View>
              <View style={styles.menuRowTextCol}>
                <Text style={styles.menuDetailTitle}>{t('notificationPrefsShort')}</Text>
                <Text style={styles.menuDetailSub}>{t('notificationsSection')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.menuRow, styles.menuRowLast]}
              onPress={() => router.push('/staff/profile/blocked-users')}
              activeOpacity={0.75}
            >
              <View style={styles.menuIconCircle}>
                <Ionicons name="ban-outline" size={22} color={P.accent.blue} />
              </View>
              <View style={styles.menuRowTextCol}>
                <Text style={styles.menuDetailTitle}>{t('blockedUsersTitle')}</Text>
                <Text style={styles.menuDetailSub}>
                  {blockedCount > 0 ? t('blockedUsersBadge', { count: blockedCount }) : t('openBlockedList')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={styles.pageSectionLabel}>{ui.appsWebSection}</Text>
          <View style={styles.menuCard}>
            <TouchableOpacity
              style={[styles.menuRow, styles.menuRowLast]}
              onPress={() => router.push('/staff/profile/app-links' as never)}
              activeOpacity={0.75}
            >
              <View style={styles.menuIconCircle}>
                <Ionicons name="apps-outline" size={20} color={P.accent.blue} />
              </View>
              <View style={styles.menuRowTextCol}>
                <Text style={styles.menuDetailTitle}>{ui.appsWebTitle}</Text>
                <Text style={styles.menuDetailSub} numberOfLines={2}>
                  {ui.appsWebSub}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={styles.pageSectionLabel}>{t('localAreaGuideSectionTitle')}</Text>
          <View style={styles.menuCard}>
            <TouchableOpacity
              style={[styles.menuRow, styles.menuRowLast]}
              onPress={() => router.push('/staff/local-area-guide' as never)}
              activeOpacity={0.75}
            >
              <View style={styles.menuIconCircle}>
                <Ionicons name="trail-sign-outline" size={22} color={P.accent.blue} />
              </View>
              <View style={styles.menuRowTextCol}>
                <Text style={styles.menuDetailTitle}>{t('localAreaGuideMenuTitle')}</Text>
                <Text style={styles.menuDetailSub} numberOfLines={2}>
                  {t('localAreaGuideMenuSub')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          {profile.shift && (
            <View style={styles.shiftBox}>
              <Text style={styles.label}>{t('workHours')}</Text>
              <Text style={styles.shiftText}>{profile.shift.start_time} – {profile.shift.end_time}</Text>
            </View>
          )}

          <Text style={styles.pageSectionLabel}>{t('permissionsLegal')}</Text>
          <View style={styles.menuCard}>
            <TouchableOpacity
              style={[styles.menuRow, styles.menuRowLast]}
              onPress={() => router.push('/permissions')}
              activeOpacity={0.75}
            >
              <View style={styles.menuIconCircle}>
                <Ionicons name="shield-checkmark-outline" size={22} color={P.accent.blue} />
              </View>
              <View style={styles.menuRowTextCol}>
                <Text style={styles.menuDetailTitle}>{t('permissionsLegal')}</Text>
                <Text style={styles.menuDetailSub} numberOfLines={2}>
                  {t('appPermissionsHint')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={styles.pageSectionLabel}>{t('accountManagement')}</Text>
          <TouchableOpacity style={styles.signOutRow} onPress={handleSignOut} activeOpacity={0.75}>
            <Ionicons name="log-out-outline" size={18} color={theme.colors.textSecondary} />
            <Text style={styles.signOutButtonText}>{t('signOut')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.card, styles.deleteAccountRow]}
            onPress={() => router.push('/staff/delete-account')}
            activeOpacity={0.8}
          >
            <Text style={styles.deleteAccountText}>{t('deleteMyAccount')}</Text>
            <Text style={styles.mutedRow}>→</Text>
          </TouchableOpacity>

        </View>
        ) : (
          <View style={styles.body}>
            <Text style={styles.pageSectionLabel}>{t('profileVisitorsTab')}</Text>
            <View style={styles.menuCard}>
            {profileVisitsLoading && profileVisits.length === 0 ? (
              <View style={styles.visitorsLoading}>
                <ActivityIndicator color={theme.colors.primary} size="large" />
              </View>
            ) : profileVisits.length === 0 && !profileVisitsLoading ? (
              <View style={styles.visitorsEmpty}>
                <Ionicons name="eye-off-outline" size={44} color={theme.colors.textMuted} />
                <Text style={styles.visitorsEmptyTitle}>{t('profileVisitorsEmpty')}</Text>
                <Text style={styles.visitorsEmptyHint}>{t('profileVisitorsHint')}</Text>
              </View>
            ) : (
              profileVisits.map((item, idx) => (
                <View key={item.id} style={[styles.visitRow, idx === profileVisits.length - 1 && styles.visitRowLast]}>
                  <CachedImage
                    uri={item.visitor_photo || 'https://via.placeholder.com/48'}
                    style={styles.visitAvatar}
                    contentFit="cover"
                  />
                  <View style={styles.visitRowText}>
                    <Text style={styles.visitName} numberOfLines={1}>{item.visitor_name || '—'}</Text>
                    <Text style={styles.visitMeta} numberOfLines={2}>
                      {(item.visitor_kind === 'staff' ? t('visitorTypeStaff') : t('visitorTypeGuest'))}
                      {' · '}
                      {new Date(item.visited_at).toLocaleString((i18n.language || 'tr').split('-')[0], {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                    {item.visitor_kind === 'staff' && (item.visitor_about ?? '').trim() ? (
                      <View style={styles.visitAbout}>
                        <LinkifiedText
                          text={(item.visitor_about ?? '').trim()}
                          textStyle={styles.visitAboutText}
                          linkStyle={styles.visitAboutLink}
                        />
                      </View>
                    ) : null}
                  </View>
                </View>
              ))
            )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Tam ekran profil resmi – boşluğa tıklayınca kapanır */}
      <Modal
        visible={imageViewVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setImageViewVisible(false)}
      >
        <Pressable style={styles.imageModalOverlay} onPress={() => setImageViewVisible(false)}>
          <Pressable style={styles.imageModalContent} onPress={() => {}}>
            <CachedImage uri={avatarUri} style={styles.imageModalImage} contentFit="contain" />
          </Pressable>
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
          <Pressable style={styles.imageModalContent} onPress={() => {}}>
            {profile.cover_image ? (
              <CachedImage uri={profile.cover_image} style={styles.imageModalImage} contentFit="contain" />
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={tenureModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTenureModalVisible(false)}
      >
        <Pressable style={styles.langModalOverlay} onPress={() => setTenureModalVisible(false)}>
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

      {/* Dil seçimi */}
      <Modal visible={languageModalVisible} transparent animationType="fade" onRequestClose={() => setLanguageModalVisible(false)}>
        <Pressable style={styles.langModalOverlay} onPress={() => setLanguageModalVisible(false)}>
          <Pressable
            style={[
              styles.langModalContent,
              {
                paddingTop: insets.top + 24,
                paddingBottom: insets.bottom + 24,
                maxHeight: SCREEN_HEIGHT * 0.82,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.langModalHeader}>
              <View style={styles.langModalIconWrap}>
                <Ionicons name="globe-outline" size={32} color={theme.colors.primary} />
              </View>
              <Text style={styles.langModalTitle}>{t('selectLanguage')}</Text>
              <Text style={styles.langModalSubtitle}>{t('selectAppLanguage')}</Text>
            </View>
            <ScrollView
              style={styles.langScrollView}
              contentContainerStyle={styles.langScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {LANGUAGES.map(({ code, label }) => {
                const isActive = (i18n.language || '').split('-')[0] === code;
                const flag = LANGUAGE_FLAGS[code] ?? '🌐';
                return (
                  <TouchableOpacity
                    key={code}
                    style={[styles.langOptionCard, isActive && styles.langOptionCardActive]}
                    onPress={() => handleLanguageSelect(code)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.langOptionLeft, isActive && styles.langOptionLeftActive]}>
                      <Text style={styles.langOptionFlag}>{flag}</Text>
                      <Text style={[styles.langOptionLabel, isActive && styles.langOptionLabelActive]}>{label}</Text>
                    </View>
                    {isActive ? (
                      <View style={styles.langOptionCheckWrap}>
                        <Ionicons name="checkmark-circle" size={26} color={theme.colors.white} />
                      </View>
                    ) : (
                      <View style={styles.langOptionChevron}>
                        <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.langCloseBtn} onPress={() => setLanguageModalVisible(false)} activeOpacity={0.85}>
              <Text style={styles.langCloseText}>{t('close')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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

function getStaffProfileUiCopy(lang: string) {
  const code = (lang || 'en').toLowerCase();
  if (code.startsWith('ar')) {
    return {
      staffComplaint: 'شكوى الموظف',
      fixedAssets: 'الأصول الثابتة',
      documentManagement: 'إدارة الوثائق',
      incidentCreate: 'إنشاء محضر',
      salesCommission: 'المبيعات والعمولات',
      breakfastUpload: 'رفع صورة الإفطار',
      cleaningPlan: 'خطة تنظيف الغرف',
      statsPosts: 'المنشورات',
      statsLikes: 'الإعجابات',
      statsComments: 'التعليقات',
      statsVisits: 'الزيارات',
      adminAreaGuide: 'دليل الأماكن (الإدارة)',
      breakfastRecords: 'سجلات تأكيد الإفطار',
      allExpenses: 'جميع المصروفات',
      allPayments: 'جميع المدفوعات',
      allContracts: 'جميع العقود',
      allStocks: 'جميع المخزون',
      missingItemsSub: 'اكتب النقص بوضوح ليعرف الفريق المطلوب بسرعة',
      appsWebSection: 'التطبيقات والويب',
      appsWebTitle: 'التطبيقات ومواقع الويب',
      appsWebSub: 'اعرض روابط المتاجر والمواقع المشتركة',
      aboutSection: 'حول',
    };
  }
  if (code.startsWith('tr')) {
    return {
      staffComplaint: 'Yönetime Not/Öneri',
      fixedAssets: 'Demirbaşlar',
      documentManagement: 'Doküman Yönetimi',
      incidentCreate: 'Tutanak Oluştur',
      salesCommission: 'Satış & Komisyon',
      breakfastUpload: 'Kahvaltı Fotoğrafı Yükle',
      cleaningPlan: 'Temizlenecek odaları gönderebilir',
      statsPosts: 'Paylaşım',
      statsLikes: 'Beğeni',
      statsComments: 'Yorum',
      statsVisits: 'Ziyaret',
      adminAreaGuide: 'Gezilecek yerler (yönetim)',
      breakfastRecords: 'Kahvaltı Teyit Kayıtları',
      allExpenses: 'Tüm Harcamalar',
      allPayments: 'Tüm Ödemeler',
      allContracts: 'Tüm Sözleşmeler',
      allStocks: 'Tüm Stoklar',
      missingItemsSub: 'Eksigi acikca yaz, ekip hemen ne lazim anlasin',
      appsWebSection: 'Uygulamalar & web',
      appsWebTitle: 'Uygulamalar & web siteleri',
      appsWebSub: 'Paylaşılan mağaza ve site linklerini listele',
      aboutSection: 'Hakkında',
    };
  }
  return {
    staffComplaint: 'Note/Suggestion to manager',
    fixedAssets: 'Fixed assets',
    documentManagement: 'Document management',
    incidentCreate: 'Create incident report',
    salesCommission: 'Sales & commission',
    breakfastUpload: 'Upload breakfast photo',
    cleaningPlan: 'Room cleaning plan',
    statsPosts: 'Posts',
    statsLikes: 'Likes',
    statsComments: 'Comments',
    statsVisits: 'Visits',
    adminAreaGuide: 'Area guide (admin)',
    breakfastRecords: 'Breakfast confirmation records',
    allExpenses: 'All expenses',
    allPayments: 'All payments',
    allContracts: 'All contracts',
    allStocks: 'All stocks',
    missingItemsSub: 'Write the missing item clearly so the team can respond quickly',
    appsWebSection: 'Apps & web',
    appsWebTitle: 'Apps & websites',
    appsWebSub: 'List shared store and website links',
    aboutSection: 'About',
  };
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
  coverEditBtn: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
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
    right: -2,
    bottom: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: P.accent.purple,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
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
    fontSize: 12,
    fontWeight: '800',
    color: P.subtext,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: theme.spacing.xl,
    marginBottom: 10,
  },
  menuCard: {
    backgroundColor: P.card,
    borderRadius: 18,
    borderWidth: 0,
    overflow: 'hidden',
    ...theme.shadows.sm,
    shadowOpacity: 0.06,
    shadowRadius: 12,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
    gap: 10,
  },
  menuRowLast: { borderBottomWidth: 0 },
  menuIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: P.iconBg,
    justifyContent: 'center',
    alignItems: 'center',
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
    backgroundColor: P.card,
    borderRadius: 16,
    padding: theme.spacing.lg,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    borderWidth: 0,
    ...theme.shadows.sm,
    shadowOpacity: 0.06,
  },
  evaluationTeaserWrap: {
    marginTop: theme.spacing.lg,
  },
  jobInfoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  jobInfoRowLast: { marginBottom: 0 },
  jobInfoItem: { fontSize: 14, color: P.text, flex: 1, minWidth: 0 },
  jobInfoStatus: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: {
    ...theme.typography.bodySmall,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  actionsSection: { marginTop: theme.spacing.sm },
  quickAccessGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickAccessCard: {
    position: 'relative',
    width: (SCREEN_WIDTH - theme.spacing.lg * 2 - 8) / 2,
    minHeight: 84,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderLeftWidth: 3,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  actionTaskBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    zIndex: 2,
  },
  actionTaskBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  quickAccessIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  quickAccessLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: P.text,
    textAlign: 'center',
    lineHeight: 15,
  },
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
    backgroundColor: P.card,
    borderRadius: 16,
    padding: theme.spacing.md,
    marginTop: theme.spacing.sm,
    ...theme.shadows.sm,
    shadowOpacity: 0.06,
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
  imageModalContent: {
    width: SCREEN_WIDTH,
    maxHeight: '80%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
    borderRadius: 0,
  },
  salaryMuted: { fontSize: 14, color: theme.colors.textMuted },
  salaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  salaryAmount: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  salaryDetail: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 4 },
  salaryHistoryToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.borderLight },
  salaryHistoryToggleText: { fontSize: 14, fontWeight: '600', color: theme.colors.primary },
  salaryHistoryList: { marginTop: 8, gap: 6 },
  salaryHistoryItem: { paddingVertical: 4 },
  salaryHistoryText: { fontSize: 13, color: theme.colors.textSecondary },
  pendingSalaryTabArea: { paddingHorizontal: 16, marginTop: 10, marginBottom: 2 },
  pendingSalaryBlock: { marginTop: 8, padding: 12, backgroundColor: theme.colors.backgroundSecondary, borderRadius: theme.radius.md },
  pendingSalaryText: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  pendingSalaryHint: { fontSize: 13, color: theme.colors.textMuted, marginTop: 4 },
  pendingSalaryActions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  pendingSalaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: theme.radius.md },
  pendingSalaryBtnApprove: { backgroundColor: theme.colors.success },
  pendingSalaryBtnReject: { backgroundColor: theme.colors.error },
  pendingSalaryBtnText: { fontSize: 14, fontWeight: '600', color: theme.colors.white },
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
