import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { subscribeAppForegroundDebounced } from '@/lib/appForegroundDebounce';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs, useRouter, type Href } from 'expo-router';
import { FloatingIslandTabBar } from '@/components/FloatingIslandTabBar';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';
import { pds } from '@/constants/personelDesignSystem';
import { appTabBar } from '@/constants/tabBarTheme';
import { getFloatingTabBarInnerHeight, getFloatingTabBarTotalHeight } from '@/constants/floatingTabBarMetrics';
import { CenterMessageTabBarIcon } from '@/components/AppTabBarCenterMessageButton';
import { useAuthStore } from '@/stores/authStore';
import { useStaffUnreadMessagesStore } from '@/stores/staffUnreadMessagesStore';
import { useStaffNotificationStore } from '@/stores/staffNotificationStore';
import { useStaffBoardStore } from '@/stores/staffBoardStore';
import { useAdminWarningStore } from '@/stores/adminWarningStore';
import { useStaffNewAssignmentHintStore } from '@/stores/staffNewAssignmentHintStore';
import { StaffBoardHeaderEye } from '@/components/header/StaffHeaderActions';
import {
  StaffFeedHeaderLeft,
  StaffFeedHeaderRight,
  feedHeaderSideMinWidth,
} from '@/components/header/StaffFeedHeaderControls';
import { StaffQuickMenuSheet } from '@/components/header/StaffQuickMenuSheet';
import { StaffFeedShareSheet } from '@/components/header/StaffFeedShareSheet';
import { buildStaffHamburgerMenuLayout } from '@/lib/staffHamburgerMenu';
import { staffRoleLabel } from '@/lib/staffAssignments';
import { StaffBoardAnnouncementToast } from '@/components/header/StaffBoardAnnouncementToast';
import { supabase } from '@/lib/supabase';
import { CachedImage } from '@/components/CachedImage';
import { clearAdminAutoOpenSuppress, signalStaffExitedAdminPanelFromRoot } from '@/lib/staffAdminTabNavigation';
import { canStaffUseMrzScan } from '@/lib/kbsMrzAccess';
import {
  scheduleStaffMessagingUnreadRefresh,
  subscribeMessagingUnreadLive,
} from '@/lib/messagingUnreadSync';

const TAB_ICON_SIZE = 24;
const PROFILE_TAB_AVATAR_SIZE = 26;

const IG_HEADER_FG = pds.text;

function TabBarScaledIcon({ focused, children }: { focused: boolean; children: ReactNode }) {
  return <View style={{ transform: [{ scale: focused ? 1.1 : 1 }] }}>{children}</View>;
}

