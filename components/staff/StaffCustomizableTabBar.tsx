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
import { GlassTabBarShell } from '@/components/premium/GlassTabBarShell';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';
import { getAppTabBarColors } from '@/constants/tabBarTheme';
import {
  FLOAT_SIDE_INSET,
  FLOAT_BOTTOM_GAP,
  getFloatingTabBarInnerHeight,
} from '@/constants/floatingTabBarMetrics';
import { useAuthStore } from '@/stores/authStore';
import { useStaffTabPinsStore } from '@/stores/staffTabPinsStore';
import { useOrganizationUiFeaturesStore } from '@/stores/organizationUiFeaturesStore';
import { buildStaffHamburgerMenuLayout } from '@/lib/staffHamburgerMenu';
import {
  collectTabPinCandidates,
  nativeTabRouteForPinId,
  resolveShortcutItems,
  seedDefaultTabPinsIfNeeded,
} from '@/lib/staffTabCustomization';
import type { StaffHamburgerMenuItem } from '@/lib/staffHamburgerTypes';
import { hapticSelection } from '@/lib/hapticsSafe';
import { canStaffUseIdCapture } from '@/lib/kbsMrzAccess';
import { clearAdminAutoOpenSuppress, signalStaffExitedAdminPanelFromRoot } from '@/lib/staffAdminTabNavigation';
import { CachedImage } from '@/components/CachedImage';
import { theme } from '@/constants/theme';

const ISLAND_RADIUS = 26;
const ICON_SIZE = 22;
const PROFILE_AVATAR = 26;

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
 * Personel alt tab: sabit sekmeler + kullanıcının eklediği özellikler + düzenle.
 */
export function StaffCustomizableTabBar({
  state,
  navigation,
  descriptors: _descriptors,
  insets: navInsets,
  surfaceColor,
  unreadMessagesCount = 0,
  newTasksTabCount = 0,
  adminWarningCount = 0,
}: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { isNight } = usePremiumTheme();
  const tabBar = getAppTabBarColors(isNight);
  const staff = useAuthStore((s) => s.staff);
  const orgUiConfig = useOrganizationUiFeaturesStore((s) => s.config);
  const hydrate = useStaffTabPinsStore((s) => s.hydrate);
  const pinnedIds = useStaffTabPinsStore((s) => s.pinnedIds);
  const hydrated = useStaffTabPinsStore((s) => s.hydrated);
  const setPinnedOrder = useStaffTabPinsStore((s) => s.setPinnedOrder);
  const [seedDone, setSeedDone] = useState(false);

  const safeInsets = useSafeAreaInsets();
  const rawBottom = navInsets?.bottom ?? safeInsets.bottom;
  const bottomPad =
    (Platform.OS === 'android' ? getEffectiveBottomInset({ bottom: rawBottom }) : rawBottom) +
    FLOAT_BOTTOM_GAP;
  const onTabBarHeightChange = useContext(BottomTabBarHeightCallbackContext);
  const translateY = useRef(new Animated.Value(0)).current;
  const resolvedSurface = surfaceColor ?? 'transparent';
  const innerH = getFloatingTabBarInnerHeight();
  const canIdCapture = canStaffUseIdCapture(staff);
  const isAdmin = staff?.role === 'admin';

  useEffect(() => {
    if (!staff?.id) return;
    void hydrate(staff.id);
  }, [staff?.id, hydrate]);

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
    ],
    [t]
  );

  const available = useMemo(
    () => collectTabPinCandidates(menuLayout, extras),
    [menuLayout, extras]
  );
  const pinnedItems = useMemo(
    () => resolveShortcutItems(available, pinnedIds),
    [available, pinnedIds]
  );

  useEffect(() => {
    if (!staff?.id || !hydrated || seedDone || !available.length) return;
    let cancelled = false;
    void (async () => {
      const seeded = await seedDefaultTabPinsIfNeeded({
        staffId: staff.id,
        pinnedIds,
        available,
        setPinnedOrder,
      });
      if (!cancelled) setSeedDone(true);
      if (seeded) hapticSelection();
    })();
    return () => {
      cancelled = true;
    };
  }, [staff?.id, hydrated, seedDone, available, pinnedIds, setPinnedOrder]);

  const focusedRoute = state.routes[state.index]?.name;

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

    out.push({
      key: 'messages',
      kind: 'route',
      routeName: 'messages',
      label: t('messages'),
      icon: 'chatbubbles-outline',
      iconFocused: 'chatbubbles',
      badge:
        unreadMessagesCount > 0
          ? unreadMessagesCount > 99
            ? '99+'
            : unreadMessagesCount
          : undefined,
    });

    if (canIdCapture) {
      out.push({
        key: 'id-capture',
        kind: 'route',
        routeName: 'id-capture',
        label: t('staffTabIdCapture'),
        icon: 'id-card-outline',
        iconFocused: 'id-card',
      });
    }

    if (isAdmin) {
      out.push({
        key: 'admin',
        kind: 'route',
        routeName: 'admin',
        label: t('adminTab'),
        icon: 'shield-outline',
        iconFocused: 'shield',
        badge:
          adminWarningCount > 0
            ? adminWarningCount > 99
              ? '99+'
              : adminWarningCount
            : undefined,
      });
    }

    out.push({
      key: 'profile',
      kind: 'route',
      routeName: 'profile',
      label: t('myProfile'),
      icon: 'person-outline',
      iconFocused: 'person',
      isProfile: true,
    });

    return out;
  }, [
    t,
    pinnedItems,
    isAdmin,
    canIdCapture,
    newTasksTabCount,
    unreadMessagesCount,
    adminWarningCount,
  ]);

  const handleShellLayout = useCallback(
    (e: LayoutChangeEvent) => {
      onTabBarHeightChange?.(0);
      void e;
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
    <Animated.View
      onLayout={handleShellLayout}
      style={[
        styles.shell,
        styles.shellFloating,
        {
          backgroundColor: resolvedSurface,
          paddingBottom: bottomPad,
          paddingHorizontal: FLOAT_SIDE_INSET,
          transform: [{ translateY }],
        },
      ]}
      pointerEvents="box-none"
    >
      <View
        style={[styles.shadowHost, isNight && styles.shadowHostNight]}
        pointerEvents="box-none"
      >
        <GlassTabBarShell borderRadius={ISLAND_RADIUS}>
          <View style={[styles.row, { minHeight: innerH }]}>
            {items.map((item) => {
              let focused = false;
              let color: string = tabBar.inactive;
              let label = '';
              let iconNode: ReactNode = null;
              let badge: string | number | undefined;

              if (item.kind === 'href') {
                label = item.item.label;
                focused = isHrefActive(item.item.href);
                color = focused ? tabBar.fallbackActive : tabBar.inactive;
                iconNode = <Ionicons name={item.item.icon} size={ICON_SIZE} color={color} />;
              } else {
                label = item.label;
                focused = focusedRoute === item.routeName;
                color = focused ? tabBar.fallbackActive : tabBar.inactive;
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
                    {badge != null ? (
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
        </GlassTabBarShell>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: { width: '100%' },
  shellFloating: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  shadowHost: {
    borderRadius: ISLAND_RADIUS,
    overflow: 'visible',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  shadowHostNight: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 2,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 2,
    minWidth: 0,
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
