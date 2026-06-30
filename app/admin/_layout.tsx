import { useEffect, useCallback, useRef } from 'react';
import { View, TouchableOpacity, Platform, StyleSheet, Text, BackHandler, InteractionManager } from 'react-native';
import { Stack, useRouter, useNavigation, useFocusEffect, usePathname, useRootNavigationState, type Href } from 'expo-router';
import { safeRouterReplace } from '@/lib/safeRouter';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import {
  canAccessAdminShell,
  canAccessAdminPayments,
  canAccessManagedContractsAdminRoutes,
  canAccessDepartmentRulesAdminRoutes,
  canCreateDepartmentRules,
  canManageManagedContracts,
  isDepartmentRulesAdminPath,
} from '@/lib/staffPermissions';
import { canAccessAdminRoute, hasAnyAdminModulePermission, isGorevAtaOnlyUser } from '@/lib/adminRoutePermissions';
import { canStaffUseIdCapture, canStaffViewKbsCaptureHistory } from '@/lib/kbsMrzAccess';
import { useStaffNotificationStore } from '@/stores/staffNotificationStore';
import { adminTheme } from '@/constants/adminTheme';
import { Ionicons } from '@expo/vector-icons';
import { complaintsText } from '@/lib/complaintsI18n';
import { log } from '@/lib/logger';
import { savePushTokenForStaff } from '@/lib/notificationsPush';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import {
  adminDashboardCacheKey,
  hydrateAdminDashboardCache,
  shouldSkipAdminDashboardNetwork,
} from '@/lib/adminDashboardCache';
import { exitAdminPanelToStaffTabs, signalStaffExitedAdminPanelFromRoot } from '@/lib/staffAdminTabNavigation';
import {
  AdminStackBackButton,
  adminStackGestureForNavigation,
  isAdminKitchenOpsHubPath,
  navigateAdminBack,
  navigateAdminKitchenOpsHubBack,
} from '@/lib/adminStackBack';

