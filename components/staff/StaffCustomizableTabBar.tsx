import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Pressable,
  Animated,
  type LayoutChangeEvent,
} from 'react-native';
import { BottomTabBarHeightCallbackContext } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useRouter, usePathname, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getEffectiveBottomInset } from '@/lib/effectiveSafeArea';
import { GlassBackground } from '@/components/navigation/GlassBackground';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';
import {
  FLOAT_SIDE_INSET,
  FLOAT_BOTTOM_GAP,
  VALORIA_TAB_BAR_RADIUS,
  getFloatingTabBarInnerHeight,
} from '@/constants/floatingTabBarMetrics';
import { StaffFeedPttFab } from '@/components/staff/StaffFeedPttFab';
import { pds, pdsNight } from '@/constants/personelDesignSystem';
import { useAuthStore } from '@/stores/authStore';
import { useStaffTabPinsStore } from '@/stores/staffTabPinsStore';
import { useOrganizationUiFeaturesStore } from '@/stores/organizationUiFeaturesStore';
import { useStaffBottomNavStore } from '@/stores/staffBottomNavStore';
import { buildStaffHamburgerMenuLayout } from '@/lib/staffHamburgerMenu';
import {
  collectTabPinCandidates,
  buildStaffCoreTabPinExtras,
  buildStaffOpsTabPinExtras,
  nativeTabRouteForPinId,
  resolveShortcutItems,
  seedDefaultTabPinsIfNeeded,
} from '@/lib/staffTabCustomization';
import { mergePinnedIdsWithOrgLocks } from '@/lib/staffTabPinsConfig';
import type { StaffHamburgerMenuItem } from '@/lib/staffHamburgerTypes';
import { hapticSelection } from '@/lib/hapticsSafe';
import { canStaffUseIdCapture } from '@/lib/kbsMrzAccess';
import { clearAdminAutoOpenSuppress, signalStaffExitedAdminPanelFromRoot } from '@/lib/staffAdminTabNavigation';
import { CachedImage } from '@/components/CachedImage';
import { theme } from '@/constants/theme';

const ICON_SIZE = 22;
const PROFILE_AVATAR = 26;
const HIDE_MS = 300;

type BuiltItem =
  | {
      key: string;
      kind: 'route';
      routeName: string;
      label: string;
      icon: keyof typeof Ionicons.glyphMap;
      iconFocused: keyof typeof Ionicons.glyphMap;
      badge?: string | number;
      isProfile?: boolean;
    }
  | {
      key: string;
      kind: 'href';
      item: StaffHamburgerMenuItem;
    };

type Props = BottomTabBarProps & {
  surfaceColor?: string;
  unreadMessagesCount?: number;
  newTasksTabCount?: number;
  adminWarningCount?: number;
  notificationsBadge?: number;
};

function ProfileIcon({ focused, color }: { focused: boolean; color: string }) {
  const staff = useAuthStore((s) => s.staff);
  const uri = staff?.profile_image ?? null;
  if (uri) {
    return (
      <View style={[styles.avatarWrap, { borderColor: focused ? color : theme.colors.borderLight }]}>
        <CachedImage uri={uri} style={styles.avatar} contentFit="cover" />
      </View>
    );
  }
  return <Ionicons name={focused ? 'person' : 'person-outline'} size={ICON_SIZE} color={color} />;
}

/**
 * Personel alt tab: Ana sayfa + kullanıcının pinlediği özellikler + düzenle.
 * Admin yetkisi olan personel Admin’i pinleyebilir / varsayılan pin’de gelir.
 */
