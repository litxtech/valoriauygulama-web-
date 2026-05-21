import { useCallback, useEffect } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, AppState, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs, useRouter, useFocusEffect, type Href } from 'expo-router';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { FloatingIslandTabBar } from '@/components/FloatingIslandTabBar';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useGuestMessagingStore } from '@/stores/guestMessagingStore';
import { useGuestNotificationStore } from '@/stores/guestNotificationStore';
import { useScrollToTopStore } from '@/stores/scrollToTopStore';
import { guestListConversations } from '@/lib/messagingApi';
import { subscribeAppForegroundDebounced } from '@/lib/appForegroundDebounce';
import { savePushTokenForGuest } from '@/lib/notificationsPush';
import { theme } from '@/constants/theme';
import { pds } from '@/constants/personelDesignSystem';
import { appTabBar, appTabBarCustomer, vibrantIconColor } from '@/constants/tabBarTheme';
import { getFloatingTabBarInnerHeight, getFloatingTabBarTotalHeight } from '@/constants/floatingTabBarMetrics';
import { CachedImage } from '@/components/CachedImage';
import { CenterMessageTabBarIcon } from '@/components/AppTabBarCenterMessageButton';
import { complaintsText } from '@/lib/complaintsI18n';

const TAB_ICON_SIZE = 24;
const PROFILE_TAB_AVATAR_SIZE = 26;

const IG_HEADER_BG = 'rgba(255,255,255,0.96)';
const IG_HEADER_FG = '#262626';
const IG_HEADER_BORDER = '#eee';

function CustomerProfileTabIcon({ color: _c, focused }: { color: string; focused: boolean }) {
  const user = useAuthStore((s) => s.user);
  const c = vibrantIconColor('customer', 'profile', focused);
  const avatarUri = (user?.user_metadata?.avatar_url as string) || null;
  if (avatarUri) {
    return (
      <View style={[tabAvatarStyles.tabAvatarWrap, { borderColor: focused ? c : theme.colors.borderLight }]}>
        <CachedImage uri={avatarUri} style={tabAvatarStyles.tabAvatar} contentFit="cover" />
      </View>
    );
  }
  return <Ionicons name={focused ? 'person' : 'person-outline'} size={TAB_ICON_SIZE} color={c} />;
}

const tabAvatarStyles = StyleSheet.create({
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
});

function AdminPanelHeaderButton() {
  const router = useRouter();
  const { t } = useTranslation();
  const staff = useAuthStore((s) => s.staff);
  if (staff?.role !== 'admin') return null;
  return (
    <TouchableOpacity onPress={() => router.push('/admin')} style={{ marginRight: 12 }} activeOpacity={0.8}>
      <Text style={{ color: IG_HEADER_FG, fontWeight: '600', fontSize: 14 }}>{t('panel')}</Text>
    </TouchableOpacity>
  );
}

/** Profil: kapak header üzerine biner; sadece geri; ana sekmeye döner */
function CustomerProfileBackToHome() {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      onPress={() => router.push('/customer' as Href)}
      style={profileHeaderStyles.roundBtn}
      activeOpacity={0.85}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityLabel={t('back')}
    >
      <Ionicons name="chevron-back" size={24} color="#fff" />
    </TouchableOpacity>
  );
}