export default function AdminLayout() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const pathname = usePathname();
  const rootNavigationState = useRootNavigationState();
  const navigationReady = rootNavigationState?.key != null;
  const adminRootExitInFlightRef = useRef(false);

  /**
   * Android: router.back() çoğu zaman personel sekmesindeki /staff/admin placeholder'a düşer;
   * sekme tekrar odaklanınca /admin yeniden push edilir (geri "tutmuyor" hissi).
   * Doğrudan personel köküne replace ile çıkış tek adımda ve tutarlı olur.
   */
  const handleAdminBack = useCallback(() => {
    if (adminRootExitInFlightRef.current) return;
    adminRootExitInFlightRef.current = true;
    exitAdminPanelToStaffTabs(router);
  }, [router]);

  const isAdminRootPath =
    pathname === '/admin' || pathname === '/admin/' || pathname === '/admin/index';

  /** Android donanım geri: kök panelde personel sekmesine çık (beforeRemove kullanma — native/JS desync). */
  useEffect(() => {
    if (Platform.OS !== 'android' || !isAdminRootPath) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleAdminBack();
      return true;
    });
    return () => sub.remove();
  }, [isAdminRootPath, handleAdminBack]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      adminRootExitInFlightRef.current = false;
    });
    return unsub;
  }, [navigation]);

  /** Native pop ile /admin kapanırsa otomatik yeniden açılmasın (geri butonu zaten suppress set eder). */
  useEffect(() => {
    return () => {
      signalStaffExitedAdminPanelFromRoot();
    };
  }, []);

  /** iOS: kök yığından kaydırarak çıkışı geri butonuyla aynı yola yönlendir. */
  useEffect(() => {
    if (Platform.OS !== 'ios' || !isAdminRootPath) return;
    const parent = navigation.getParent();
    if (!parent) return;
    const unsub = parent.addListener('beforeRemove', (e) => {
      const stackState = navigation.getState();
      if ((stackState?.routes?.length ?? 0) > 1) return;
      e.preventDefault();
      handleAdminBack();
    });
    return unsub;
  }, [navigation, isAdminRootPath, handleAdminBack]);

  const handleSubScreenBack = useCallback(() => {
    if (isAdminKitchenOpsHubPath(pathname)) {
      navigateAdminKitchenOpsHubBack(router, navigation);
      return;
    }
    navigateAdminBack(router, navigation, pathname);
  }, [navigation, router, pathname]);

  const renderSubScreenBack = useCallback(
    () => <AdminStackBackButton accessibilityLabel={t('back')} />,
    [t]
  );

  /** Android donanım geri: alt sayfada stack yoksa modül köküne / panele dön. */
  useEffect(() => {
    if (Platform.OS !== 'android' || isAdminRootPath) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleSubScreenBack();
      return true;
    });
    return () => sub.remove();
  }, [isAdminRootPath, handleSubScreenBack]);

  /** Belge detayı: replace ile açıldığında stack boş kalmasın; yoksa tüm belgelere dön. */
  const renderDocumentDetailBack = () => (
    <TouchableOpacity
      onPress={() => {
        if (navigation.canGoBack()) {
          router.back();
        } else {
          router.replace('/admin/documents/all' as never);
        }
      }}
      style={{ marginLeft: 8, padding: 8 }}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityLabel={t('back')}
    >
      <Ionicons name="arrow-back" size={24} color={adminTheme.colors.text} />
    </TouchableOpacity>
  );
  const { staff, loading } = useAuthStore();
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);

  const refreshNotifications = useStaffNotificationStore((s) => s.refresh);

  useEffect(() => {
    if (!__DEV__ || Platform.OS !== 'android') return;
    log.info('AdminLayout', 'mounted', { pathname });
    return () => {
      log.info('AdminLayout', 'unmounted');
    };
  }, []);

  useEffect(() => {
    if (!__DEV__ || Platform.OS !== 'android') return;
    log.info('AdminLayout', 'route changed', { pathname });
  }, [pathname]);

  useEffect(() => {
    if (!__DEV__ || Platform.OS !== 'android') return;
    log.info('AdminLayout', 'auth snapshot', {
      loading,
      hasStaff: !!staff,
      staffId: staff?.id ?? null,
      role: staff?.role ?? null,
    });
  }, [loading, staff?.id, staff?.role]);

  useFocusEffect(
    useCallback(() => {
      if (!isAdminRootPath || !staff?.id) return;
      let cancelled = false;
      const task = InteractionManager.runAfterInteractions(() => {
        void (async () => {
          const canUseAll = Boolean(staff.app_permissions?.super_admin || staff.role === 'admin');
          const orgId = canUseAll ? selectedOrganizationId : staff.organization_id;
          const orgScoped = orgId && orgId !== 'all' ? orgId : null;
          const cacheKey = adminDashboardCacheKey(staff.id, canUseAll, orgScoped);
          await hydrateAdminDashboardCache(cacheKey);
          if (cancelled) return;
          if (shouldSkipAdminDashboardNetwork(cacheKey)) return;
          await refreshNotifications();
        })().catch(() => {});
      });
      return () => {
        cancelled = true;
        task.cancel();
      };
    }, [refreshNotifications, isAdminRootPath, selectedOrganizationId, staff?.app_permissions?.super_admin, staff?.id, staff?.organization_id, staff?.role])
  );

  /** Admin panelde push token kaydı (köke sadece personel sekmesinde girilmediyse). */
  useEffect(() => {
    if (!staff?.id || !canAccessAdminShell(staff)) return;
    savePushTokenForStaff(staff.id).catch((e) => log.warn('AdminLayout', 'push token', e));
  }, [staff?.id]);

  const renderHeaderRight = useCallback(() => (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {canStaffUseIdCapture(staff) ? (
        <TouchableOpacity
          onPress={() => router.push('/staff/kbs/capture-id' as Href)}
          style={{ marginRight: 8, padding: 6 }}
          activeOpacity={0.8}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Kimlik çekim"
        >
          <Ionicons name="id-card-outline" size={22} color={adminTheme.colors.text} />
        </TouchableOpacity>
      ) : null}
      {canStaffViewKbsCaptureHistory(staff) ? (
        <TouchableOpacity
          onPress={() => router.push('/staff/kbs/capture-history' as Href)}
          style={{ marginRight: 8, padding: 6 }}
          activeOpacity={0.8}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Çekilen kimlikler"
        >
          <Ionicons name="albums-outline" size={22} color={adminTheme.colors.text} />
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        onPress={() => router.push('/admin/map')}
        style={{ marginRight: 12, padding: 6 }}
        activeOpacity={0.8}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel="Harita"
      >
        <Ionicons name="map-outline" size={22} color={adminTheme.colors.text} />
      </TouchableOpacity>
    </View>
  ), [router, staff]);

  useEffect(() => {
    if (!navigationReady) return;
    if (loading) return;
    const canEnterAdmin =
      canAccessManagedContractsAdminRoutes(staff) ||
      canCreateDepartmentRules(staff) ||
      canAccessAdminPayments(staff) ||
      hasAnyAdminModulePermission(staff);
    if (!staff || !canEnterAdmin) {
      if (Platform.OS === 'android') {
        log.warn('AdminLayout', 'redirecting non-admin user', { hasStaff: !!staff, role: staff?.role ?? null });
      }
      safeRouterReplace(router, '/');
      return;
    }
  }, [navigationReady, loading, staff, router]);

  /** Tam panel yetkisi olmayan; yalnızca bölüm kuralı oluşturma yetkisi — sadece ilgili rotalar */
  useEffect(() => {
    if (!navigationReady) return;
    if (loading || !staff) return;
    if (canAccessAdminShell(staff) || canManageManagedContracts(staff)) return;
    const p = pathname ?? '';
    if (canCreateDepartmentRules(staff) && !isDepartmentRulesAdminPath(p)) {
      safeRouterReplace(router, '/admin/department-rules' as Href);
      return;
    }
    if (canAccessAdminPayments(staff) && !p.startsWith('/admin/payments')) {
      safeRouterReplace(router, '/admin/payments' as Href);
    }
  }, [navigationReady, loading, staff, pathname, router]);

  /** Yetkisiz admin alt rotasına doğrudan girilirse panele yönlendir */
  useEffect(() => {
    if (!navigationReady) return;
    if (loading || !staff || isAdminRootPath) return;
    if (isGorevAtaOnlyUser(staff)) return;
    const p = pathname ?? '';
    if (!p.startsWith('/admin')) return;
    if (canAccessAdminRoute(staff, p)) return;
    safeRouterReplace(router, '/admin' as Href);
  }, [navigationReady, loading, staff, pathname, router, isAdminRootPath]);

  /** Yalnızca görev yetkisi olan personel: yetkisiz admin rotasında görev ekranına yönlendir */
  useEffect(() => {
    if (!navigationReady) return;
    if (loading || !staff) return;
    if (!isGorevAtaOnlyUser(staff)) return;
    const p = pathname ?? '';
    if (!p.startsWith('/admin')) return;
    if (canAccessAdminRoute(staff, p)) return;
    if (Platform.OS === 'android') {
      log.warn('AdminLayout', 'gorev-ata-only redirect', { from: p, to: '/admin/tasks' });
    }
    safeRouterReplace(router, '/admin/tasks');
  }, [navigationReady, loading, staff, pathname, router]);

  const headerOpts = {
    headerStyle: {
      backgroundColor: '#fff',
    },
    headerTintColor: adminTheme.colors.text,
    headerTitleStyle: {
      fontWeight: '700' as const,
      fontSize: 17,
    },
    headerShadowVisible: true,
    contentStyle: { backgroundColor: adminTheme.colors.surfaceSecondary },
    ...(Platform.OS === 'android' && { statusBarStyle: 'dark' as const }),
  };

  return (
    <View style={styles.wrapper}>
      <Stack
        screenOptions={({ navigation: nav }) => ({
          headerShown: true,
          ...headerOpts,
          ...adminStackGestureForNavigation(nav),
          headerBackVisible: false,
          headerLeft: renderSubScreenBack,
        })}
      >
        <Stack.Screen
          name="index"
          options={{
            title: '',
            headerShown: false,
            /** Kaydırarak geri native pop + replace ile çakışıp "admin removed natively" uyarısı vermesin */
            gestureEnabled: false,
            contentStyle: { backgroundColor: adminTheme.colors.surfaceSecondary },
          }}
        />
        <Stack.Screen name="approvals/index" options={{ title: t('adminApprovals'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="rooms/index" options={{ title: t('adminRooms'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="rooms/cleaning-plan" options={{ title: 'Oda temizlik planı', headerRight: renderHeaderRight }} />
      <Stack.Screen name="rooms/[id]" options={{ title: t('adminRoomDetail'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="rooms/new" options={{ title: t('adminRoomNew'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="guests/index" options={{ title: t('adminGuests'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="guests/[id]" options={{ title: t('adminGuestDetail'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="guest-welcome-card/index" options={{ title: 'Misafir karşılama kartı', headerRight: renderHeaderRight }} />
      <Stack.Screen name="hotel-pulse/index" options={{ title: 'Misafir otel nabzı', headerRight: renderHeaderRight }} />
      <Stack.Screen name="checkin" options={{ title: t('adminCheckin'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="housekeeping" options={{ title: t('adminHousekeeping'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="tasks/index" options={{ title: t('adminStaffTasks'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="tasks/assign" options={{ title: t('adminAssignTask'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="attendance/index" options={{ title: 'Mesai Takibi', headerRight: renderHeaderRight }} />
      <Stack.Screen name="attendance/[staffId]" options={{ title: 'Personel Mesai Detayı', headerRight: renderHeaderRight }} />
      <Stack.Screen name="report" options={{ headerShown: false }} />
      <Stack.Screen name="stays/index" options={{ title: t('adminStayHistory'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="sales/index" options={{ title: t('adminSalesAndCommission'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="sales/new" options={{ title: t('adminNewSale'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="sales/[id]" options={{ title: t('adminSaleDetail'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="hmb-reports/index" options={{ title: t('adminHmbReports'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="documents/index" options={{ title: t('screenDocumentManagement'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="incident-reports/index" options={{ title: 'Tutanaklar', headerRight: renderHeaderRight }} />
      <Stack.Screen name="incident-reports/new" options={{ title: 'Yeni Tutanak Oluştur', headerRight: renderHeaderRight }} />
      <Stack.Screen name="incident-reports/[id]" options={{ title: 'Tutanak Detayı', headerRight: renderHeaderRight }} />
      <Stack.Screen name="missing-items/index" options={{ title: 'Eksik Var', headerRight: renderHeaderRight }} />
      <Stack.Screen
        name="missing-items/[area]"
        options={({ route }) => {
          const area = (route.params as { area?: string })?.area;
          const title =
            area === 'kitchen' ? 'Mutfak — Eksik Var' : area === 'hotel' ? 'Otel — Eksik Var' : 'Eksik Var';
          return { title, headerRight: renderHeaderRight };
        }}
      />
      <Stack.Screen name="missing-items/report/[id]" options={{ title: 'Eksik detayı', headerRight: renderHeaderRight }} />
      <Stack.Screen name="missing-items/legacy/[id]" options={{ title: 'Eksik detayı', headerRight: renderHeaderRight }} />
      <Stack.Screen name="missing-items/history" options={{ title: 'Geçmiş eksik listesi', headerRight: renderHeaderRight }} />
      <Stack.Screen name="lost-found/index" options={{ title: t('screenLostFound'), headerRight: renderHeaderRight }} />
      <Stack.Screen
        name="lost-found/new"
        options={{
          title: t('lfNewRecord'),
          headerBackTitle: t('back'),
          headerRight: renderHeaderRight,
        }}
      />
      <Stack.Screen name="lost-found/[id]" options={{ title: t('lfDetailTitle'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="facility-journal/index" options={{ title: 'Otel eşyaları kullanımı', headerRight: renderHeaderRight }} />
      <Stack.Screen
        name="facility-journal/new"
        options={{ title: 'Yeni kullanım kaydı', headerBackTitle: t('back'), headerRight: renderHeaderRight }}
      />
      <Stack.Screen name="facility-journal/[id]" options={{ title: 'Kullanım kaydı', headerRight: renderHeaderRight }} />
      <Stack.Screen name="facility-journal/types" options={{ title: 'Kullanım kategorileri', headerRight: renderHeaderRight }} />
      <Stack.Screen name="documents/all" options={{ title: t('adminDocumentsAll'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="documents/new" options={{ title: t('adminDocumentsUpload'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="documents/categories" options={{ title: t('adminDocumentsCategories'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="documents/pending" options={{ title: t('adminDocumentsPending'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="documents/expiring" options={{ title: t('adminDocumentsExpiring'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="documents/expired" options={{ title: t('adminDocumentsExpired'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="documents/archive" options={{ title: t('adminDocumentsArchive'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="documents/logs" options={{ title: t('adminDocumentsLogs'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="documents/settings" options={{ title: t('adminDocumentsSettings'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="maliye/index" options={{ title: 'Maliye Evrak Merkezi', headerRight: renderHeaderRight }} />
      <Stack.Screen name="maliye/documents" options={{ title: 'Maliye Evrakları', headerRight: renderHeaderRight }} />
      <Stack.Screen name="maliye/forms" options={{ title: 'Müşteri Formları', headerRight: renderHeaderRight }} />
      <Stack.Screen name="maliye/access" options={{ title: 'Maliye Erişim', headerRight: renderHeaderRight }} />
      <Stack.Screen name="maliye/logs" options={{ title: 'Maliye Logları', headerRight: renderHeaderRight }} />
      <Stack.Screen
        name="documents/[id]"
        options={{ title: t('adminDocumentsDetail'), headerRight: renderHeaderRight, headerLeft: renderDocumentDetailBack }}
      />
      <Stack.Screen name="managed-contracts" options={{ headerShown: false }} />
      <Stack.Screen name="department-rules" options={{ headerShown: false }} />
      <Stack.Screen name="contracts" options={{ title: t('adminContracts'), headerShown: false }} />
      <Stack.Screen name="kitchen-ops" options={{ headerShown: false }} />
      <Stack.Screen name="stock/index" options={{ headerShown: false }} />
      <Stack.Screen name="stock/all" options={{ title: t('adminAllStocks'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="stock/product/[id]" options={{ title: t('adminProductDetail'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="stock/movement" options={{ title: t('adminStockMovement'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="stock/approvals" options={{ title: t('adminStockApprovals'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="stock/scan" options={{ title: t('adminScanBarcode'), headerShown: false }} />
      <Stack.Screen name="expenses/index" options={{ title: t('adminExpenseManagement'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="expenses/all" options={{ title: t('adminExpensesAll'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="expenses/by-category" options={{ title: t('adminExpensesByCategory'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="expenses/by-staff" options={{ title: t('adminExpensesByStaff'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="carbon" options={{ headerShown: false }} />
      <Stack.Screen name="salary/index" options={{ title: t('adminSalaryManagement'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="salary/all" options={{ title: t('adminSalaryAllPayments'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="salary/new" options={{ title: t('adminSalaryNewPayment'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="salary/history/[id]" options={{ title: t('adminSalaryHistory'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="salary/edit/[paymentId]" options={{ title: t('adminSalaryEdit'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="access/index" options={{ title: t('adminAccess'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="access/doors" options={{ title: t('adminDoors'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="access/doors/new" options={{ title: t('adminDoorNew'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="access/doors/[id]" options={{ title: t('adminDoorEdit'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="access/cards" options={{ title: t('adminCards'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="access/cards/new" options={{ title: t('adminCardNew'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="access/cards/[id]" options={{ title: t('adminCardEdit'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="access/staff-permissions" options={{ title: t('adminStaffPermissions'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="access/logs" options={{ title: t('adminAccessLogs'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="permissions" options={{ title: t('adminPermissions'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="ui-features/index" options={{ title: 'Uygulama özellikleri', headerRight: renderHeaderRight }} />
      <Stack.Screen name="hamburger-menu/index" options={{ title: 'Hamburger menü tasarımı', headerRight: renderHeaderRight }} />
      <Stack.Screen name="kbs-settings" options={{ title: t('adminKbsSettings'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="kbs-permissions" options={{ title: t('adminKbsPermissionsTitle'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="kbs-capture-notify" options={{ title: 'Kimlik çekim bildirimleri', headerRight: renderHeaderRight }} />
      <Stack.Screen name="notifications/index" options={{ title: t('adminNotifications'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="notifications/bulk" options={{ title: t('adminBulkNotification'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="announcements/compose" options={{ title: t('staffAnnouncementCompose'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="engagement" options={{ title: 'Okuma takibi', headerRight: renderHeaderRight }} />
      <Stack.Screen name="reports/index" options={{ title: t('adminReports'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="complaints/index" options={{ title: complaintsText('adminTitle'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="staff-complaints/index" options={{ title: 'Personel Şikayetleri', headerRight: renderHeaderRight }} />
      <Stack.Screen name="notifications/templates" options={{ title: t('adminNotificationTemplates'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="notifications/sounds" options={{ title: 'Bildirim Sesleri', headerRight: renderHeaderRight }} />
      <Stack.Screen name="notifications/event-log" options={{ title: 'Bildirim Log', headerRight: renderHeaderRight }} />
      <Stack.Screen name="smart-ops/index" options={{ title: 'Operasyon merkezi', headerRight: renderHeaderRight }} />
      <Stack.Screen name="fnb-hub" options={{ headerShown: false }} />
      <Stack.Screen name="smart-ops/templates" options={{ title: 'Operasyon şablonları', headerRight: renderHeaderRight }} />
      <Stack.Screen name="smart-ops/live" options={{ title: 'Canlı operasyon', headerRight: renderHeaderRight }} />
      <Stack.Screen name="notifications/emergency" options={{ title: t('adminEmergency'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="emergency-locations" options={{ title: 'Acil Lokasyonlari', headerRight: renderHeaderRight }} />
      <Stack.Screen name="staff-emergency" options={{ title: 'Personel Toplanma Alarmi', headerRight: renderHeaderRight }} />
      <Stack.Screen name="messages/index" options={{ title: t('adminMessages'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="messages/chat/[id]" options={{ title: t('adminChat'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="messages/group-members" options={{ title: t('groupMembersGroupInfo'), headerBackTitle: t('back') }} />
      <Stack.Screen name="messages/new" options={{ title: t('adminNewChat'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="messages/bulk" options={{ title: t('adminBulkMessage'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="staff/index" options={{ title: t('adminStaffCreate'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="staff/list" options={{ title: t('adminUserList'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="staff/[id]" options={{ title: t('adminStaffEdit'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="staff/profile/[id]" options={{ title: 'Personel profili', headerRight: renderHeaderRight }} />
      <Stack.Screen name="staff/add" options={{ title: t('adminStaffAdd'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="staff/pending" options={{ title: t('adminStaffPending'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="staff/approve/[id]" options={{ title: t('adminStaffApprove'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="qr-designs/index" options={{ title: t('adminQrDesigns'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="feed/index" options={{ title: t('adminFeedPosts'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="cameras/index" options={{ title: t('adminCameraManagement'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="cameras/new" options={{ title: t('adminCameraNew'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="cameras/[id]" options={{ title: t('adminCameraEdit'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="cameras/logs" options={{ title: t('adminCameraLogs'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="technical-assets/index" options={{ title: 'Akıllı Tesis Envanteri', headerRight: renderHeaderRight }} />
      <Stack.Screen name="technical-assets/structure" options={{ title: 'Bina & Lokasyon', headerRight: renderHeaderRight }} />
      <Stack.Screen name="technical-assets/assets/index" options={{ title: 'Teknik Varlıklar', headerRight: renderHeaderRight }} />
      <Stack.Screen name="technical-assets/assets/new" options={{ title: 'Yeni Varlık', headerRight: renderHeaderRight }} />
      <Stack.Screen name="technical-assets/assets/[id]" options={{ title: 'Varlık & QR', headerRight: renderHeaderRight }} />
      <Stack.Screen name="technical-assets/faults/index" options={{ title: 'Arıza bildirimleri', headerRight: renderHeaderRight }} />
      <Stack.Screen name="profile" options={{ title: t('myProfile'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="app-links" options={{ title: t('adminAppsAndWebsites'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="settings/printer" options={{ title: t('adminPrinterSettings'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="map" options={{ title: 'Harita', headerShown: false }} />
      <Stack.Screen name="accounting" options={{ headerShown: false }} />
      <Stack.Screen name="audits" options={{ headerShown: false }} />
      <Stack.Screen name="performance" options={{ headerShown: false }} />
      <Stack.Screen name="finance-checks/index" options={{ title: 'Çek takibi', headerRight: renderHeaderRight }} />
      <Stack.Screen name="finance-checks/new" options={{ title: 'Yeni çek', headerRight: renderHeaderRight }} />
      <Stack.Screen name="finance-checks/settings" options={{ title: 'Çek bildirimleri', headerRight: renderHeaderRight }} />
      <Stack.Screen name="finance-checks/[id]" options={{ title: 'Çek detayı', headerRight: renderHeaderRight }} />
      <Stack.Screen name="finance-checks/edit/[id]" options={{ title: 'Çek düzenle', headerRight: renderHeaderRight }} />
      <Stack.Screen name="finance-checks/preview/[id]" options={{ title: 'Çek önizleme', headerRight: renderHeaderRight }} />
      <Stack.Screen name="debts/index" options={{ title: 'Borç / alacak', headerRight: renderHeaderRight }} />
      <Stack.Screen name="payments" options={{ headerShown: false }} />
      <Stack.Screen name="tips/index" options={{ title: 'Bahşişler', headerRight: renderHeaderRight }} />
      <Stack.Screen name="debts/new" options={{ title: 'Yeni borç kaydı', headerRight: renderHeaderRight }} />
      <Stack.Screen name="debts/[id]" options={{ title: 'Borç detayı', headerRight: renderHeaderRight }} />
      <Stack.Screen name="meal-menu/index" options={{ title: 'Aylık yemek listesi', headerRight: renderHeaderRight }} />
      <Stack.Screen name="points/index" options={{ title: 'Puan Yönetimi', headerRight: renderHeaderRight }} />
      <Stack.Screen name="notes/index" options={{ title: 'Not Al', headerRight: renderHeaderRight }} />
      <Stack.Screen name="notes/new" options={{ title: 'Yeni not', headerRight: renderHeaderRight }} />
      <Stack.Screen name="notes/[id]" options={{ title: 'Not detayı', headerRight: renderHeaderRight }} />
      <Stack.Screen name="notes/edit/[id]" options={{ title: 'Notu düzenle', headerRight: renderHeaderRight }} />
      <Stack.Screen name="blacklist/index" options={{ headerShown: false, contentStyle: { backgroundColor: '#0B1120' } }} />
      <Stack.Screen name="breakfast-partners/index" options={{ headerShown: false, contentStyle: { backgroundColor: '#0c1222' } }} />
      <Stack.Screen name="breakfast-partners/new" options={{ headerShown: false, contentStyle: { backgroundColor: '#0c1222' } }} />
      <Stack.Screen name="breakfast-partners/[id]" options={{ headerShown: false, contentStyle: { backgroundColor: '#0c1222' } }} />
      <Stack.Screen name="breakfast-partners/settings" options={{ headerShown: false, contentStyle: { backgroundColor: '#0c1222' } }} />
      <Stack.Screen name="breakfast-partners/prices" options={{ headerShown: false, contentStyle: { backgroundColor: '#0c1222' } }} />
      <Stack.Screen name="camera-requests/index" options={{ headerShown: false, contentStyle: { backgroundColor: '#0c1222' } }} />
      <Stack.Screen name="camera-requests/[id]" options={{ headerShown: false, contentStyle: { backgroundColor: '#0c1222' } }} />
      <Stack.Screen name="trade-partners/index" options={{ headerShown: false, contentStyle: { backgroundColor: '#070b12' } }} />
      <Stack.Screen name="trade-partners/partners" options={{ headerShown: false, contentStyle: { backgroundColor: '#070b12' } }} />
      <Stack.Screen name="trade-partners/new" options={{ headerShown: false, contentStyle: { backgroundColor: '#070b12' } }} />
      <Stack.Screen name="trade-partners/[id]" options={{ headerShown: false, contentStyle: { backgroundColor: '#070b12' } }} />
      <Stack.Screen name="trade-partners/transactions/new" options={{ headerShown: false, contentStyle: { backgroundColor: '#070b12' } }} />
      <Stack.Screen name="trade-partners/transactions/[id]" options={{ headerShown: false, contentStyle: { backgroundColor: '#070b12' } }} />
      <Stack.Screen name="blacklist/new" options={{ headerShown: false, contentStyle: { backgroundColor: '#0B1120' } }} />
      <Stack.Screen name="blacklist/[id]" options={{ headerShown: false, contentStyle: { backgroundColor: '#0B1120' } }} />
      <Stack.Screen name="breakfast-confirm/index" options={{ title: 'Kahvaltı Teyit Kayıtları', headerRight: renderHeaderRight }} />
      <Stack.Screen name="breakfast-confirm/settings" options={{ title: 'Kahvaltı Teyit Ayarları', headerRight: renderHeaderRight }} />
      <Stack.Screen name="transfer-tour/index" options={{ title: t('transferTourAdminMenu'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="transfer-tour/pick-location" options={{ title: t('transferTourPickLocation'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="transfer-tour/service/[id]" options={{ title: t('transferTourEditService'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="dining-venues/index" options={{ title: t('diningVenuesAdminTitle'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="dining-venues/venue/[id]" options={{ title: t('diningVenuesFormTitle'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="dining-venues/pick-location" options={{ title: t('diningVenuesPickOnMap'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="room-service" options={{ title: 'Oda servisi', headerShown: false }} />
      <Stack.Screen name="guest-extras" options={{ title: 'Ekstra ücretler', headerShown: false }} />
      <Stack.Screen name="local-area-guide/index" options={{ title: t('localAreaGuideAdminTitle'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="local-area-guide/[id]" options={{ title: t('localAreaGuideAdminEdit'), headerRight: renderHeaderRight }} />
      </Stack>

      {/* Tab menü: Admin, Personel, Misafir — hepsi tab’ta, ayrı yerde olmayacak */}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
});