export function StaffCustomizableTabBar({
  state,
  navigation,
  descriptors: _descriptors,
  insets: navInsets,
  unreadMessagesCount = 0,
  newTasksTabCount = 0,
  adminWarningCount = 0,
  notificationsBadge = 0,
}: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { isNight } = usePremiumTheme();
  const colors = isNight ? pdsNight : pds;
  const activeColor = colors.accent;
  const inactiveColor = isNight ? '#8FA39E' : '#7A8F89';
  const staff = useAuthStore((s) => s.staff);
  const orgUiConfig = useOrganizationUiFeaturesStore((s) => s.config);
  const hydrate = useStaffTabPinsStore((s) => s.hydrate);
  const pinnedIds = useStaffTabPinsStore((s) => s.pinnedIds);
  const hydrated = useStaffTabPinsStore((s) => s.hydrated);
  const setPinnedOrder = useStaffTabPinsStore((s) => s.setPinnedOrder);
  const [seedDone, setSeedDone] = useState(false);
  const barVisible = useStaffBottomNavStore((s) => s.visible);

  const safeInsets = useSafeAreaInsets();
  const rawBottom = navInsets?.bottom ?? safeInsets.bottom;
  const bottomPad =
    (Platform.OS === 'android' ? getEffectiveBottomInset({ bottom: rawBottom }) : rawBottom) +
    FLOAT_BOTTOM_GAP;
  const onTabBarHeightChange = useContext(BottomTabBarHeightCallbackContext);
  const translateY = useRef(new Animated.Value(0)).current;
  const [barH, setBarH] = useState(getFloatingTabBarInnerHeight() + bottomPad);
  const innerH = getFloatingTabBarInnerHeight();
  const canIdCapture = canStaffUseIdCapture(staff);
  const isAdmin = staff?.role === 'admin';

  useEffect(() => {
    if (!staff?.id) return;
    void hydrate(staff.id);
  }, [staff?.id, hydrate]);

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: barVisible ? 0 : barH + 24,
      duration: HIDE_MS,
      useNativeDriver: true,
    }).start();
  }, [barVisible, barH, translateY]);

  useEffect(() => {
    useStaffBottomNavStore.getState().setVisible(true);
  }, [state.index]);

  const menuLayout = useMemo(() => {
    if (!staff) return null;
    return buildStaffHamburgerMenuLayout(
      t,
      {
        role: staff.role,
        app_permissions: staff.app_permissions,
        hidden_menu_item_ids: staff.hidden_menu_item_ids,
        kbs_access_enabled: staff.kbs_access_enabled,
        department: staff.department,
      },
      orgUiConfig
    );
  }, [
    t,
    staff?.role,
    staff?.app_permissions,
    staff?.hidden_menu_item_ids,
    staff?.kbs_access_enabled,
    staff?.department,
    orgUiConfig,
  ]);

  const extras = useMemo<StaffHamburgerMenuItem[]>(
    () => [
      {
        id: 'tasks',
        label: t('tasks'),
        href: '/staff/tasks',
        icon: 'checkbox-outline',
        accent: '#2563eb',
      },
      {
        id: 'acceptances',
        label: t('acceptances'),
        href: '/staff/(tabs)/acceptances',
        icon: 'document-text-outline',
        accent: '#7c3aed',
      },
      {
        id: 'notifications',
        label: t('notifications'),
        href: '/staff/(tabs)/notifications',
        icon: 'notifications-outline',
        accent: '#e11d48',
      },
      ...buildStaffCoreTabPinExtras(t, { canIdCapture, isAdmin: Boolean(isAdmin) }),
      ...buildStaffOpsTabPinExtras(staff),
    ],
    [t, canIdCapture, isAdmin, staff]
  );

  const available = useMemo(
    () => collectTabPinCandidates(menuLayout, extras),
    [menuLayout, extras]
  );

  const availableIdSet = useMemo(() => new Set(available.map((i) => i.id)), [available]);

  const effectivePinnedIds = useMemo(
    () => mergePinnedIdsWithOrgLocks(pinnedIds, orgUiConfig?.tabPins, availableIdSet),
    [pinnedIds, orgUiConfig?.tabPins, availableIdSet]
  );

  const pinnedItems = useMemo(
    () => resolveShortcutItems(available, effectivePinnedIds),
    [available, effectivePinnedIds]
  );

  useEffect(() => {
    if (!staff?.id || !hydrated || !available.length) return;
    if (effectivePinnedIds.join() === pinnedIds.join()) return;
    void setPinnedOrder(staff.id, effectivePinnedIds);
  }, [staff?.id, hydrated, available.length, effectivePinnedIds, pinnedIds, setPinnedOrder]);

  useEffect(() => {
    if (!staff?.id || !hydrated || seedDone || !available.length) return;
    let cancelled = false;
    void (async () => {
      const seeded = await seedDefaultTabPinsIfNeeded({
        staffId: staff.id,
        pinnedIds,
        available,
        setPinnedOrder,
        orgDefaultIds: orgUiConfig?.tabPins?.defaultIds,
      });
      if (!cancelled) setSeedDone(true);
      if (seeded) hapticSelection();
    })();
    return () => {
      cancelled = true;
    };
  }, [
    staff?.id,
    hydrated,
    seedDone,
    available,
    pinnedIds,
    setPinnedOrder,
    orgUiConfig?.tabPins?.defaultIds,
  ]);

  const focusedRoute = state.routes[state.index]?.name;
  const isFeedHome = focusedRoute === 'index';

  const items = useMemo((): BuiltItem[] => {
    const out: BuiltItem[] = [
      {
        key: 'index',
        kind: 'route',
        routeName: 'index',
        label: t('staffTab'),
        icon: 'people-outline',
        iconFocused: 'people',
      },
    ];

    for (const pin of pinnedItems) {
      const routeName = nativeTabRouteForPinId(pin.id);
      if (routeName === 'emergency' && isAdmin) {
        out.push({ key: `href-${pin.id}`, kind: 'href', item: pin });
        continue;
      }
      if (routeName === 'messages') {
        out.push({
          key: 'messages',
          kind: 'route',
          routeName: 'messages',
          label: pin.label,
          icon: 'chatbubbles-outline',
          iconFocused: 'chatbubbles',
          badge:
            unreadMessagesCount > 0
              ? unreadMessagesCount > 99
                ? '99+'
                : unreadMessagesCount
              : undefined,
        });
        continue;
      }
      if (routeName === 'notifications') {
        out.push({
          key: 'notifications',
          kind: 'route',
          routeName: 'notifications',
          label: pin.label,
          icon: 'notifications-outline',
          iconFocused: 'notifications',
          badge:
            notificationsBadge > 0
              ? notificationsBadge > 99
                ? '99+'
                : notificationsBadge
              : undefined,
        });
        continue;
      }
      if (routeName === 'id-capture') {
        out.push({
          key: 'id-capture',
          kind: 'route',
          routeName: 'id-capture',
          label: pin.label,
          icon: 'id-card-outline',
          iconFocused: 'id-card',
        });
        continue;
      }
      if (routeName === 'admin') {
        out.push({
          key: 'admin',
          kind: 'route',
          routeName: 'admin',
          label: pin.label,
          icon: 'shield-outline',
          iconFocused: 'shield',
          badge:
            adminWarningCount > 0
              ? adminWarningCount > 99
                ? '99+'
                : adminWarningCount
              : undefined,
        });
        continue;
      }
      if (routeName === 'profile') {
        out.push({
          key: 'profile',
          kind: 'route',
          routeName: 'profile',
          label: pin.label,
          icon: 'person-outline',
          iconFocused: 'person',
          isProfile: true,
        });
        continue;
      }
      if (routeName) {
        out.push({
          key: `route-${routeName}`,
          kind: 'route',
          routeName,
          label: pin.label,
          icon: pin.icon,
          iconFocused: pin.icon,
          badge:
            routeName === 'tasks' && newTasksTabCount > 0
              ? newTasksTabCount > 99
                ? '99+'
                : newTasksTabCount
              : undefined,
        });
      } else {
        out.push({ key: `href-${pin.id}`, kind: 'href', item: pin });
      }
    }

    return out;
  }, [
    t,
    pinnedItems,
    isAdmin,
    newTasksTabCount,
    unreadMessagesCount,
    adminWarningCount,
    notificationsBadge,
  ]);

  const handleShellLayout = useCallback(
    (e: LayoutChangeEvent) => {
      setBarH(e.nativeEvent.layout.height);
      onTabBarHeightChange?.(0);
    },
    [onTabBarHeightChange]
  );

  const isHrefActive = useCallback(
    (href: string) => {
      const path = pathname.replace(/\/$/, '');
      const target = href.replace(/\/$/, '').replace('/(tabs)', '');
      return path === target || path.startsWith(`${target}/`);
    },
    [pathname]
  );

  const onPressItem = useCallback(
    (item: BuiltItem) => {
      hapticSelection();
      useStaffBottomNavStore.getState().setVisible(true);
      if (item.kind === 'href') {
        signalStaffExitedAdminPanelFromRoot();
        router.push(item.item.href as Href);
        return;
      }
      if (item.routeName === 'admin') {
        clearAdminAutoOpenSuppress();
        router.push('/admin' as Href);
        return;
      }
      if (item.routeName === 'id-capture') {
        router.push('/staff/kbs/capture-id' as Href);
        return;
      }
      signalStaffExitedAdminPanelFromRoot();
      const route = state.routes.find((r) => r.name === item.routeName);
      if (!route) return;
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!event.defaultPrevented) {
        navigation.navigate(item.routeName);
      }
    },
    [navigation, router, state.routes]
  );

  return (
    <>
      {isFeedHome ? (
        <StaffFeedPttFab
          bottomOffset={barH + 10}
          isNight={isNight}
        />
      ) : null}
      <Animated.View
        onLayout={handleShellLayout}
        style={[
          styles.shell,
          styles.shellFloating,
          {
            left: FLOAT_SIDE_INSET,
            right: FLOAT_SIDE_INSET,
            transform: [{ translateY }],
          },
        ]}
        pointerEvents={barVisible ? 'box-none' : 'none'}
      >
        <View style={styles.shadowHost} pointerEvents="box-none">
          <GlassBackground borderRadius={VALORIA_TAB_BAR_RADIUS} opacity={0.85} style={styles.glassFill}>
            <View
              style={[
                styles.row,
                {
                  minHeight: innerH,
                  paddingBottom: Math.max(bottomPad, 8),
                },
              ]}
            >
              {items.map((item) => {
                let focused = false;
                let color: string = inactiveColor;
                let label = '';
                let iconNode: ReactNode = null;
                let badge: string | number | undefined;

                if (item.kind === 'href') {
                  label = item.item.label;
                  focused = isHrefActive(item.item.href);
                  color = focused ? activeColor : inactiveColor;
                  iconNode = <Ionicons name={item.item.icon} size={ICON_SIZE} color={color} />;
                } else {
                  label = item.label;
                  focused = focusedRoute === item.routeName;
                  color = focused ? activeColor : inactiveColor;
                  badge = item.badge;
                  iconNode = item.isProfile ? (
                    <ProfileIcon focused={focused} color={color} />
                  ) : (
                    <Ionicons
                      name={focused ? item.iconFocused : item.icon}
                      size={ICON_SIZE}
                      color={color}
                    />
                  );
                }

                return (
                  <Pressable
                    key={item.key}
                    onPress={() => onPressItem(item)}
                    style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: focused }}
                    accessibilityLabel={label}
                  >
                    <View>
                      {iconNode}
                      {badge != null && badge !== 0 && badge !== '0' ? (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>{badge}</Text>
                        </View>
                      ) : null}
                    </View>
                    {item.kind === 'route' && item.isProfile ? null : (
                      <Text style={[styles.label, { color }]} numberOfLines={1}>
                        {label}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </GlassBackground>
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  shell: {},
  shellFloating: {
    position: 'absolute',
    bottom: 0,
  },
  shadowHost: {
    borderRadius: VALORIA_TAB_BAR_RADIUS,
    shadowColor: '#0B3D36',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 10,
  },
  glassFill: { width: '100%' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    paddingHorizontal: 4,
    paddingTop: 8,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 2,
    minWidth: 0,
    minHeight: 48,
  },
  itemPressed: { opacity: 0.75 },
  label: {
    fontSize: 9,
    fontWeight: '600',
    maxWidth: '100%',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  avatarWrap: {
    width: PROFILE_AVATAR,
    height: PROFILE_AVATAR,
    borderRadius: PROFILE_AVATAR / 2,
    borderWidth: 2,
    overflow: 'hidden',
  },
  avatar: { width: '100%', height: '100%' },
});
