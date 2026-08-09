import { memo, useMemo, useRef } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  PanResponder,
  useWindowDimensions,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isStaffFeedHomePath } from '@/lib/staffHamburgerNavigation';
import { useStaffHamburgerUiStore } from '@/stores/staffHamburgerUiStore';
import { useAuthStore } from '@/stores/authStore';
import { useStaffNewAssignmentHintStore } from '@/stores/staffNewAssignmentHintStore';
import { getFloatingTabBarTotalHeight } from '@/constants/floatingTabBarMetrics';

const IS_ANDROID = Platform.OS === 'android';
/** Sol kenar — sağa kaydır → menü aç (⋯ ile çakışmaz) */
const EDGE_WIDTH = 22;
const OPEN_DX = 28;
const OPEN_VX = 0.25;

/**
 * Sağa kaydır → menü aç (sol kenardan içe; sol drawer / X).
 */
export const StaffHamburgerEdgeOpenGesture = memo(function StaffHamburgerEdgeOpenGesture() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const visible = useStaffHamburgerUiStore((s) => s.visible);
  const navigatingAway = useStaffHamburgerUiStore((s) => s.navigatingAway);
  const open = useStaffHamburgerUiStore((s) => s.open);
  const staffId = useAuthStore((s) => s.staff?.id);
  const markNewAssignMenuOpened = useStaffNewAssignmentHintStore((s) => s.markHamburgerMenuOpened);
  const enabled = isStaffFeedHomePath(pathname) && !visible && !navigatingAway;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const tabBarH = getFloatingTabBarTotalHeight(insets);
  const edgeBottom = Math.max(tabBarH, insets.bottom + 56);

  const openMenu = useRef(() => {
    open({ instant: IS_ANDROID });
    if (staffId) void markNewAssignMenuOpened(staffId);
  });
  openMenu.current = () => {
    open({ instant: IS_ANDROID });
    if (staffId) void markNewAssignMenuOpened(staffId);
  };

  const tryOpen = (g: PanResponderGestureState) => {
    if (!enabledRef.current) return;
    if (g.dx >= OPEN_DX || g.vx >= OPEN_VX) {
      openMenu.current();
    }
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_e: GestureResponderEvent, g: PanResponderGestureState) => {
          if (!enabledRef.current) return false;
          return g.dx > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.05;
        },
        onMoveShouldSetPanResponderCapture: (_e, g) => {
          if (!enabledRef.current) return false;
          return g.dx > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.1;
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_e, g) => tryOpen(g),
        onPanResponderTerminate: (_e, g) => tryOpen(g),
      }),
    []
  );

  if (!enabled) return null;

  return (
    <View style={styles.host} pointerEvents="box-none" collapsable={false}>
      <View
        style={[
          styles.edge,
          {
            top: insets.top + 48,
            height: Math.max(120, winH - insets.top - 48 - edgeBottom),
            width: EDGE_WIDTH,
          },
        ]}
        collapsable={false}
        {...pan.panHandlers}
      />
    </View>
  );
});

StaffHamburgerEdgeOpenGesture.displayName = 'StaffHamburgerEdgeOpenGesture';

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5000,
    elevation: IS_ANDROID ? 5000 : 0,
  },
  edge: {
    position: 'absolute',
    left: 0,
    backgroundColor: 'transparent',
  },
});
