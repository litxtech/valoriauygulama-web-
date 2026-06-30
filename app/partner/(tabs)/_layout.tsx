import { useEffect, useState, useCallback, type ReactNode, type ComponentProps } from 'react';
import { ActivityIndicator, View, StyleSheet, Platform } from 'react-native';
import { Tabs, useRouter, usePathname } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { usePartnerAuthStore } from '@/stores/partnerAuthStore';
import { safeRouterReplace } from '@/lib/safeRouter';
import { fetchPartnerUnreadNotificationCount } from '@/lib/breakfastPartner';
import { partnerUnreadCount } from '@/lib/messagingApi';
import { preloadPartnerAccountSnapshot } from '@/lib/partnerAccountCache';
import { partnerTheme } from '@/lib/breakfastPartnerTheme';
import { PartnerFixedHotelHeader, PartnerHeaderMessagesButton, PartnerHeaderNotificationButton, PartnerSwitchToMainAppButton } from '@/components/breakfastPartner/PartnerUi';
import { PartnerBreakfastCenterTabIcon } from '@/components/breakfastPartner/PartnerBreakfastCenterTabIcon';
import { FloatingIslandTabBar } from '@/components/FloatingIslandTabBar';
import { vibrantPartnerIconColor, getAppTabBarColors } from '@/constants/tabBarTheme';
import { getFloatingTabBarInnerHeight, getFloatingTabBarBarHeight } from '@/constants/floatingTabBarMetrics';
import { hapticSelection } from '@/lib/hapticsSafe';

const TAB_ICON_SIZE = 24;

function TabBarScaledIcon({ focused, children }: { focused: boolean; children: ReactNode }) {
  if (Platform.OS === 'android') return <>{children}</>;
  return <View style={{ transform: [{ scale: focused ? 1.08 : 1 }] }}>{children}</View>;
}

