import { memo, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Animated,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  useWindowDimensions,
  Platform,
  Alert,
  BackHandler,
  InteractionManager,
  TextInput,
  type ViewStyle,
  type TextInput as TextInputType,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useFocusEffect, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { fetchStaffMessagingUnreadCount } from '@/lib/messagingUnreadCount';
import { useAuthStore } from '@/stores/authStore';
import { useAdminBadgeDismissedStore } from '@/stores/adminBadgeDismissedStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { adminTheme } from '@/constants/adminTheme';
import { countPendingGuestComplaints } from '@/lib/guestComplaintsAdmin';
import { AdminLiveOpsStrip } from '@/components/premium/AdminLiveOpsStrip';
import { AdminCard, AdminOrganizationPicker } from '@/components/admin';
import { isKbsUiEnabled } from '@/lib/kbsUiEnabled';
import { canAccessTechnicalAssetsAdminRoutes } from '@/lib/staffPermissions';
import { canAccessAdminRoute } from '@/lib/adminRoutePermissions';
import { canStaffUseIdCapture } from '@/lib/kbsMrzAccess';
import { log } from '@/lib/logger';
import { exitAdminPanelToStaffTabs } from '@/lib/staffAdminTabNavigation';
import {
  type AdminDashboardStats,
  adminDashboardCacheKey,
  getAdminDashboardCache,
  setAdminDashboardCache,
  hydrateAdminDashboardCache,
  invalidateAdminDashboardCache,
  patchAdminDashboardMessagesUnread,
  shouldRefreshAdminMessagesUnread,
  shouldSkipAdminDashboardNetwork,
} from '@/lib/adminDashboardCache';
import { ADMIN_HOME_DEFER_MS, ADMIN_HOME_LIVE_OPS_STRIP } from '@/lib/adminHomePerf';

type Stats = AdminDashboardStats;

const EMPTY_STATS: Stats = {
  roomsTotal: 0,
  roomsOccupied: 0,
  guestsActive: 0,
  staffActive: 0,
  stockPending: 0,
  staffPending: 0,
  expensesPending: 0,
  unreadNotifs: 0,
  messagesUnread: 0,
  feedTotal: 0,
  reportsPending: 0,
  complaintsPending: 0,
  acceptancesUnassigned: 0,
};

const H_PAD = 20;

const SEARCH_SHORTCUTS = [
  { label: 'Personel', query: 'personel' },
  { label: 'Stok', query: 'stok' },
  { label: 'Onay', query: 'onay' },
  { label: 'Oda', query: 'oda' },
  { label: 'Misafir', query: 'misafir' },
  { label: 'Maaş', query: 'maas' },
] as const;

type SectionItem = {
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  badge?: number;
};

type Section = {
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  items: SectionItem[];
};

const SECTION_TINTS: Record<string, { bg: string; icon: string }> = {
  'Konaklama & Odalar': { bg: '#ecfeff', icon: '#0e7490' },
  İletişim: { bg: '#fff7ed', icon: '#c2410c' },
  'Stok & Onaylar': { bg: '#f5f3ff', icon: '#6d28d9' },
  'Kahvaltı partnerleri': { bg: '#fffbeb', icon: '#b45309' },
  'Erişim & Güvenlik': { bg: '#eff6ff', icon: '#1d4ed8' },
  'Kurumsal & Ayarlar': { bg: '#f0fdf4', icon: '#166534' },
};

const SECTIONS: Section[] = [
  {
    title: 'Konaklama & Odalar',
    subtitle: 'Oda ve misafir işlemleri',
    icon: 'business-outline',
    items: [
      { href: '/admin/rooms', icon: 'bed-outline', label: 'Oda yönetimi' },
      { href: '/admin/rooms/cleaning-plan', icon: 'sparkles-outline', label: 'Oda temizlik planı (personele bildir)' },
      { href: '/admin/rooms/new', icon: 'add-circle-outline', label: 'Yeni oda' },
      { href: '/admin/checkin', icon: 'calendar-outline', label: 'Check-in / Check-out' },
      { href: '/admin/housekeeping', icon: 'leaf-outline', label: 'Housekeeping' },
      { href: '/admin/tasks', icon: 'clipboard-outline', label: 'Personel görevleri' },
      { href: '/admin/points', icon: 'star-outline', label: 'Puan yönetimi' },
      { href: '/admin/attendance', icon: 'time-outline', label: 'Personel mesai takibi' },
      { href: '/admin/guests', icon: 'people-outline', label: 'Misafirler' },
      { href: '/admin/guest-welcome-card', icon: 'hand-left-outline', label: 'Misafir karşılama kartı' },
      { href: '/admin/report', icon: 'stats-chart-outline', label: 'Günlük doluluk raporu' },
      { href: '/admin/report/breakfast-briefing', icon: 'cafe-outline', label: 'Sabah kahvaltı sayısı' },
      { href: '/admin/sales', icon: 'cash-outline', label: 'Satış & Komisyon' },
      { href: '/admin/hmb-reports', icon: 'document-attach-outline', label: 'HMB Raporu (Maliye)' },
    ],
  },
  {
    title: 'İletişim',
    subtitle: 'Topluluk içeriği ve duyurular',
    icon: 'chatbubble-ellipses-outline',
    items: [
      { href: '/admin/feed', icon: 'images-outline', label: 'Gönderiler' },
      { href: '/admin/hotel-pulse', icon: 'pulse-outline', label: 'Misafir otel nabzı' },
      { href: '/admin/local-area-guide', icon: 'map-outline', label: 'Gezilecek yerler (bölge rehberi)' },
      { href: '/admin/map', icon: 'map-outline', label: 'Harita (canlı takip)' },
      { href: '/admin/smart-ops', icon: 'pulse-outline', label: 'Operasyon & bildirim merkezi' },
      { href: '/admin/announcements/compose', icon: 'megaphone-outline', label: 'Zengin duyuru oluştur' },
      { href: '/admin/engagement', icon: 'analytics-outline', label: 'Duyuru & görev takibi' },
      { href: '/admin/staff-emergency', icon: 'megaphone-outline', label: 'Personel toplanma alarmi' },
      { href: '/admin/emergency-locations', icon: 'warning-outline', label: 'Acil lokasyonlari yonet' },
      { href: '/admin/reports', icon: 'flag-outline', label: 'Şikayetler (paylaşım bildirimleri)', badge: 0 },
      { href: '/admin/complaints', icon: 'chatbox-ellipses-outline', label: 'Misafir Şikayet/Oneri', badge: 0 },
      { href: '/admin/staff-complaints', icon: 'alert-circle-outline', label: 'Personel Şikayet Notları' },
    ],
  },
  {
    title: 'Stok & Onaylar',
    subtitle: 'Envanter ve onay bekleyenler',
    icon: 'albums-outline',
    items: [
      { href: '/admin/stock', icon: 'cube-outline', label: 'Stok yönetimi' },
      { href: '/admin/fnb-hub', icon: 'grid-outline', label: 'F&B Merkezi (mutfak · satış · menü)' },
      { href: '/admin/payments', icon: 'card-outline', label: 'Tahsilat Merkezi (QR · sepet · bahşiş)' },
      { href: '/admin/accounting', icon: 'calculator-outline', label: 'Muhasebe (gelir / gider)', badge: 0 },
      { href: '/admin/expenses', icon: 'wallet-outline', label: 'Personel harcamaları', badge: 0 },
      { href: '/admin/carbon', icon: 'leaf-outline', label: 'Karbon girdileri' },
      { href: '/admin/trade-partners', icon: 'storefront-outline', label: 'Partner Ticaret' },
      { href: '/admin/transfer-tour', icon: 'car-sport-outline', label: 'Transfer & Tur' },
      { href: '/admin/salary', icon: 'cash-outline', label: 'Maaş yönetimi' },
      { href: '/admin/finance-checks', icon: 'document-text-outline', label: 'Çek takibi' },
      { href: '/admin/debts', icon: 'swap-horizontal-outline', label: 'Borç / alacak' },
    ],
  },
  {
    title: 'Kahvaltı partnerleri',
    subtitle: 'Partner otelleri, teyit ve kamera kayıt talepleri',
    icon: 'restaurant-outline',
    items: [
      { href: '/admin/breakfast-partners', icon: 'business-outline', label: 'Kahvaltı partner otelleri' },
      { href: '/admin/breakfast-confirm', icon: 'cafe-outline', label: 'Kahvaltı teyit kayıtları' },
      { href: '/admin/camera-requests', icon: 'videocam-outline', label: 'Kahvaltı kamera kayıt talepleri' },
    ],
  },
  {
    title: 'Erişim & Güvenlik',
    icon: 'shield-checkmark-outline',
    items: [
      { href: '/admin/access', icon: 'key-outline', label: 'Geçiş kontrolü' },
      { href: '/admin/cameras', icon: 'videocam-outline', label: 'Kamera yönetimi' },
      { href: '/admin/technical-assets', icon: 'layers-outline', label: 'Akıllı Tesis Envanteri' },
      { href: '/admin/permissions', icon: 'shield-checkmark-outline', label: 'İzinler' },
      { href: '/admin/ui-features', icon: 'options-outline', label: 'Uygulama görünümü (özellikler & menü)' },
      { href: '/admin/kbs-settings', icon: 'scan-outline', label: 'KBS Ayarları (Admin)' },
      { href: '/admin/kbs-permissions', icon: 'shield-outline', label: 'KBS Yetkileri (OPS)' },
    ],
  },
  {
    title: 'Kurumsal & Ayarlar',
    subtitle: 'Sözleşmeler ve personel',
    icon: 'settings-outline',
    items: [
      { href: '/admin/profile', icon: 'person-circle-outline', label: 'Profilim (hesap düzenle)' },
      { href: '/admin/app-links', icon: 'link-outline', label: 'Uygulamalar & Web Siteleri' },
      { href: '/admin/settings/printer', icon: 'print-outline', label: 'Yazici ayarlari' },
      { href: '/admin/documents', icon: 'folder-open-outline', label: 'Doküman Yönetimi' },
      { href: '/admin/maliye', icon: 'shield-outline', label: 'Maliye Evrak Merkezi' },
      { href: '/admin/incident-reports', icon: 'document-text-outline', label: 'Tutanaklar' },
      { href: '/admin/missing-items', icon: 'alert-circle-outline', label: 'Eksik Var' },
      { href: '/admin/lost-found', icon: 'briefcase-outline', label: 'Kayıp eşya (buluntu)' },
      { href: '/admin/facility-journal', icon: 'clipboard-outline', label: 'Otel eşyaları kullanımı' },
      { href: '/admin/notes', icon: 'create-outline', label: 'Not Al' },
      { href: '/admin/audits', icon: 'clipboard-outline', label: 'Denetim panosu' },
      { href: '/admin/performance', icon: 'trophy-outline', label: 'Ayın en iyi personeli' },
      { href: '/admin/contracts', icon: 'document-outline', label: 'Sözleşmeler (misafir & iş ortağı)' },
      { href: '/admin/department-rules', icon: 'book-outline', label: 'Bölüm Kuralları' },
      { href: '/admin/organizations', icon: 'business-outline', label: 'İşletme yönetimi' },
      { href: '/admin/qr-designs', icon: 'qr-code-outline', label: 'QR Merkezi' },
    ],
  },
];

function staffQuickActionsFor(staff: ReturnType<typeof useAuthStore.getState>['staff']): SectionItem[] {
  const items: SectionItem[] = [];
  if (canAccessAdminRoute(staff, '/admin/staff/list')) {
    items.push({ href: '/admin/staff/list', icon: 'people-outline', label: 'Kullanıcılar listesi' });
  }
  if (canAccessAdminRoute(staff, '/admin/staff')) {
    items.push({ href: '/admin/staff/add', icon: 'person-add-outline', label: 'Çalışan ekle' });
  }
  if (canAccessAdminRoute(staff, '/admin/staff')) {
    items.push({ href: '/admin/staff/pending', icon: 'checkmark-done-outline', label: 'Onay bekleyen başvurular', badge: 0 });
  }
  return items;
}

function adminSectionsForUi() {
  if (isKbsUiEnabled()) return SECTIONS;
  return SECTIONS.map((sec) => ({
    ...sec,
    items: sec.items.filter((i) => {
      if (!i.href.includes('/admin/kbs')) return true;
      return i.href === '/admin/kbs-settings' || i.href === '/admin/kbs-permissions';
    }),
  }));
}

const AnimatedPressable = Animated.createAnimatedComponent(TouchableOpacity);

function normalizeSearchText(text: string) {
  return text
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/\s+/g, ' ')
    .trim();
}

