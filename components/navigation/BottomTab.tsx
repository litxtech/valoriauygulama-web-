import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { BottomTabBarHeightCallbackContext } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, Home, MessageCircle, UserRound } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { GlassBackground } from '@/components/navigation/GlassBackground';
import { TabButton } from '@/components/navigation/TabButton';
import { CreateButton } from '@/components/navigation/CreateButton';
import { CreateActionSheet } from '@/components/navigation/CreateActionSheet';
import { getEffectiveBottomInset } from '@/lib/effectiveSafeArea';
import {
  VALORIA_TAB_BAR_CONTENT_HEIGHT,
  VALORIA_TAB_BAR_RADIUS,
  FLOAT_SIDE_INSET,
  FLOAT_BOTTOM_GAP,
} from '@/constants/floatingTabBarMetrics';
import { useStaffBottomNavStore } from '@/stores/staffBottomNavStore';
import { signalStaffExitedAdminPanelFromRoot } from '@/lib/staffAdminTabNavigation';

const HIDE_MS = 300;

type Props = BottomTabBarProps & {
  messagesBadge?: number;
  notificationsBadge?: number;
};

const ROUTE_HOME = 'index';
const ROUTE_MESSAGES = 'messages';
const ROUTE_NOTIFICATIONS = 'notifications';
const ROUTE_PROFILE = 'profile';

/**
 * Valoria premium bottom tab — 5 slots, glass dock, create FAB sheet.
 */
export function BottomTab({
  state,
  navigation,
  messagesBadge = 0,
  notificationsBadge = 0,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const onTabBarHeightChange = useContext(BottomTabBarHeightCallbackContext);
  const visible = useStaffBottomNavStore((s) => s.visible);
  const createOpen = useStaffBottomNavStore((s) => s.createOpen);
  const setCreateOpen = useStaffBottomNavStore((s) => s.setCreateOpen);

  const rawBottom = insets.bottom;
  const bottomPad =
    (Platform.OS === 'android' ? getEffectiveBottomInset({ bottom: rawBottom }) : rawBottom) +
    FLOAT_BOTTOM_GAP;

  const translateY = useRef(new Animated.Value(0)).current;
  const [barH, setBarH] = useState(VALORIA_TAB_BAR_CONTENT_HEIGHT + bottomPad);
  const focused = state.routes[state.index]?.name;

  useEffect(() => {
    if (createOpen) {
      useStaffBottomNavStore.getState().setVisible(true);
    }
  }, [createOpen]);

  useEffect(() => {
    useStaffBottomNavStore.getState().setVisible(true);
  }, [focused]);

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: visible ? 0 : barH + 24,
      duration: HIDE_MS,
      useNativeDriver: true,
    }).start();
  }, [visible, barH, translateY]);

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const h = e.nativeEvent.layout.height;
      setBarH(h);
      // Absolute overlay — scenes pad themselves
      onTabBarHeightChange?.(0);
    },
    [onTabBarHeightChange]
  );

  const goRoute = useCallback(
    (routeName: string) => {
      signalStaffExitedAdminPanelFromRoot();
      const route = state.routes.find((r) => r.name === routeName);
      if (!route) return;
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!event.defaultPrevented) {
        navigation.navigate(routeName);
      }
    },
    [navigation, state.routes]
  );

  return (
    <>
      <Animated.View
        onLayout={handleLayout}
        style={[
          styles.shell,
          {
            left: FLOAT_SIDE_INSET,
            right: FLOAT_SIDE_INSET,
            transform: [{ translateY }],
          },
        ]}
        pointerEvents={visible ? 'box-none' : 'none'}
      >
        <View style={styles.shadowHost} pointerEvents="box-none">
          <GlassBackground borderRadius={VALORIA_TAB_BAR_RADIUS} opacity={0.85} style={styles.glass}>
            <View
              style={[
                styles.row,
                {
                  minHeight: VALORIA_TAB_BAR_CONTENT_HEIGHT,
                  paddingBottom: Math.max(bottomPad, 8),
                },
              ]}
            >
              <TabButton
                label={t('home')}
                icon={Home}
                focused={focused === ROUTE_HOME}
                onPress={() => goRoute(ROUTE_HOME)}
              />
              <TabButton
                label={t('messages')}
                icon={MessageCircle}
                focused={focused === ROUTE_MESSAGES}
                onPress={() => goRoute(ROUTE_MESSAGES)}
                badgeCount={messagesBadge}
              />
              <CreateButton
                onPress={() => setCreateOpen(true)}
                accessibilityLabel={t('navCreate')}
              />
              <TabButton
                label={t('notifications')}
                icon={Bell}
                focused={focused === ROUTE_NOTIFICATIONS}
                onPress={() => goRoute(ROUTE_NOTIFICATIONS)}
                badgeCount={notificationsBadge}
              />
              <TabButton
                label={t('myProfile')}
                icon={UserRound}
                focused={focused === ROUTE_PROFILE}
                onPress={() => goRoute(ROUTE_PROFILE)}
              />
            </View>
          </GlassBackground>
        </View>
      </Animated.View>

      <CreateActionSheet visible={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    bottom: 0,
  },
  shadowHost: {
    borderRadius: VALORIA_TAB_BAR_RADIUS,
    shadowColor: '#0B3D36',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
    elevation: 12,
  },
  glass: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingTop: 6,
  },
});