function StaffProfileTabIcon({ color: _c, focused }: { color: string; focused: boolean }) {
  const staff = useAuthStore((s) => s.staff);
  const c = focused ? pds.indigo : appTabBar.inactive;
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
      onPress={() => router.push('/staff' as Href)}
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


export default function StaffTabsLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const tabBarHeight = getFloatingTabBarTotalHeight(insets);
  const tabBarInnerHeight = getFloatingTabBarInnerHeight();
  const tabBarPaddingBottom = Platform.OS === 'android' ? 0 : 4;
  const tabBarPaddingTop = Platform.OS === 'android' ? 4 : 4;
  const staff = useAuthStore((s) => s.staff);
  const refreshNotifications = useStaffNotificationStore((s) => s.refresh);
  const refreshBoard = useStaffBoardStore((s) => s.refresh);
  const loadBoardList = useStaffBoardStore((s) => s.loadList);
  const unreadMessagesCount = useStaffUnreadMessagesStore((s) => s.unreadCount);
  const refreshUnreadMessages = useStaffUnreadMessagesStore((s) => s.refreshUnread);
  const adminWarningCount = useAdminWarningStore((s) => s.count);
  const refreshAdminWarning = useAdminWarningStore((s) => s.refresh);
  const newAssignMenuLabel = useStaffNewAssignmentHintStore((s) => s.showHamburgerLabel);
  const newAssignCount = useStaffNewAssignmentHintStore((s) => s.pendingCount);
  const refreshNewAssignHint = useStaffNewAssignmentHintStore((s) => s.refresh);
  const markNewAssignMenuOpened = useStaffNewAssignmentHintStore((s) => s.markHamburgerMenuOpened);
  const bumpNewAssignFromRealtime = useStaffNewAssignmentHintStore((s) => s.bumpFromRealtime);
  const boardHasUnread = useStaffBoardStore((s) => s.hasUnread);
  const boardUnreadCount = useStaffBoardStore((s) => s.unreadCount);
  const router = useRouter();
  const [menuVisible, setMenuVisible] = useState(false);
  /** İlk açılışa kadar ağır menü ağacını mount etme (Android başlangıç jank’i). */
  const [menuSheetMounted, setMenuSheetMounted] = useState(false);
  const [fabVisible, setFabVisible] = useState(false);
  const canCreateFeed = canStaffCreateFeed(staff);
  const canKbsMrz = canStaffUseMrzScan(staff);
  const showHeaderFabMenu = canCreateFeed || canKbsMrz;

  useEffect(() => {
    if (!staff?.id) return;
    const staffId = staff.id;
    const isAdmin = staff.role === 'admin';
    // Android: rozet API’lerini seri başlat — aynı anda 4–5 istek UI’ı kilitliyordu
    if (Platform.OS === 'android') {
      refreshNotifications();
      const t1 = setTimeout(() => refreshUnreadMessages(staffId), 150);
      const t2 = setTimeout(() => void loadBoardList(staffId), 300);
      const t3 = setTimeout(() => {
        if (isAdmin) refreshAdminWarning(staffId);
        void refreshNewAssignHint(staffId);
      }, 450);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
    refreshNotifications();
    refreshUnreadMessages(staffId);
    void loadBoardList(staffId);
    if (isAdmin) refreshAdminWarning(staffId);
    void refreshNewAssignHint(staffId);
  }, [staff?.id, staff?.role, refreshNotifications, refreshUnreadMessages, loadBoardList, refreshAdminWarning, refreshNewAssignHint]);

  useEffect(() => {
    if (!staff?.id) return;
    const staffId = staff.id;
    const channel = supabase
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
          void refreshNewAssignHint(staffId);
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [staff?.id, bumpNewAssignFromRealtime, refreshNewAssignHint]);

  // Mesaj rozeti: sohbet listesine girmeden tab menüde (realtime)
  useEffect(() => {
    if (!staff?.id) return;
    const staffId = staff.id;
    const unsub = subscribeMessagingUnreadLive(staffId, () => {
      scheduleStaffMessagingUnreadRefresh(staffId);
    });
    return unsub;
  }, [staff?.id]);

  useEffect(() => {
    if (!staff?.id) return;
    const channel = supabase
      .channel(`staff_board_live_${staff.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'announcements' },
        () => {
          void loadBoardList(staff.id);
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [staff?.id, loadBoardList]);

  const menuLayout = useMemo(
    () =>
      buildStaffHamburgerMenuLayout(
        t,
        staff
          ? {
              role: staff.role,
              app_permissions: staff.app_permissions,
              hidden_menu_item_ids: staff.hidden_menu_item_ids,
              kbs_access_enabled: staff.kbs_access_enabled,
              department: staff.department,
            }
          : null
      ),
    [
      t,
      staff?.role,
      staff?.app_permissions,
      staff?.hidden_menu_item_ids,
      staff?.kbs_access_enabled,
      staff?.department,
    ]
  );

  useEffect(() => {
    if (!staff?.id) return;
    const interval = setInterval(() => {
      refreshNotifications();
      refreshUnreadMessages(staff.id);
      void loadBoardList(staff.id);
      if (staff.role === 'admin') refreshAdminWarning(staff.id);
      void refreshNewAssignHint(staff.id);
    }, 60000);
    return () => clearInterval(interval);
  }, [staff?.id, staff?.role, refreshNotifications, refreshUnreadMessages, loadBoardList, refreshAdminWarning, refreshNewAssignHint]);

  // Android: ön plana gelince tab rozetleri güncellensin (debounce — aynı anda 4 ağ isteği UI’ı kilitlemesin)
  useEffect(() => {
    if (!staff?.id) return;
    const staffId = staff.id;
    const isAdmin = staff.role === 'admin';
    return subscribeAppForegroundDebounced(() => {
      refreshNotifications();
      refreshUnreadMessages(staffId);
      void loadBoardList(staffId);
      if (isAdmin) refreshAdminWarning(staffId);
      void refreshNewAssignHint(staffId);
    });
  }, [staff?.id, staff?.role, refreshNotifications, refreshUnreadMessages, loadBoardList, refreshAdminWarning, refreshNewAssignHint]);

  const shareFabLabel =
    canCreateFeed && canKbsMrz
      ? t('staffFabCreateAll')
      : canCreateFeed
        ? t('staffFabCreatePostOrStory')
        : t('staffFabCreateMrzOnly');

  const feedHeaderSideW = feedHeaderSideMinWidth(showHeaderFabMenu, canKbsMrz);

  const closeMenu = () => {
    setMenuVisible(false);
  };

  const handleMenuPress = () => {
    setMenuSheetMounted(true);
    setMenuVisible((wasOpen) => {
      const opening = !wasOpen;
      if (opening) {
        const staffId = staff?.id;
        if (staffId) {
          setTimeout(() => {
            void markNewAssignMenuOpened(staffId);
          }, 0);
        }
      }
      return opening;
    });
  };

  const renderFeedHeaderLeft = () => (
    <StaffFeedHeaderLeft
      menuOpen={menuVisible}
      onMenuPress={handleMenuPress}
      menuHighlightLabel={newAssignMenuLabel ? t('newBtn') : null}
      showShare={showHeaderFabMenu}
      onSharePress={() => setFabVisible(true)}
      shareAccessibilityLabel={shareFabLabel}
    />
  );

  const renderFeedHeaderRight = () => (
    <StaffFeedHeaderRight
      showMrz={canKbsMrz}
      onMrzPress={() => router.push({ pathname: '/staff/mrz-scan', params: { mode: 'single' } } as never)}
    />
  );

  const isStaffFeedTab = (routeName: string) => routeName === 'index';

  return (
    <>
    <StaffBoardAnnouncementToast />
    <Tabs
      tabBar={(props) => (
        <FloatingIslandTabBar {...props} surfaceColor={pds.cardBg} borderColor={pds.borderLight} />
      )}
      screenListeners={({ route }) => ({
        tabPress: () => {
          if (route.name === 'admin') {
            clearAdminAutoOpenSuppress();
          } else {
            signalStaffExitedAdminPanelFromRoot();
          }
        },
      })}
      screenOptions={({ route }) => {
        const feedTab = isStaffFeedTab(route.name);
        return {
        /** iOS: tüm sekmeler erken mount (flicker önleme). Android: lazy — aynı anda feed+stok+mesaj mount etmesin. */
        lazy: Platform.OS === 'android',
        /** Android: ziyaret edilmeyen sekmeyi bellekten ayır. iOS: feed flicker önleme için tut. */
        detachInactiveScreens: Platform.OS === 'android',
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: pds.indigo,
        tabBarInactiveTintColor: pds.subtext,
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
          backgroundColor: 'rgba(255,255,255,0.96)',
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 1,
          borderBottomColor: '#eee',
        },
        headerTransparent: false,
        headerShadowVisible: false,
        headerTitleAlign: 'center' as const,
        headerTintColor: IG_HEADER_FG,
        headerTitleStyle: { fontSize: 19, fontWeight: '800', color: '#111827', letterSpacing: 0.3 },
        ...(Platform.OS === 'android' ? { statusBarColor: 'rgba(255,255,255,0.96)', statusBarStyle: 'dark' as const } : null),
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
          title: '',
          headerTitle: () => <StaffBoardHeaderEye />,
          headerTitleAlign: 'center',
          headerTitleContainerStyle: {
            left: 0,
            right: 0,
            alignItems: 'center',
            justifyContent: 'center',
          },
          tabBarActiveTintColor: pds.indigo,
          tabBarLabel: t('staffTab'),
          tabBarIcon: ({ focused }) => (
            <TabBarScaledIcon focused={focused}>
              <Ionicons
                name={focused ? 'people' : 'people-outline'}
                size={TAB_ICON_SIZE}
                color={focused ? pds.indigo : appTabBar.inactive}
              />
            </TabBarScaledIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: t('tasks'),
          headerTitle: t('tasks'),
          tabBarActiveTintColor: pds.indigo,
          tabBarLabel: t('tasks'),
          tabBarIcon: ({ focused }) => (
            <TabBarScaledIcon focused={focused}>
              <Ionicons
                name={focused ? 'checkbox' : 'checkbox-outline'}
                size={TAB_ICON_SIZE}
                color={focused ? pds.indigo : appTabBar.inactive}
              />
            </TabBarScaledIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="stock"
        options={{
          title: t('stockTab'),
          headerTitle: t('stockManagement'),
          tabBarActiveTintColor: pds.indigo,
          tabBarLabel: t('stockTab'),
          tabBarIcon: ({ focused }) => (
            <TabBarScaledIcon focused={focused}>
              <Ionicons
                name={focused ? 'cube' : 'cube-outline'}
                size={TAB_ICON_SIZE}
                color={focused ? pds.indigo : appTabBar.inactive}
              />
            </TabBarScaledIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('messages'),
          headerTitle: t('teamChat'),
          tabBarActiveTintColor: pds.indigo,
          tabBarShowLabel: false,
          tabBarIcon: ({ focused }) => (
            <CenterMessageTabBarIcon focused={focused} unreadCount={unreadMessagesCount} />
          ),
        }}
      />
      <Tabs.Screen
        name="emergency"
        options={{
          title: t('screenEmergency'),
          headerTitle: t('screenEmergency'),
          tabBarActiveTintColor: pds.indigo,
          tabBarLabel: t('screenEmergency'),
          tabBarIcon: ({ focused }) => (
            <TabBarScaledIcon focused={focused}>
              <Ionicons
                name={focused ? 'warning' : 'warning-outline'}
                size={TAB_ICON_SIZE}
                color={focused ? pds.indigo : appTabBar.inactive}
              />
            </TabBarScaledIcon>
          ),
          href: staff?.role === 'admin' ? null : undefined,
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
          title: t('acceptances'),
          headerTitle: t('acceptancesHeader'),
          tabBarActiveTintColor: pds.indigo,
          tabBarLabel: t('acceptances'),
          tabBarIcon: ({ focused }) => (
            <TabBarScaledIcon focused={focused}>
              <Ionicons
                name={focused ? 'document-text' : 'document-text-outline'}
                size={TAB_ICON_SIZE}
                color={focused ? pds.indigo : appTabBar.inactive}
              />
            </TabBarScaledIcon>
          ),
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
          title: t('adminTab'),
          headerTitle: t('managementPanel'),
          tabBarActiveTintColor: pds.indigo,
          tabBarLabel: t('adminTab'),
          tabBarBadge: staff?.role === 'admin' && adminWarningCount > 0 ? (adminWarningCount > 99 ? '99+' : adminWarningCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: theme.colors.error },
          tabBarIcon: ({ focused }) => (
            <TabBarScaledIcon focused={focused}>
              <Ionicons
                name={focused ? 'shield' : 'shield-outline'}
                size={TAB_ICON_SIZE}
                color={focused ? pds.indigo : appTabBar.inactive}
              />
            </TabBarScaledIcon>
          ),
          href: staff?.role === 'admin' ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('myProfile'),
          headerTitle: '',
          headerShown: true,
          tabBarActiveTintColor: pds.indigo,
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
    {menuSheetMounted ? (
      <StaffQuickMenuSheet
        visible={menuVisible}
        onClose={closeMenu}
        closeLabel={t('close')}
        identity={
          staff
            ? {
                fullName: staff.full_name,
                profileImage: staff.profile_image ?? null,
                roleLabel: staffRoleLabel(staff.role),
                department: staff.department,
                organizationName: staff.organization?.name ?? null,
              }
            : null
        }
        onProfilePress={() => {
          closeMenu();
          router.push('/staff/profile' as Href);
        }}
        layout={menuLayout}
        onSelect={(href) => {
          closeMenu();
          router.push(href as never);
        }}
      />
    ) : null}
    <StaffFeedShareSheet
      visible={fabVisible}
      onClose={() => setFabVisible(false)}
      canCreateFeed={canCreateFeed}
      canKbsMrz={canKbsMrz}
      onPost={() => {
        setFabVisible(false);
        router.push('/staff/feed/new' as never);
      }}
      onStory={() => {
        setFabVisible(false);
        router.push('/staff/feed/story-new' as never);
      }}
      onMrz={() => {
        setFabVisible(false);
        router.push({ pathname: '/staff/mrz-scan', params: { mode: 'single' } } as never);
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