const profileHeaderStyles = StyleSheet.create({
  roundBtn: {
    marginLeft: 4,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

function NotificationBellHeaderButton() {
  const router = useRouter();
  const unreadCount = useGuestNotificationStore((s) => s.unreadCount);
  return (
    <TouchableOpacity
      onPress={() => router.push('/customer/notifications')}
      style={{ marginRight: 12, padding: 4 }}
      activeOpacity={0.8}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <View>
        <Ionicons name="notifications-outline" size={24} color={IG_HEADER_FG} />
        {unreadCount > 0 ? (
          <View
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: pds.blue,
              justifyContent: 'center',
              alignItems: 'center',
              paddingHorizontal: 4,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function NewChatHeaderButton() {
  const router = useRouter();
  return (
    <TouchableOpacity
      onPress={() => router.push('/customer/new-chat')}
      style={{ marginRight: 12, padding: 4 }}
      activeOpacity={0.8}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Ionicons name="add-outline" size={26} color={IG_HEADER_FG} />
    </TouchableOpacity>
  );
}

function FeedCreateHeaderButton() {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      onPress={() => router.push('/customer/feed/new')}
      style={styles.feedCreateBtn}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityLabel={t('share')}
    >
      <Ionicons name="add-outline" size={28} color={IG_HEADER_FG} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  feedCreateBtn: {
    marginLeft: 8,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default function CustomerTabsLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const tabBarHeight = getFloatingTabBarTotalHeight(insets);
  const tabBarInnerHeight = getFloatingTabBarInnerHeight();
  const tabBarPaddingBottom = Platform.OS === 'android' ? 0 : 4;
  const tabBarPaddingTop = Platform.OS === 'android' ? 4 : 4;
  const staff = useAuthStore((s) => s.staff);
  const { appToken, setUnreadCount, loadStoredToken, unreadCount: guestMsgUnread } = useGuestMessagingStore();
  const refreshNotifications = useGuestNotificationStore((s) => s.refresh);

  // Misafir push token: appToken varsa kaydet (iOS beğeni/yorum bildirimi; sadece Bildirimler sekmesine bağlı kalmasın)
  useEffect(() => {
    loadStoredToken();
  }, [loadStoredToken]);
  useEffect(() => {
    if (!appToken) return;
    savePushTokenForGuest(appToken).catch(() => {});
  }, [appToken]);

  // iOS: token gecikmeli gelirse uygulama ön plana gelince tekrar kaydet
  useEffect(() => {
    if (!appToken) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') savePushTokenForGuest(appToken).catch(() => {});
    });
    return () => sub.remove();
  }, [appToken]);

  useFocusEffect(
    useCallback(() => {
      if (!appToken) return () => {};
      let cancelled = false;
      const refresh = async () => {
        if (cancelled) return;
        const list = await guestListConversations(appToken);
        const total = list.reduce((s, c) => s + (c.unread_count ?? 0), 0);
        setUnreadCount(total);
      };
      refresh();
      const interval = setInterval(refresh, 90000);
      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }, [appToken, setUnreadCount])
  );

  useFocusEffect(
    useCallback(() => {
      refreshNotifications();
      const interval = setInterval(refreshNotifications, 180000);
      return () => clearInterval(interval);
    }, [refreshNotifications])
  );

  // Android: ön plana gelince tab rozetleri (debounce — resume anında UI donmasın)
  useEffect(() => {
    if (!appToken) return;
    const token = appToken;
    return subscribeAppForegroundDebounced(() => {
      refreshNotifications();
      guestListConversations(token).then((list) => {
        const total = list.reduce((s, c) => s + (c.unread_count ?? 0), 0);
        setUnreadCount(total);
      });
    });
  }, [appToken, refreshNotifications, setUnreadCount]);

  return (
    <Tabs
      tabBar={(props) => (
        <FloatingIslandTabBar {...props} surfaceColor={appTabBar.background} borderColor={appTabBar.border} />
      )}
      screenOptions={({ route }) => {
        const feedTab = route.name === 'index';
        return {
        /** iOS: erken mount. Android: lazy — tüm sekmeleri aynı anda yükleme. */
        lazy: Platform.OS === 'android',
        detachInactiveScreens: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: appTabBar.fallbackActive,
        tabBarInactiveTintColor: appTabBar.inactive,
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
        tabBarActiveBackgroundColor: 'transparent',
        tabBarInactiveBackgroundColor: 'transparent',
        headerStyle: {
          backgroundColor: IG_HEADER_BG,
          shadowOpacity: 0,
          elevation: 0,
          borderBottomWidth: 1,
          borderBottomColor: IG_HEADER_BORDER,
        },
        headerShadowVisible: false,
        headerTitleAlign: 'center' as const,
        headerTintColor: IG_HEADER_FG,
        headerTitleStyle: { fontSize: 19, fontWeight: '800', color: '#111827', letterSpacing: 0.3 },
        ...(Platform.OS === 'android' ? { statusBarColor: IG_HEADER_BG, statusBarStyle: 'dark' as const } : null),
        headerLeftContainerStyle: feedTab ? { paddingLeft: 6, minWidth: 88 } : { paddingLeft: 0, minWidth: 0 },
        headerRightContainerStyle: feedTab ? { paddingRight: 6, minWidth: 88 } : { paddingRight: 0, minWidth: 0 },
        headerRight: feedTab
          ? () => (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <NotificationBellHeaderButton />
                <AdminPanelHeaderButton />
              </View>
            )
          : () => null,
        headerLeft: feedTab ? () => <FeedCreateHeaderButton /> : () => null,
      };
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('home'),
          headerTitle: '',
          headerShown: true,
          tabBarActiveTintColor: appTabBarCustomer.index,
          tabBarLabel: t('home'),
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              size={TAB_ICON_SIZE}
              color={vibrantIconColor('customer', 'index', focused)}
            />
          ),
          tabBarButton: (props) => (
            <TouchableOpacity
              {...props}
              onPress={() => {
                props.onPress?.();
                useScrollToTopStore.getState().scrollToTop?.();
              }}
              activeOpacity={1}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: t('mapTab'),
          headerShown: false,
          tabBarActiveTintColor: appTabBarCustomer.map,
          tabBarLabel: t('mapTab'),
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name={focused ? 'map' : 'map-outline'}
              size={TAB_ICON_SIZE}
              color={vibrantIconColor('customer', 'map', focused)}
            />
          ),
          tabBarStyle: { display: 'none', height: 0 },
        }}
      />
      <Tabs.Screen
        name="rooms"
        options={{
          href: null,
          title: t('rooms'),
          tabBarLabel: t('rooms'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'bed' : 'bed-outline'} size={TAB_ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="transfer-tour"
        options={{
          title: t('transferTourNavTitle'),
          headerTitle: t('transferTourNavTitle'),
          headerShown: true,
          tabBarActiveTintColor: appTabBarCustomer['transfer-tour'],
          tabBarLabel: t('transferTourTabBarLabel'),
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name={focused ? 'car' : 'car-outline'}
              size={TAB_ICON_SIZE}
              color={vibrantIconColor('customer', 'transfer-tour', focused)}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('messages'),
          headerTitle: t('messages'),
          headerShown: true,
          tabBarActiveTintColor: appTabBarCustomer.messages,
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <NotificationBellHeaderButton />
              <NewChatHeaderButton />
            </View>
          ),
          tabBarShowLabel: false,
          tabBarIcon: ({ focused }) => (
            <CenterMessageTabBarIcon focused={focused} unreadCount={guestMsgUnread} />
          ),
        }}
      />
      <Tabs.Screen
        name="dining-venues"
        options={{
          title: t('diningVenuesNavTitle'),
          headerTitle: t('diningVenuesNavTitle'),
          headerShown: true,
          tabBarActiveTintColor: appTabBarCustomer['dining-venues'],
          tabBarLabel: t('diningVenuesTabLabel'),
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name={focused ? 'restaurant' : 'restaurant-outline'}
              size={TAB_ICON_SIZE}
              color={vibrantIconColor('customer', 'dining-venues', focused)}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="complaints"
        options={{
          title: complaintsText('complaintsTab'),
          headerTitle: complaintsText('complaintsSystem'),
          headerShown: true,
          tabBarActiveTintColor: appTabBarCustomer.complaints,
          tabBarLabel: complaintsText('complaintsTab'),
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name={focused ? 'flag' : 'flag-outline'}
              size={TAB_ICON_SIZE}
              color={vibrantIconColor('customer', 'complaints', focused)}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: t('notifications'),
          href: null,
        }}
      />
      <Tabs.Screen
        name="personel"
        options={{
          title: t('staffTab'),
          headerTitle: '',
          tabBarActiveTintColor: appTabBarCustomer.personel,
          tabBarLabel: t('staffTab'),
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name={focused ? 'people' : 'people-outline'}
              size={TAB_ICON_SIZE}
              color={vibrantIconColor('customer', 'personel', focused)}
            />
          ),
          href: staff?.role === 'admin' ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={({ route }) => {
          const nested = getFocusedRouteNameFromRoute(route) ?? 'index';
          const profileIcon = ({ color, focused }: { color: string; focused: boolean }) => (
            <CustomerProfileTabIcon color={color} focused={focused} />
          );
          if (nested !== 'index') {
            return {
              title: t('profileTab'),
              headerTitle: t('profileTab'),
              headerShown: false,
              tabBarShowLabel: false,
              tabBarActiveTintColor: appTabBarCustomer.profile,
              tabBarIcon: profileIcon,
            };
          }
          return {
            title: t('profileTab'),
            headerTitle: '',
            headerShown: true,
            headerTransparent: true,
            headerStyle: {
              backgroundColor: 'transparent',
              elevation: 0,
              shadowOpacity: 0,
              borderBottomWidth: 0,
            },
            headerShadowVisible: false,
            headerLeft: () => <CustomerProfileBackToHome />,
            headerRight: () => null,
            headerTintColor: '#ffffff',
            tabBarShowLabel: false,
            tabBarActiveTintColor: appTabBarCustomer.profile,
            tabBarIcon: profileIcon,
          };
        }}
      />
      <Tabs.Screen
        name="key"
        options={{
          href: null,
          title: t('digitalKey'),
        }}
      />
    </Tabs>
  );
}