export default function PartnerTabsLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const staff = useAuthStore((s) => s.staff);
  const partner = usePartnerAuthStore((s) => s.partner);
  const partnerCheckComplete = usePartnerAuthStore((s) => s.partnerCheckComplete);
  const [unread, setUnread] = useState(0);
  const [msgUnread, setMsgUnread] = useState(0);

  const tabBarHeight = getFloatingTabBarBarHeight();
  const tabBarInnerHeight = getFloatingTabBarInnerHeight();
  const tabBarPaddingBottom = Platform.OS === 'android' ? 0 : 4;
  const tabBarPaddingTop = Platform.OS === 'android' ? 4 : 4;
  const onNotificationsScreen = pathname.includes('/notifications');
  const onMessagesScreen = pathname.includes('/messages');

  const refreshUnread = useCallback(async () => {
    try {
      setUnread(await fetchPartnerUnreadNotificationCount());
    } catch {
      setUnread(0);
    }
  }, []);

  const refreshMsgUnread = useCallback(async () => {
    try {
      setMsgUnread(await partnerUnreadCount());
    } catch {
      setMsgUnread(0);
    }
  }, []);

  useEffect(() => {
    if (partner?.isPortalActive && partner.hotel.id) {
      preloadPartnerAccountSnapshot(partner.hotel.id);
    }
  }, [partner?.isPortalActive, partner?.hotel.id]);

  useFocusEffect(
    useCallback(() => {
      if (partner?.isPortalActive) {
        void refreshUnread();
        void refreshMsgUnread();
      }
    }, [partner?.isPortalActive, refreshUnread, refreshMsgUnread])
  );

  useEffect(() => {
    if (staff) {
      safeRouterReplace(router, '/staff');
      return;
    }
    if (!user) {
      safeRouterReplace(router, '/partner/login');
      return;
    }
    if (partner && partner.userId !== user.id) {
      void usePartnerAuthStore.getState().resolvePartner(user);
      return;
    }
    if (partnerCheckComplete && !partner) {
      safeRouterReplace(router, '/partner/register');
      return;
    }
    if (partnerCheckComplete && partner && !partner.isPortalActive) {
      safeRouterReplace(router, '/partner/pending');
    }
  }, [user, staff, partner, partnerCheckComplete, router]);

  const tabBarColors = getAppTabBarColors(true);

  const renderTabBar = useCallback(
    (props: BottomTabBarProps) => (
      <FloatingIslandTabBar
        {...props}
        variant="partner"
        surfaceColor={tabBarColors.shellBackground}
        borderColor="rgba(255,255,255,0.12)"
        hidden={false}
      />
    ),
    [tabBarColors.shellBackground]
  );

  const openNotifications = useCallback(() => {
    hapticSelection();
    router.push('/partner/(tabs)/notifications');
    setTimeout(refreshUnread, 800);
  }, [router, refreshUnread]);

  const openMessages = useCallback(() => {
    hapticSelection();
    router.push('/partner/(tabs)/messages');
    setTimeout(refreshMsgUnread, 800);
  }, [router, refreshMsgUnread]);

  const partnerTabIcon = (routeName: string, outline: ComponentProps<typeof Ionicons>['name'], filled: ComponentProps<typeof Ionicons>['name']) =>
    function PartnerTabIcon({ focused }: { focused: boolean; color: string; size: number }) {
      const c = vibrantPartnerIconColor(routeName, focused);
      return (
        <TabBarScaledIcon focused={focused}>
          <Ionicons name={focused ? filled : outline} size={TAB_ICON_SIZE} color={c} />
        </TabBarScaledIcon>
      );
    };

  if (!user || staff || !partnerCheckComplete || !partner || !partner.isPortalActive) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={partnerTheme.accent} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: partnerTheme.bg }}>
      <PartnerFixedHotelHeader
        hotelName={partner.hotel.name}
        subtitle={partner.fullName}
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <PartnerSwitchToMainAppButton />
            <PartnerHeaderMessagesButton
              unread={msgUnread}
              active={onMessagesScreen}
              onPress={openMessages}
            />
            <PartnerHeaderNotificationButton
              unread={unread}
              active={onNotificationsScreen}
              onPress={openNotifications}
            />
          </View>
        }
      />
      <View style={{ flex: 1 }}>
        <Tabs
          initialRouteName="index"
          tabBar={renderTabBar}
          screenListeners={{
            tabPress: () => {
              hapticSelection();
            },
          }}
          screenOptions={{
            headerShown: false,
            lazy: true,
            detachInactiveScreens: false,
            freezeOnBlur: true,
            tabBarHideOnKeyboard: true,
            sceneStyle: { backgroundColor: partnerTheme.bg },
            tabBarActiveTintColor: partnerTheme.accent,
            tabBarInactiveTintColor: partnerTheme.mutedSoft,
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
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: 'Portal',
              tabBarIcon: partnerTabIcon('index', 'grid-outline', 'grid'),
            }}
          />
          <Tabs.Screen
            name="history"
            options={{
              title: 'Geçmiş',
              tabBarIcon: partnerTabIcon('history', 'calendar-outline', 'calendar'),
            }}
          />
          <Tabs.Screen
            name="teyit"
            options={{
              title: 'Teyit',
              tabBarShowLabel: false,
              tabBarIcon: ({ focused }) => <PartnerBreakfastCenterTabIcon focused={focused} />,
            }}
          />
          <Tabs.Screen
            name="account"
            options={{
              title: 'Cari',
              tabBarIcon: partnerTabIcon('account', 'wallet-outline', 'wallet'),
            }}
          />
          <Tabs.Screen
            name="messages"
            options={{
              href: null,
              title: 'Mesajlar',
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              title: 'Profil',
              tabBarIcon: partnerTabIcon('profile', 'person-circle-outline', 'person-circle'),
            }}
          />
          <Tabs.Screen
            name="notifications"
            options={{
              href: null,
              title: 'Bildirimler',
            }}
          />
        </Tabs>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: partnerTheme.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