const AdminMenuButton = memo(function AdminMenuButton({
  item,
  badge,
  isLast,
  onPress,
  tint,
  delay = 0,
}: {
  item: SectionItem;
  badge?: number;
  isLast: boolean;
  onPress: () => void;
  tint: { bg: string; icon: string };
  delay?: number;
}) {
  const showBadge = badge != null && badge > 0;

  return (
    <TouchableOpacity
      style={[styles.menuRow, !isLast && styles.menuRowSpacing]}
      onPress={onPress}
        activeOpacity={0.9}
      >
        <View style={[styles.menuIconWrap, { backgroundColor: tint.bg }]}>
          <Ionicons name={item.icon} size={22} color={tint.icon} />
        </View>
        <Text style={styles.menuLabel} numberOfLines={2}>
          {item.label}
        </Text>
        <View style={styles.menuRowRight}>
          {showBadge ? (
            <View style={styles.menuBadge}>
              <Text style={styles.menuBadgeText}>{badge > 99 ? '99+' : badge}</Text>
            </View>
          ) : null}
          <Ionicons name="chevron-forward" size={18} color={tint.icon} />
        </View>
      </TouchableOpacity>
  );
});

export default function AdminDashboard() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { staff } = useAuthStore();
  const canIdCapture = canStaffUseIdCapture(staff);
  const { selectedOrganizationId } = useAdminOrgStore();
  const adminSections = useMemo(() => {
    const base = adminSectionsForUi();
    const allowTech = canAccessTechnicalAssetsAdminRoutes(staff);
    return base
      .map((sec) => ({
        ...sec,
        items: sec.items.filter((item) => {
          if (item.href === '/admin/technical-assets') return allowTech;
          if (item.href === '/admin/permissions' || item.href === '/admin/profile') return true;
          return canAccessAdminRoute(staff, item.href);
        }),
      }))
      .filter((sec) => sec.items.length > 0);
  }, [staff]);
  const loadInFlightRef = useRef(false);
  const canUseAllForCache = Boolean(staff?.app_permissions?.super_admin || staff?.role === 'admin');
  const orgIdForCache = canUseAllForCache ? selectedOrganizationId : staff?.organization_id;
  const orgScopedForCache = orgIdForCache && orgIdForCache !== 'all' ? orgIdForCache : null;
  const dashboardCacheKey = staff?.id
    ? adminDashboardCacheKey(staff.id, canUseAllForCache, orgScopedForCache)
    : '';
  const initialDashboardCached = dashboardCacheKey
    ? getAdminDashboardCache(dashboardCacheKey, true)
    : null;
  const [stats, setStats] = useState<Stats>(initialDashboardCached ?? EMPTY_STATS);
  const [refreshing, setRefreshing] = useState(false);
  const [homeHeavyReady, setHomeHeavyReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<TextInputType>(null);
  const searchPulse = useRef(new Animated.Value(1)).current;
  const loadRunIdRef = useRef(0);
  const isAndroidDebug = __DEV__ && Platform.OS === 'android';

  useEffect(() => {
    if (!isAndroidDebug) return;
    log.info('AdminDashboard', 'mounted', { width });
    return () => {
      log.info('AdminDashboard', 'unmounted');
    };
  }, [isAndroidDebug, width]);

  const load = useCallback(async (opts?: { silent?: boolean; force?: boolean }) => {
    if (!staff?.id) return;
    if (loadInFlightRef.current) {
      if (isAndroidDebug) log.info('AdminDashboard', 'load skipped (in flight)');
      return;
    }
    const canUseAll = Boolean(staff?.app_permissions?.super_admin || staff?.role === 'admin');
    const orgId = canUseAll ? selectedOrganizationId : staff.organization_id;
    const orgScoped = orgId && orgId !== 'all' ? orgId : null;
    const cacheKey = adminDashboardCacheKey(staff.id, canUseAll, orgScoped);
    await hydrateAdminDashboardCache(cacheKey);
    const hit = getAdminDashboardCache(cacheKey, true);
    if (hit) setStats(hit);

    if (shouldSkipAdminDashboardNetwork(cacheKey, opts?.force)) {
      if (isAndroidDebug) log.info('AdminDashboard', 'load skipped (cache fresh)');
      if (shouldRefreshAdminMessagesUnread(cacheKey, opts?.force)) {
        void fetchStaffMessagingUnreadCount(staff.id)
          .then((messagesUnread) => {
            patchAdminDashboardMessagesUnread(cacheKey, messagesUnread);
            setStats((prev) => ({ ...prev, messagesUnread }));
          })
          .catch(() => {});
      }
      return;
    }

    if (!opts?.silent && hit) {
      setStats(hit);
    }
    loadInFlightRef.current = true;
    const startedAt = Date.now();
    const loadRunId = ++loadRunIdRef.current;
    if (isAndroidDebug) log.info('AdminDashboard', 'load start', { staffId: staff.id });
    try {
      let roomsQuery = supabase.from('rooms').select('*', { count: 'exact', head: true });
      let roomsOccupiedQuery = supabase.from('rooms').select('*', { count: 'exact', head: true }).eq('status', 'occupied');
      let guestsQuery = supabase.from('guests').select('id', { count: 'exact', head: true }).eq('status', 'checked_in');
      let staffActiveQuery = supabase.from('staff').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('is_online', true);
      let stockPendingQuery = supabase.from('stock_movements').select('id', { count: 'exact', head: true }).eq('status', 'pending');
      let staffPendingQuery = supabase.from('staff_applications').select('id', { count: 'exact', head: true }).eq('status', 'pending');
      let expensesPendingQuery = supabase.from('staff_expenses').select('id', { count: 'exact', head: true }).eq('status', 'pending');
      let acceptancesUnassignedQuery = supabase.from('contract_acceptances').select('id', { count: 'exact', head: true }).is('assigned_staff_id', null);
      if (orgScoped) {
        roomsQuery = roomsQuery.eq('organization_id', orgScoped);
        roomsOccupiedQuery = roomsOccupiedQuery.eq('organization_id', orgScoped);
        guestsQuery = guestsQuery.eq('organization_id', orgScoped);
        staffActiveQuery = staffActiveQuery.eq('organization_id', orgScoped);
        stockPendingQuery = stockPendingQuery.eq('organization_id', orgScoped);
        // staff_applications işletme kolonu yok — genel başvurular, onay merkezinde filtresiz
        expensesPendingQuery = expensesPendingQuery.eq('organization_id', orgScoped);
        acceptancesUnassignedQuery = acceptancesUnassignedQuery.eq('organization_id', orgScoped);
      }
      const complaintsPendingPromise = countPendingGuestComplaints(orgScoped ?? undefined).then((count) => ({
        count,
      }));
      const [
        roomsRes,
        roomsOccupiedRes,
        guestsRes,
        staffRes,
        stockRes,
        staffPendingRes,
        expensesPendingRes,
        unreadRes,
        feedCountRes,
        reportsPendingRes,
        complaintsPendingRes,
        acceptancesUnassignedRes,
      ] = await Promise.all([
        roomsQuery,
        roomsOccupiedQuery,
        guestsQuery,
        staffActiveQuery,
        stockPendingQuery,
        staffPendingQuery,
        expensesPendingQuery,
        supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('staff_id', staff.id).is('read_at', null),
        supabase.from('feed_posts').select('id', { count: 'exact', head: true }),
        supabase.from('feed_post_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        complaintsPendingPromise,
        acceptancesUnassignedQuery,
      ]);

      setStats((prev) => {
        const next: Stats = {
          roomsTotal: roomsRes.count ?? 0,
          roomsOccupied: roomsOccupiedRes.count ?? 0,
          guestsActive: guestsRes.count ?? 0,
          staffActive: staffRes.count ?? 0,
          stockPending: stockRes.count ?? 0,
          staffPending: staffPendingRes.count ?? 0,
          expensesPending: expensesPendingRes.count ?? 0,
          unreadNotifs: unreadRes.count ?? 0,
          messagesUnread: prev.messagesUnread,
          feedTotal: feedCountRes.count ?? 0,
          reportsPending: reportsPendingRes.count ?? 0,
          complaintsPending: complaintsPendingRes.count ?? 0,
          acceptancesUnassigned: acceptancesUnassignedRes.count ?? 0,
        };
        setAdminDashboardCache(cacheKey, next);
        return next;
      });

      if (shouldRefreshAdminMessagesUnread(cacheKey, opts?.force)) {
        void fetchStaffMessagingUnreadCount(staff.id)
          .then((messagesUnread) => {
            if (loadRunId !== loadRunIdRef.current) return;
            patchAdminDashboardMessagesUnread(cacheKey, messagesUnread);
            setStats((prev) => ({ ...prev, messagesUnread }));
          })
          .catch(() => {});
      }
      if (isAndroidDebug) {
        log.info('AdminDashboard', 'load success', { elapsedMs: Date.now() - startedAt });
      }
    } catch (e) {
      log.error('AdminDashboard', 'load failed', e);
    } finally {
      loadInFlightRef.current = false;
    }
  }, [isAndroidDebug, selectedOrganizationId, staff?.app_permissions?.super_admin, staff?.id, staff?.organization_id, staff?.role]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const task = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => {
        if (!cancelled) setHomeHeavyReady(true);
      }, ADMIN_HOME_DEFER_MS);
    });
    return () => {
      cancelled = true;
      task.cancel();
      if (timer) clearTimeout(timer);
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!staff?.id) return;
      let cancelled = false;
      const task = InteractionManager.runAfterInteractions(() => {
        void (async () => {
          const canUseAll = Boolean(staff?.app_permissions?.super_admin || staff?.role === 'admin');
          const orgId = canUseAll ? selectedOrganizationId : staff.organization_id;
          const orgScoped = orgId && orgId !== 'all' ? orgId : null;
          const cacheKey = adminDashboardCacheKey(staff.id, canUseAll, orgScoped);
          const disk = await hydrateAdminDashboardCache(cacheKey);
          if (cancelled) return;
          const stale = disk ?? getAdminDashboardCache(cacheKey, true);
          if (stale) setStats(stale);
          if (shouldSkipAdminDashboardNetwork(cacheKey)) return;
          await load({ silent: Boolean(stale) });
        })();
      });
      return () => {
        cancelled = true;
        task.cancel();
      };
    }, [load, selectedOrganizationId, staff?.app_permissions?.super_admin, staff?.id, staff?.organization_id, staff?.role])
  );

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        exitAdminPanelToStaffTabs(router);
        return true;
      });
      return () => sub.remove();
    }, [router])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (staff?.id) {
      const canUseAll = Boolean(staff?.app_permissions?.super_admin || staff?.role === 'admin');
      const orgId = canUseAll ? selectedOrganizationId : staff.organization_id;
      const orgScoped = orgId && orgId !== 'all' ? orgId : null;
      invalidateAdminDashboardCache(adminDashboardCacheKey(staff.id, canUseAll, orgScoped));
    } else {
      invalidateAdminDashboardCache();
    }
    await load({ force: true });
    setRefreshing(false);
  }, [load, selectedOrganizationId, staff?.app_permissions?.super_admin, staff?.id, staff?.organization_id, staff?.role]);

  const contentWidth = width - H_PAD * 2;
  const normalizedQuery = normalizeSearchText(searchQuery);

  const { getEffectiveBadge, setDismissed } = useAdminBadgeDismissedStore();

  const getBadgeKey = (href: string): keyof typeof stats | 'approvalsTotal' | null => {
    if (href === '/admin/approvals') return 'approvalsTotal';
    if (href === '/admin/stock/approvals') return 'stockPending';
    if (href === '/admin/staff' || href === '/admin/staff/pending') return 'staffPending';
    if (href === '/admin/expenses') return 'expensesPending';
    if (href === '/admin/reports') return 'reportsPending';
    if (href === '/admin/complaints') return 'complaintsPending';
    if (href === '/admin/contracts') return 'acceptancesUnassigned';
    return null;
  };

  const totalApprovals = useMemo(
    () =>
      stats.staffPending +
      stats.stockPending +
      stats.expensesPending +
      stats.reportsPending +
      stats.acceptancesUnassigned,
    [stats]
  );

  const approvalsHubBadge = getEffectiveBadge('approvalsTotal', totalApprovals);

  const lastKnownApprovalsTotalRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = lastKnownApprovalsTotalRef.current;
    if (prev !== null && totalApprovals > prev && Platform.OS !== 'android') {
      Alert.alert(
        'Yeni onay bekleyen işlem',
        `Bekleyen toplam kayıt: ${totalApprovals} (önceki: ${prev}). Birleşik listeden inceleyebilirsiniz.`,
        [
          { text: 'Tamam', style: 'cancel' },
          { text: 'Onay merkezi', onPress: () => router.push('/admin/approvals' as never) },
        ]
      );
    }
    lastKnownApprovalsTotalRef.current = totalApprovals;
  }, [router, totalApprovals]);

  const getBadge = (item: SectionItem): number | undefined => {
    const key = getBadgeKey(item.href);
    if (!key) return undefined;
    const raw = key === 'approvalsTotal' ? totalApprovals : stats[key as keyof typeof stats];
    if (raw == null) return undefined;
    const effective = getEffectiveBadge(key as any, raw);
    return effective > 0 ? effective : undefined;
  };

  const getSectionBadge = (items: SectionItem[]): number | undefined => {
    const total = items.reduce((sum, item) => sum + (getBadge(item) ?? item.badge ?? 0), 0);
    return total > 0 ? total : undefined;
  };

  const handleTilePress = (item: SectionItem) => {
    if (isAndroidDebug) {
      log.info('AdminDashboard', 'tile press', { href: item.href, label: item.label });
    }
    const key = getBadgeKey(item.href);
    if (key) {
      const raw = key === 'approvalsTotal' ? totalApprovals : stats[key as keyof typeof stats];
      if (raw != null && raw > 0) setDismissed(key as any, raw);
    }
    router.push(item.href as any);
  };

  const staffQuickActions = useMemo(() => staffQuickActionsFor(staff), [staff]);

  const searchItems = useMemo(() => {
    const unique = new Map<string, SectionItem & { sectionTitle: string; searchText: string; quickTokens: string[] }>();
    const addItems = (items: SectionItem[], sectionTitle: string) => {
      items.forEach((item) => {
        if (unique.has(item.href)) return;
        const quickTokens = [
          ...item.label.split(' '),
          ...sectionTitle.split(' '),
          item.href.replaceAll('/', ' '),
        ].map(normalizeSearchText).filter(Boolean);
        const searchText = normalizeSearchText(`${item.label} ${sectionTitle} ${item.href}`);
        unique.set(item.href, { ...item, sectionTitle, searchText, quickTokens });
      });
    };
    addItems(staffQuickActions, 'Hızlı Personel Erişimi');
    adminSections.forEach((section) => addItems(section.items, section.title));
    return Array.from(unique.values());
  }, [adminSections, staffQuickActions]);

  const searchResults = useMemo(() => {
    if (!normalizedQuery) return [];
    const queryTokens = normalizedQuery.split(' ').filter(Boolean);
    return searchItems
      .map((item) => {
        const startsWith = item.searchText.startsWith(normalizedQuery) ? 1 : 0;
        const includes = item.searchText.includes(normalizedQuery) ? 1 : 0;
        const tokenHits = queryTokens.filter((token) => item.quickTokens.some((s) => s.includes(token))).length;
        const score = startsWith * 100 + includes * 50 + tokenHits * 10;
        return { item, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.item)
      .slice(0, 8);
  }, [normalizedQuery, searchItems]);

  useEffect(() => {
    if (!normalizedQuery) {
      searchPulse.stopAnimation();
      searchPulse.setValue(1);
      return;
    }
    if (Platform.OS === 'android') {
      // Android'de sürekli pulse animasyonu eski cihazlarda ekstra GPU/JS yükü oluşturabiliyor.
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(searchPulse, {
          toValue: 1.06,
          duration: 320,
          useNativeDriver: true,
        }),
        Animated.timing(searchPulse, {
          toValue: 1,
          duration: 320,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [normalizedQuery, searchPulse]);

  const handleSearchPress = () => {
    if (!normalizedQuery || searchResults.length === 0) return;
    const first = searchResults[0];
    setSearchQuery('');
    handleTilePress(first);
  };

  return (
    <>
    <StatusBar style="light" />
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      removeClippedSubviews={Platform.OS === 'android'}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={adminTheme.colors.accent} />
      }
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.heroWrap, { width }]}>
        <LinearGradient
          colors={['#0f172a', '#1e3a5f', '#0f172a']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroGradient, { paddingTop: insets.top + 6 }]}
        >
          <View style={styles.heroNavRow}>
            <TouchableOpacity
              onPress={() => exitAdminPanelToStaffTabs(router)}
              style={styles.heroNavBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel={t('back')}
            >
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={styles.heroNavRight}>
              {canIdCapture ? (
                <TouchableOpacity
                  onPress={() => router.push('/staff/kbs/capture-id' as Href)}
                  style={styles.heroNavBtn}
                  activeOpacity={0.8}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityLabel="Kimlik çekim"
                >
                  <Ionicons name="id-card-outline" size={20} color="#fff" />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={() => router.push('/admin/map')}
                style={styles.heroNavBtn}
                activeOpacity={0.8}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Harita"
              >
                <Ionicons name="map-outline" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.heroTopRow}>
            <View style={styles.heroTitleBlock}>
              <Text style={styles.heroKicker}>YÖNETİM PANELİ</Text>
              <Text style={styles.heroTitle} numberOfLines={1}>
                {staff?.full_name ?? 'Admin'}
              </Text>
              <Text style={styles.heroSub} numberOfLines={1}>
                {totalApprovals > 0
                  ? `${totalApprovals} bekleyen onay · Hızlı arama ile modüle gidin`
                  : 'Modül ara veya aşağıdaki kategorilerden seçin'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.heroIconBtn}
              onPress={() => {
                setDismissed('approvalsTotal', totalApprovals);
                router.push('/admin/approvals' as never);
              }}
              accessibilityLabel="Onay merkezi"
            >
              <Ionicons name="shield-checkmark" size={20} color="#fff" />
              {approvalsHubBadge > 0 ? (
                <View style={styles.heroIconBadge}>
                  <Text style={styles.heroIconBadgeText}>{approvalsHubBadge > 99 ? '99+' : approvalsHubBadge}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.searchHeroBox}
            activeOpacity={1}
            onPress={() => searchInputRef.current?.focus()}
            accessibilityRole="search"
            accessibilityLabel="Panelde ara"
          >
            <View style={styles.searchHeroIconWrap}>
              <Ionicons name="search" size={18} color={adminTheme.colors.accent} />
            </View>
            <TextInput
              ref={searchInputRef}
              style={styles.searchHeroInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Ara: personel, stok, oda, maaş, şikayet..."
              placeholderTextColor="#94a3b8"
              returnKeyType="search"
              onSubmitEditing={handleSearchPress}
            />
            {searchQuery ? (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Aramayı temizle"
              >
                <Ionicons name="close-circle" size={20} color="#94a3b8" />
              </TouchableOpacity>
            ) : (
              <AnimatedPressable
                style={[styles.searchGoBtn, normalizedQuery ? styles.searchGoBtnActive : null, normalizedQuery ? { transform: [{ scale: searchPulse }] } : null]}
                onPress={handleSearchPress}
                activeOpacity={0.85}
                accessibilityLabel="Ara"
              >
                <Ionicons name="arrow-forward" size={16} color={normalizedQuery ? '#fff' : '#64748b'} />
              </AnimatedPressable>
            )}
          </TouchableOpacity>

          {!normalizedQuery ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.heroStatsRow}>
              <TouchableOpacity style={styles.heroStatPill} onPress={() => router.push('/admin/rooms' as never)}>
                <Ionicons name="bed-outline" size={14} color="#38bdf8" />
                <Text style={styles.heroStatText}>
                  {stats.roomsOccupied}/{stats.roomsTotal} oda
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.heroStatPill} onPress={() => router.push('/admin/guests' as never)}>
                <Ionicons name="people-outline" size={14} color="#34d399" />
                <Text style={styles.heroStatText}>{stats.guestsActive} misafir</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.heroStatPill} onPress={() => router.push('/admin/staff/list' as never)}>
                <Ionicons name="person-outline" size={14} color="#a78bfa" />
                <Text style={styles.heroStatText}>{stats.staffActive} aktif</Text>
              </TouchableOpacity>
              {totalApprovals > 0 ? (
                <TouchableOpacity
                  style={[styles.heroStatPill, styles.heroStatPillWarn]}
                  onPress={() => router.push('/admin/approvals' as never)}
                >
                  <Ionicons name="alert-circle-outline" size={14} color="#fca5a5" />
                  <Text style={[styles.heroStatText, { color: '#fecaca' }]}>{totalApprovals} onay</Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          ) : null}

          {!normalizedQuery ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.searchShortcutRow}>
              {SEARCH_SHORTCUTS.map((s) => (
                <TouchableOpacity key={s.query} style={styles.searchShortcutChip} onPress={() => setSearchQuery(s.query)}>
                  <Text style={styles.searchShortcutText}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : null}
        </LinearGradient>
      </View>

      {normalizedQuery ? (
        <View style={[styles.searchSuggestions, { width: contentWidth }]}>
          {searchResults.length === 0 ? (
            <Text style={styles.searchEmptyText}>Sonuç bulunamadı. Farklı bir kelime deneyin.</Text>
          ) : (
            searchResults.map((item, idx) => (
              <TouchableOpacity
                key={`search:${item.href}`}
                style={[styles.searchResultRow, idx === searchResults.length - 1 && styles.searchResultRowLast]}
                activeOpacity={0.85}
                onPress={() => {
                  setSearchQuery('');
                  handleTilePress(item);
                }}
              >
                <View style={[styles.searchResultIconWrap, { backgroundColor: (SECTION_TINTS[item.sectionTitle]?.bg ?? '#f1f5f9') }]}>
                  <Ionicons name={item.icon} size={18} color={SECTION_TINTS[item.sectionTitle]?.icon ?? adminTheme.colors.accent} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.searchResultTitle} numberOfLines={1}>
                    {item.label}
                  </Text>
                  <Text style={styles.searchResultSub} numberOfLines={1}>
                    {item.sectionTitle}
                  </Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color={adminTheme.colors.textMuted} />
              </TouchableOpacity>
            ))
          )}
        </View>
      ) : null}

      <AdminOrganizationPicker
        canUseAll={Boolean(staff?.app_permissions?.super_admin || staff?.role === 'admin')}
        ownOrganizationId={staff?.organization_id}
      />
      {homeHeavyReady && ADMIN_HOME_LIVE_OPS_STRIP ? (
        <AdminLiveOpsStrip refreshKey={refreshing ? Date.now() : 0} />
      ) : null}

      <TouchableOpacity
        style={[styles.approvalsHubCard, { width: contentWidth }]}
        activeOpacity={0.88}
        onPress={() => {
          setDismissed('approvalsTotal', totalApprovals);
          router.push('/admin/approvals' as never);
        }}
      >
        <View style={styles.approvalsHubIconWrap}>
          <Ionicons name="shield-checkmark-outline" size={26} color="#0f766e" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.approvalsHubKicker}>Yönetim</Text>
          <Text style={styles.approvalsHubTitle}>Onay merkezi</Text>
          <Text style={styles.approvalsHubSub} numberOfLines={2}>
            {totalApprovals > 0
              ? 'Personel başvurusu, stok, harcama, paylaşım bildirimi ve sözleşme ataması — tek listede inceleyin.'
              : 'Şu an bekleyen onay yok. Yeni başvuru veya hareket geldiğinde burada listelenir.'}
          </Text>
          <Text style={styles.approvalsHubMeta}>
            {totalApprovals > 0
              ? `Bekleyen: ${totalApprovals} kayıt · Detay için dokunun`
              : 'Bekleyen kayıt yok'}
          </Text>
        </View>
        {approvalsHubBadge > 0 ? (
          <View style={styles.approvalsHubBadge}>
            <Text style={styles.approvalsHubBadgeText}>{approvalsHubBadge > 99 ? '99+' : approvalsHubBadge}</Text>
          </View>
        ) : null}
        <Ionicons name="chevron-forward" size={22} color={adminTheme.colors.textMuted} />
      </TouchableOpacity>

      {staffQuickActions.length > 0 ? (
      <View style={styles.section}>
        <AdminCard padded={false} elevated premium auraColor="#3730a3">
          <View style={styles.sectionHeadPadded}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionTitleLeft}>
                <View style={[styles.sectionIconWrap, { backgroundColor: '#eef2ff' }]}>
                  <Ionicons name="people-circle-outline" size={16} color="#3730a3" />
                </View>
                <Text style={styles.sectionTitle}>Hızlı Personel Erişimi</Text>
              </View>
            </View>
            <Text style={styles.sectionSubtitle}>Çalışan yönetimi için en sık kullanılan işlemler</Text>
          </View>
          <View style={styles.menuList}>
            {staffQuickActions.map((item, idx) => {
              const badge = getBadge(item) ?? item.badge;
              const isLast = idx === staffQuickActions.length - 1;
              return (
                <AdminMenuButton
                  key={`staff-quick:${item.href}`}
                  item={item}
                  badge={badge}
                  isLast={isLast}
                  onPress={() => handleTilePress(item)}
                  tint={{ bg: '#eef2ff', icon: '#3730a3' }}
                  delay={Math.min(180, idx * 18)}
                />
              );
            })}
          </View>
        </AdminCard>
      </View>
      ) : null}

      {adminSections.map((section, sectionIdx) => {
        const sectionTint = SECTION_TINTS[section.title] ?? {
          bg: adminTheme.colors.surfaceSecondary,
          icon: adminTheme.colors.textMuted,
        };
        return (
          <View key={section.title} style={styles.section}>
            <AdminCard padded={false} elevated premium auraColor={sectionTint.icon}>
              <View style={styles.sectionHeadPadded}>
                {(() => {
                  const sectionBadge = getSectionBadge(section.items);
                  const tint = SECTION_TINTS[section.title] ?? {
                    bg: adminTheme.colors.surfaceSecondary,
                    icon: adminTheme.colors.textMuted,
                  };
                  return (
                    <View style={styles.sectionTitleRow}>
                      <View style={styles.sectionTitleLeft}>
                        <View style={[styles.sectionIconWrap, { backgroundColor: tint.bg }]}>
                          <Ionicons name={section.icon} size={16} color={tint.icon} />
                        </View>
                        <Text style={styles.sectionTitle}>{section.title}</Text>
                      </View>
                      {sectionBadge ? (
                        <View style={styles.sectionBadge}>
                          <Text style={styles.sectionBadgeText}>
                            {sectionBadge > 99 ? '99+' : sectionBadge}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })()}
                {section.subtitle ? <Text style={styles.sectionSubtitle}>{section.subtitle}</Text> : null}
              </View>
              <View style={styles.menuList}>
                {section.items.map((item, idx) => {
                  const badge = getBadge(item) ?? item.badge;
                  const isLast = idx === section.items.length - 1;
                  return (
                    <AdminMenuButton
                      key={`${section.title}:${item.href}`}
                      item={item}
                      badge={badge}
                      isLast={isLast}
                      onPress={() => handleTilePress(item)}
                      tint={sectionTint}
                      delay={Math.min(220, sectionIdx * 40 + idx * 22)}
                    />
                  );
                })}
              </View>
            </AdminCard>
          </View>
        );
      })}
    </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  content: {
    paddingHorizontal: H_PAD,
    paddingTop: 0,
  },
  heroWrap: {
    marginHorizontal: -H_PAD,
    marginBottom: 16,
  },
  heroGradient: {
    paddingHorizontal: H_PAD,
    paddingBottom: 18,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  heroNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  heroNavRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heroNavBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  heroTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  heroKicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: 'rgba(148,163,184,0.95)',
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.4,
  },
  heroSub: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(203,213,225,0.88)',
    marginTop: 4,
    lineHeight: 17,
  },
  heroIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIconBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: adminTheme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0f172a',
  },
  heroIconBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  searchHeroBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#fff',
    ...((Platform.OS === 'ios' ? adminTheme.shadow.lg : { elevation: 6 }) as ViewStyle),
  },
  searchHeroIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#fff7ed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchHeroInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: adminTheme.colors.text,
    paddingVertical: 8,
  },
  searchGoBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  searchGoBtnActive: {
    backgroundColor: adminTheme.colors.accent,
  },
  heroStatsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 12,
  },
  heroStatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  heroStatPillWarn: {
    backgroundColor: 'rgba(185,28,28,0.22)',
    borderColor: 'rgba(252,165,165,0.35)',
  },
  heroStatText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#e2e8f0',
  },
  searchShortcutRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 10,
  },
  searchShortcutChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  searchShortcutText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#cbd5e1',
  },
  searchSuggestions: {
    marginTop: -6,
    marginBottom: 14,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: adminTheme.colors.borderLight,
    overflow: 'hidden',
    ...((Platform.OS === 'ios' ? adminTheme.shadow.md : { elevation: 4 }) as ViewStyle),
  },
  searchResultRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.borderLight,
  },
  searchResultRowLast: {
    borderBottomWidth: 0,
  },
  searchResultIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchResultTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: adminTheme.colors.text,
  },
  searchResultSub: {
    fontSize: 12,
    color: adminTheme.colors.textMuted,
    marginTop: 2,
  },
  searchEmptyText: {
    fontSize: 13,
    color: adminTheme.colors.textSecondary,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  approvalsHubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f8fffd',
    borderRadius: adminTheme.radius.lg,
    paddingVertical: 16,
    paddingHorizontal: 15,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#bae6dd',
    ...((Platform.OS === 'ios' ? adminTheme.shadow.md : { elevation: 4 }) as ViewStyle),
  },
  approvalsHubIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#ccfbf1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  approvalsHubKicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#0f766e',
    textTransform: 'uppercase',
  },
  approvalsHubTitle: { fontSize: 16, fontWeight: '900', color: adminTheme.colors.text },
  approvalsHubSub: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textSecondary, marginTop: 4, lineHeight: 17 },
  approvalsHubMeta: { fontSize: 12, fontWeight: '700', color: '#0f766e', marginTop: 8 },
  approvalsHubBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 7,
    backgroundColor: adminTheme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approvalsHubBadgeText: { fontSize: 12, fontWeight: '900', color: '#fff' },
  section: {
    marginBottom: 16,
  },
  sectionHeadPadded: {
    paddingHorizontal: adminTheme.spacing.lg,
    paddingTop: adminTheme.spacing.lg,
    paddingBottom: adminTheme.spacing.sm,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: adminTheme.colors.text,
    letterSpacing: -0.2,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  sectionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: adminTheme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  sectionBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: adminTheme.colors.textMuted,
    marginTop: 4,
    lineHeight: 18,
  },

  menuList: {
    paddingBottom: 4,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: adminTheme.spacing.lg,
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: adminTheme.colors.borderLight,
  },
  menuRowSpacing: {
    marginBottom: 8,
  },
  menuIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: adminTheme.colors.text,
    lineHeight: 21,
    paddingRight: 8,
  },
  menuRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: adminTheme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
    marginRight: 6,
  },
  menuBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
});
