/* @refresh reset */
import { useEffect, useLayoutEffect, useState, useRef, useCallback, type ReactNode } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { subscribeAppForegroundDebounced } from '@/lib/appForegroundDebounce';
import { Tabs, useRouter, usePathname, type Href } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { FloatingIslandTabBar } from '@/components/FloatingIslandTabBar';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';
import { pds } from '@/constants/personelDesignSystem';
import { appTabBar, getAppTabBarColors } from '@/constants/tabBarTheme';
import { getFloatingTabBarInnerHeight, getFloatingTabBarBarHeight } from '@/constants/floatingTabBarMetrics';
import { StaffIdCaptureCenterTabIcon } from '@/components/AppTabBarCenterIdCaptureButton';
import { useAuthStore } from '@/stores/authStore';
import { useStaffUnreadMessagesStore } from '@/stores/staffUnreadMessagesStore';
import { useStaffNotificationStore } from '@/stores/staffNotificationStore';
import { useStaffBoardStore } from '@/stores/staffBoardStore';
import { useAdminWarningStore } from '@/stores/adminWarningStore';
import { useStaffNewAssignmentHintStore } from '@/stores/staffNewAssignmentHintStore';
import { StaffBoardHeaderEye } from '@/components/header/StaffHeaderActions';
import {
  StaffFeedHeaderLeftConnected,
  StaffFeedHeaderRight,
  feedHeaderSideMinWidth,
} from '@/components/header/StaffFeedHeaderControls';
import { StaffFeedShareSheet } from '@/components/header/StaffFeedShareSheet';
import { useStaffTabHrefs } from '@/hooks/useStaffTabHrefs';
import { runAfterUiReady } from '@/lib/runAfterUiReady';
import { useOrganizationUiFeaturesStore } from '@/stores/organizationUiFeaturesStore';
import { StaffBoardAnnouncementToast } from '@/components/header/StaffBoardAnnouncementToast';
import { supabase } from '@/lib/supabase';
import { CachedImage } from '@/components/CachedImage';
import { clearAdminAutoOpenSuppress, signalStaffExitedAdminPanelFromRoot } from '@/lib/staffAdminTabNavigation';
import { hapticSelection } from '@/lib/hapticsSafe';
import { canStaffUseIdCapture } from '@/lib/kbsMrzAccess';
import {
  scheduleStaffMessagingUnreadRefresh,
  subscribeMessagingUnreadLive,
} from '@/lib/messagingUnreadSync';

const TAB_ICON_SIZE = 24;
const PROFILE_TAB_AVATAR_SIZE = 26;

const IG_HEADER_FG = pds.text;

function TabBarScaledIcon({ focused, children }: { focused: boolean; children: ReactNode }) {
  if (Platform.OS === 'android') return <>{children}</>;
  return <View style={{ transform: [{ scale: focused ? 1.1 : 1 }] }}>{children}</View>;
}

function StaffProfileTabIcon({ color: _c, focused }: { color: string; focused: boolean }) {
  const { isNight } = usePremiumTheme();
  const tabBarColors = getAppTabBarColors(isNight);
  const staff = useAuthStore((s) => s.staff);
  const c = focused ? tabBarColors.fallbackActive : tabBarColors.inactive;
  const avatarUri = staff?.profile_image ?? null;
  if (avatarUri) {
    return (
      <View style={[styles.tabAvatarWrap, { borderColor: focused ? c : theme.colors.borderLight }]}>
        <CachedImage uri={avatarUri} style={styles.tabAvatar} contentFit="cover" />
      </View>
    );
  }
  return <Ionicons name={focused ? 'person' : 'person-outline'} size={TAB_ICON_SIZE} color={c} />;
}

/** Profil: şeffaf header, kapak görünsün; sadece geri; ana sekmeye */
function StaffProfileBackToHome() {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      onPress={() => router.replace('/staff' as Href)}
      style={styles.profileBackBtn}
      activeOpacity={0.85}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityLabel={t('back')}
    >
      <Ionicons name="chevron-back" size={24} color="#fff" />
    </TouchableOpacity>
  );
}

const HEADER_CTRL = 34;
const BADGE_REFRESH_MIN_GAP_MS = 120_000;
const ANDROID_REALTIME_DEFER_MS = 3500;
const TAB_BADGE_HEAVY_DEFER_MS = 2800;
const IS_ANDROID = Platform.OS === 'android';

const boardReloadTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleDebouncedBoardLoad(staffId: string, run: () => void): void {
  const prev = boardReloadTimers.get(staffId);
  if (prev) clearTimeout(prev);
  boardReloadTimers.set(
    staffId,
    setTimeout(() => {
      boardReloadTimers.delete(staffId);
      run();
    }, 2_500)
  );
}

function canStaffCreateFeed(staff: ReturnType<typeof useAuthStore.getState>['staff']): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  const perms = staff.app_permissions ?? {};
  return (
    perms.video_paylasim === true ||
    perms.feed_create_post === true ||
    perms.feed_post_create === true ||
    perms.feed_create === true ||
    perms.feed === true
  );
}


function GlassHeaderBackground() {
  const { colors } = usePremiumTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.glassStrong,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.glassBorder,
      }}
    />
  );
}

export default function StaffTabsLayout() {
  return <StaffMainTabsLayout />;
}

function StaffMainTabsLayout() {
  const { t } = useTranslation();
  const { isNight, colors: premiumColors } = usePremiumTheme();
  const tabBarColors = getAppTabBarColors(isNight);
  const headerTitleColor = isNight ? premiumColors.text : '#111827';
  const headerFg = isNight ? premiumColors.text : IG_HEADER_FG;
  const tabBarHeight = getFloatingTabBarBarHeight();
  const tabBarInnerHeight = getFloatingTabBarInnerHeight();
  const tabBarPaddingBottom = Platform.OS === 'android' ? 0 : 4;
  const tabBarPaddingTop = Platform.OS === 'android' ? 4 : 4;
  const staff = useAuthStore((s) => s.staff);
  const loadOrgUi = useOrganizationUiFeaturesStore((s) => s.load);
  const tabHrefs = useStaffTabHrefs();
  const refreshNotifications = useStaffNotificationStore((s) => s.refresh);
  const loadBoardList = useStaffBoardStore((s) => s.loadList);
  const unreadMessagesCount = useStaffUnreadMessagesStore((s) => s.unreadCount);
  const refreshUnreadMessages = useStaffUnreadMessagesStore((s) => s.refreshUnread);
  const adminWarningCount = useAdminWarningStore((s) => s.count);
  const refreshAdminWarning = useAdminWarningStore((s) => s.refresh);
  const refreshNewAssignHint = useStaffNewAssignmentHintStore((s) => s.refresh);
  const bumpNewAssignFromRealtime = useStaffNewAssignmentHintStore((s) => s.bumpFromRealtime);
  const newTasksTabCount = useStaffNewAssignmentHintStore((s) => s.pendingTasksTabCount);
  const router = useRouter();
  const [fabVisible, setFabVisible] = useState(false);
  const canCreateFeed = canStaffCreateFeed(staff);
  const canIdCapture = canStaffUseIdCapture(staff);
  const showHeaderFabMenu = canCreateFeed;
  const badgeRefreshInFlightRef = useRef(false);
  const badgeRefreshLastAtRef = useRef(0);

  const refreshTabBadgesLite = useCallback(async () => {
    if (!staff?.id) return;
    await Promise.all([refreshNotifications(), refreshUnreadMessages(staff.id)]);
  }, [staff?.id, refreshNotifications, refreshUnreadMessages]);

  const refreshTabBadgesHeavy = useCallback(async () => {
    if (!staff?.id) return;
    await Promise.all([
      loadBoardList(staff.id),
      staff.role === 'admin' ? refreshAdminWarning(staff.id) : Promise.resolve(),
      refreshNewAssignHint(staff.id),
    ]);
  }, [staff?.id, staff?.role, loadBoardList, refreshAdminWarning, refreshNewAssignHint]);

  const refreshTabBadges = useCallback(
    async (opts?: { force?: boolean; reason?: string; lite?: boolean }) => {
      if (!staff?.id) return;
      const now = Date.now();
      const force = opts?.force === true;
      if (badgeRefreshInFlightRef.current) return;
      if (!force && now - badgeRefreshLastAtRef.current < BADGE_REFRESH_MIN_GAP_MS) return;
      badgeRefreshInFlightRef.current = true;
      badgeRefreshLastAtRef.current = now;
      try {
        if (opts?.lite) {
          await refreshTabBadgesLite();
          return;
        }
        await Promise.all([refreshTabBadgesLite(), refreshTabBadgesHeavy()]);
      } finally {
        badgeRefreshInFlightRef.current = false;
      }
    },
    [staff?.id, refreshTabBadgesLite, refreshTabBadgesHeavy]
  );

  useEffect(() => {
    if (!staff?.organization_id) return;
    if (IS_ANDROID) {
      const task = runAfterUiReady(() => void loadOrgUi(staff.organization_id), { delayMs: 1200 });
      return () => task.cancel();
    }
    void loadOrgUi(staff.organization_id);
  }, [staff?.organization_id, loadOrgUi]);

  useEffect(() => {
    if (!staff?.id) return;
    const runInitial = () => {
      void refreshTabBadgesLite();
      runAfterUiReady(() => void refreshTabBadgesHeavy(), { delayMs: TAB_BADGE_HEAVY_DEFER_MS });
    };
    const task = runAfterUiReady(runInitial);
    return () => task.cancel();
  }, [staff?.id, refreshTabBadgesLite, refreshTabBadgesHeavy]);

  useEffect(() => {
    if (!staff?.id) return;
    const staffId = staff.id;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const subscribe = () => {
      if (cancelled) return;
      channel = supabase
        .channel(`staff_assign_live_${staffId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'staff_assignments',
            filter: `assigned_staff_id=eq.${staffId}`,
          },
          () => {
            bumpNewAssignFromRealtime();
            if (!IS_ANDROID) void refreshTabBadges({ reason: 'assignment-insert', lite: true });
          }
        )
        .subscribe();
    };

    if (IS_ANDROID) {
      const task = runAfterUiReady(subscribe, { delayMs: ANDROID_REALTIME_DEFER_MS });
      return () => {
        cancelled = true;
        task.cancel();
        if (channel) void supabase.removeChannel(channel);
      };
    }
    subscribe();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [staff?.id, bumpNewAssignFromRealtime, refreshTabBadges]);

  // Mesaj rozeti: sohbet listesine girmeden tab menüde (realtime)
  useEffect(() => {
    if (!staff?.id) return;
    const staffId = staff.id;
    let unsub: (() => void) | null = null;
    let cancelled = false;

    const start = () => {
      if (cancelled) return;
      unsub = subscribeMessagingUnreadLive({ kind: 'staff', staffId }, () => {
        scheduleStaffMessagingUnreadRefresh(staffId);
      });
    };

    if (IS_ANDROID) {
      const task = runAfterUiReady(start, { delayMs: ANDROID_REALTIME_DEFER_MS });
      return () => {
        cancelled = true;
        task.cancel();
        unsub?.();
      };
    }
    start();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [staff?.id]);

  useEffect(() => {
    if (!staff?.id) return;
    const staffId = staff.id;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const subscribe = () => {
      if (cancelled) return;
      channel = supabase
        .channel(`staff_board_live_${staffId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'announcements' },
          () => {
            scheduleDebouncedBoardLoad(staffId, () => void loadBoardList(staffId));
          }
        )
        .subscribe();
    };

    if (IS_ANDROID) {
      const task = runAfterUiReady(subscribe, { delayMs: ANDROID_REALTIME_DEFER_MS + 800 });
      return () => {
        cancelled = true;
        task.cancel();
        if (channel) void supabase.removeChannel(channel);
      };
    }
    subscribe();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [staff?.id, loadBoardList]);

  // Periyodik badge poll kaldırıldı — realtime + ön plan debounce yeterli.

  // Android: ön plana gelince tab rozetleri güncellensin (debounce — aynı anda 4 ağ isteği UI’ı kilitlemesin)
  useEffect(() => {
    if (!staff?.id) return;
    return subscribeAppForegroundDebounced(() => {
      void refreshTabBadges({ reason: 'app-foreground' });
    });
  }, [staff?.id, refreshTabBadges]);

  const shareFabLabel = t('staffFabCreatePostOrStory');

  const feedHeaderSideW = feedHeaderSideMinWidth(showHeaderFabMenu);

  const renderFeedHeaderLeft = useCallback(
    () => (
      <StaffFeedHeaderLeftConnected
        showShare={showHeaderFabMenu}
        onSharePress={() => setFabVisible(true)}
        shareAccessibilityLabel={shareFabLabel}
      />
    ),
    [showHeaderFabMenu, shareFabLabel]
  );

  const renderFeedHeaderRight = useCallback(() => <StaffFeedHeaderRight />, []);

  const isStaffFeedTab = (routeName: string) => routeName === 'index';

  const renderTabBar = useCallback(
    (props: BottomTabBarProps) => (
      <FloatingIslandTabBar
        {...props}
        surfaceColor={isNight ? premiumColors.pageBg : tabBarColors.shellBackground}
        borderColor={tabBarColors.border}
        hidden={false}
        floatOverContent
      />
    ),
    [isNight, premiumColors.pageBg, tabBarColors.shellBackground, tabBarColors.border]
  );

  const staffTabScreenListeners = useCallback(
    ({ route }: { route: { name: string } }) => ({
      tabPress: (e: { preventDefault: () => void }) => {
        if (route.name === 'admin') {
          e.preventDefault();
          clearAdminAutoOpenSuppress();
          router.push('/admin' as Href);
          hapticSelection();
          return;
        }
        hapticSelection();
        signalStaffExitedAdminPanelFromRoot();
      },
    }),
    [router]
  );

  return (
    <>
    <StaffBoardAnnouncementToast />
    <Tabs
      tabBar={renderTabBar}
      screenListeners={staffTabScreenListeners}
      screenOptions={({ route }) => {
        const feedTab = isStaffFeedTab(route.name);
        return {
        /** İlk ziyarette mount; ana feed/admin hariç. Dönüşte bellekte tut (detach kapalı). */
        sceneStyle: { backgroundColor: isNight ? premiumColors.pageBg : pds.pageBg },
        lazy: true,
        detachInactiveScreens: false,
        freezeOnBlur: true,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: tabBarColors.fallbackActive,
        tabBarInactiveTintColor: tabBarColors.inactive,
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          height: tabBarHeight,
          paddingTop: tabBarPaddingTop,
          paddingBottom: tabBarPaddingBottom,
          minHeight: tabBarInnerHeight,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginBottom: 0,
        },
        tabBarItemStyle: {
          paddingVertical: 2,
          backgroundColor: 'transparent',
        },
        // iOS: sarımsı vurgu / “gölge” yok; seçili sekme sadece ikon/label rengiyle belli
        tabBarActiveBackgroundColor: 'transparent',
        tabBarInactiveBackgroundColor: 'transparent',
        // Opak header: tüm sekmelerde içerik çubuk altında hizalanır (şeffaf + manuel padding feed’e özel hata yaratıyordu).
        headerStyle: {
          backgroundColor: 'transparent',
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 0,
        },
        headerBackground: GlassHeaderBackground,
        headerTransparent: false,
        headerShadowVisible: false,
        headerTitleAlign: 'center' as const,
        headerTintColor: headerFg,
        headerTitleStyle: { fontSize: 19, fontWeight: '800', color: headerTitleColor, letterSpacing: 0.3 },
        ...(Platform.OS === 'android' ? { statusBarStyle: (isNight ? 'light' : 'dark') as const } : null),
        headerLeftContainerStyle: feedTab
          ? { paddingLeft: 2, minWidth: feedHeaderSideW }
          : { paddingLeft: 0, minWidth: 0 },
        headerRightContainerStyle: feedTab
          ? { paddingRight: 4, backgroundColor: 'transparent', minWidth: feedHeaderSideW }
          : { paddingRight: 0, minWidth: 0 },
        headerRight: feedTab ? renderFeedHeaderRight : () => null,
        headerLeft: feedTab ? renderFeedHeaderLeft : () => null,
      };
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          lazy: false,
          href: tabHrefs.index,
          title: '',
          headerTitle: () => <StaffBoardHeaderEye />,
          headerTitleAlign: 'center',
          headerTitleContainerStyle: {
            left: 0,
            right: 0,
            alignItems: 'center',
            justifyContent: 'center',
          },
          tabBarActiveTintColor: tabBarColors.fallbackActive,
          tabBarLabel: t('staffTab'),
          tabBarIcon: ({ focused }) => (
            <TabBarScaledIcon focused={focused}>
              <Ionicons
                name={focused ? 'people' : 'people-outline'}
                size={TAB_ICON_SIZE}
                color={focused ? tabBarColors.fallbackActive : tabBarColors.inactive}
              />
            </TabBarScaledIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          href: tabHrefs.tasks,
          title: t('tasks'),
          headerTitle: t('tasks'),
          tabBarActiveTintColor: tabBarColors.fallbackActive,
          tabBarLabel: t('tasks'),
          tabBarBadge:
            newTasksTabCount > 0 ? (newTasksTabCount > 99 ? '99+' : newTasksTabCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: theme.colors.error },
          tabBarIcon: ({ focused }) => (
            <TabBarScaledIcon focused={focused}>
              <Ionicons
                name={focused ? 'checkbox' : 'checkbox-outline'}
                size={TAB_ICON_SIZE}
                color={focused ? tabBarColors.fallbackActive : tabBarColors.inactive}
              />
            </TabBarScaledIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="stock"
        options={{
          href: null,
          title: t('stockTab'),
          headerTitle: t('stockManagement'),
        }}
      />
      <Tabs.Screen
        name="nfc"
        options={{
          href: canIdCapture ? tabHrefs.nfc : null,
          title: t('kbsNfcCaptureTitle'),
          headerShown: false,
          tabBarActiveTintColor: tabBarColors.fallbackActive,
          tabBarLabel: t('staffTabNfc'),
          tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 4 },
          tabBarIcon: ({ focused }) => (
            <TabBarScaledIcon focused={focused}>
              <Ionicons
                name={focused ? 'hardware-chip' : 'hardware-chip-outline'}
                size={TAB_ICON_SIZE}
                color={focused ? tabBarColors.fallbackActive : tabBarColors.inactive}
              />
            </TabBarScaledIcon>
          ),
        }}
        listeners={{
          tabPress: () => {
            hapticSelection();
          },
        }}
      />
      <Tabs.Screen
        name="id-capture"
        options={{
          href: canIdCapture ? undefined : null,
          title: t('staffKitchenIdCapture'),
          headerShown: false,
          tabBarActiveTintColor: tabBarColors.fallbackActive,
          tabBarLabel: t('staffTabIdCapture'),
          tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 4 },
          tabBarIcon: ({ focused }) => <StaffIdCaptureCenterTabIcon focused={focused} />,
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.push('/staff/kbs/capture-id' as Href);
            hapticSelection();
          },
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          href: tabHrefs.messages,
          title: t('messages'),
          headerTitle: t('teamChat'),
          tabBarActiveTintColor: tabBarColors.fallbackActive,
          tabBarLabel: t('messages'),
          tabBarBadge:
            unreadMessagesCount > 0 ? (unreadMessagesCount > 99 ? '99+' : unreadMessagesCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: theme.colors.error },
          tabBarIcon: ({ focused }) => (
            <TabBarScaledIcon focused={focused}>
              <Ionicons
                name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
                size={TAB_ICON_SIZE}
                color={focused ? tabBarColors.fallbackActive : tabBarColors.inactive}
              />
            </TabBarScaledIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="emergency"
        options={{
          title: t('screenEmergency'),
          headerTitle: t('screenEmergency'),
          tabBarActiveTintColor: tabBarColors.fallbackActive,
          tabBarLabel: t('screenEmergency'),
          tabBarIcon: ({ focused }) => (
            <TabBarScaledIcon focused={focused}>
              <Ionicons
                name={focused ? 'warning' : 'warning-outline'}
                size={TAB_ICON_SIZE}
                color={focused ? tabBarColors.fallbackActive : tabBarColors.inactive}
              />
            </TabBarScaledIcon>
          ),
          href: staff?.role === 'admin' ? null : tabHrefs.emergency,
        }}
      />
      <Tabs.Screen
        name="kbs"
        options={{
          title: t('kbsNavOperation'),
          headerTitle: t('kbsNavOperation'),
          href: null,
        }}
      />
      <Tabs.Screen
        name="cameras"
        options={{
          title: t('staffCamerasTitle'),
          headerTitle: t('staffLiveCamerasTitle'),
          href: null,
        }}
      />
      <Tabs.Screen
        name="acceptances"
        options={{
          href: null,
          title: t('acceptances'),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: t('notifications'),
          headerTitle: t('notifications'),
          href: null,
        }}
      />
      <Tabs.Screen
        name="misafir"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          lazy: false,
          title: t('adminTab'),
          headerShown: false,
          sceneStyle: { backgroundColor: '#f8fafc' },
          tabBarActiveTintColor: tabBarColors.fallbackActive,
          tabBarLabel: t('adminTab'),
          tabBarBadge: staff?.role === 'admin' && adminWarningCount > 0 ? (adminWarningCount > 99 ? '99+' : adminWarningCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: theme.colors.error },
          tabBarIcon: ({ focused }) => (
            <TabBarScaledIcon focused={focused}>
              <Ionicons
                name={focused ? 'shield' : 'shield-outline'}
                size={TAB_ICON_SIZE}
                color={focused ? tabBarColors.fallbackActive : tabBarColors.inactive}
              />
            </TabBarScaledIcon>
          ),
          href: staff?.role === 'admin' ? tabHrefs.admin : null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          href: tabHrefs.profile,
          title: t('myProfile'),
          headerTitle: '',
          headerShown: true,
          tabBarActiveTintColor: tabBarColors.fallbackActive,
          headerTransparent: true,
          headerBackground: () => <View style={StyleSheet.absoluteFillObject} />,
          headerStyle: {
            backgroundColor: 'transparent',
            elevation: 0,
            shadowOpacity: 0,
            borderBottomWidth: 0,
            borderBottomColor: 'transparent',
          },
          headerShadowVisible: false,
          headerLeft: () => <StaffProfileBackToHome />,
          headerRight: () => null,
          headerTintColor: '#ffffff',
          tabBarShowLabel: false,
          tabBarIcon: ({ color, focused }) => <StaffProfileTabIcon color={color} focused={focused} />,
        }}
      />
    </Tabs>
    <StaffFeedShareSheet
      visible={fabVisible}
      onClose={() => setFabVisible(false)}
      canCreateFeed={canCreateFeed}
      onPost={() => {
        setFabVisible(false);
        router.push('/staff/feed/new' as never);
      }}
      onStory={() => {
        setFabVisible(false);
        router.push('/staff/feed/story-new' as never);
      }}
    />
    </>
  );
}

const styles = StyleSheet.create({
  profileBackBtn: {
    marginLeft: 4,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabAvatarWrap: {
    width: PROFILE_TAB_AVATAR_SIZE,
    height: PROFILE_TAB_AVATAR_SIZE,
    borderRadius: PROFILE_TAB_AVATAR_SIZE / 2,
    borderWidth: 2,
    overflow: 'hidden',
  },
  tabAvatar: {
    width: '100%',
    height: '100%',
  },
  headerIconBtn: {
    minWidth: HEADER_CTRL,
    minHeight: HEADER_CTRL,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
