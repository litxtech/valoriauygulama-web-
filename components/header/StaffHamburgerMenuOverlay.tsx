import { memo, useEffect, useMemo, useCallback } from 'react';
import { Alert, Platform, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { StaffQuickMenuSheet } from '@/components/header/StaffQuickMenuSheet';
import { supabase } from '@/lib/supabase';
import { canAccessAdminRoute } from '@/lib/adminRoutePermissions';
import { buildStaffHamburgerMenuLayout, flattenStaffHamburgerMenu } from '@/lib/staffHamburgerMenu';
import { getMyAttendanceToday } from '@/lib/staffAttendance';
import { staffRoleLabel } from '@/lib/staffAssignments';
import { useAuthStore } from '@/stores/authStore';
import { useOrganizationUiFeaturesStore } from '@/stores/organizationUiFeaturesStore';
import { useStaffHamburgerUiStore } from '@/stores/staffHamburgerUiStore';
import { useStaffHamburgerRecentsStore } from '@/stores/staffHamburgerRecentsStore';
import { useStaffHamburgerMenuActions } from '@/hooks/useStaffHamburgerMenuActions';
import { useStaffMenuRealtime } from '@/hooks/useStaffMenuRealtime';
import { useStaffHamburgerTheme } from '@/hooks/useStaffHamburgerTheme';
import { runAfterUiReady } from '@/lib/runAfterUiReady';
import { safeRouterReplace } from '@/lib/safeRouter';

const IS_ANDROID = Platform.OS === 'android';
const MENU_PREMOUNT_DELAY_MS = IS_ANDROID ? 0 : 400;

/**
 * Hamburger menü — tab layout dışında; menü state değişince Tabs yeniden çizilmez.
 */
export const StaffHamburgerMenuOverlay = memo(function StaffHamburgerMenuOverlay() {
  const { t } = useTranslation();
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const signOut = useAuthStore((s) => s.signOut);
  const orgUiConfig = useOrganizationUiFeaturesStore((s) => s.config);
  const visible = useStaffHamburgerUiStore((s) => s.visible);
  const navigatingAway = useStaffHamburgerUiStore((s) => s.navigatingAway);
  const instant = useStaffHamburgerUiStore((s) => s.instant);
  const sheetEverMounted = useStaffHamburgerUiStore((s) => s.sheetEverMounted);
  const markSheetMounted = useStaffHamburgerUiStore((s) => s.markSheetMounted);
  const { closeMenu, navigateFromMenu } = useStaffHamburgerMenuActions();
  useStaffMenuRealtime();
  const menuTheme = useStaffHamburgerTheme();
  const hydrateRecents = useStaffHamburgerRecentsStore((s) => s.hydrate);
  const recents = useStaffHamburgerRecentsStore((s) => s.recents);
  const resolveRecents = useStaffHamburgerRecentsStore((s) => s.resolveRecents);

  useEffect(() => {
    if (!staff?.id) return;
    void hydrateRecents(staff.id);
  }, [staff?.id, hydrateRecents]);

  useEffect(() => {
    if (!staff?.id) return;
    if (IS_ANDROID) {
      markSheetMounted();
      return;
    }
    const task = runAfterUiReady(markSheetMounted, { delayMs: MENU_PREMOUNT_DELAY_MS });
    return () => task.cancel();
  }, [staff?.id, markSheetMounted]);

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

  const menuIdentity = useMemo(
    () =>
      staff
        ? {
            fullName: staff.full_name,
            profileImage: staff.profile_image ?? null,
            roleLabel: staffRoleLabel(staff.role),
            department: staff.department,
            organizationName: staff.organization?.name ?? null,
          }
        : null,
    [staff?.full_name, staff?.profile_image, staff?.role, staff?.department, staff?.organization?.name]
  );

  const allMenuItems = useMemo(() => {
    if (!menuLayout) return [];
    const flat = flattenStaffHamburgerMenu(menuLayout.sections);
    const hubItems = menuLayout.hubs ?? [];
    const primary = menuLayout.primary;
    const merged = [
      ...(primary ? [primary] : []),
      ...hubItems.filter((item) => item.id !== primary?.id),
      ...flat.filter((item) => item.id !== primary?.id && !hubItems.some((h) => h.id === item.id)),
    ];
    return merged;
  }, [menuLayout]);

  const recentItems = useMemo(
    () => resolveRecents(allMenuItems),
    [allMenuItems, recents, resolveRecents]
  );

  const profileMenuItem = useMemo(
    () => allMenuItems.find((item) => item.id === 'profile') ?? null,
    [allMenuItems]
  );

  const showAttendanceShortcuts = useMemo(
    () => allMenuItems.some((item) => item.id === 'attendance'),
    [allMenuItems]
  );

  const showAdminAttendancePanel = useMemo(() => {
    if (!staff) return false;
    return (
      canAccessAdminRoute(
        {
          role: staff.role,
          app_permissions: staff.app_permissions,
        },
        '/admin/attendance'
      ) || allMenuItems.some((item) => item.id === 'attendance_admin')
    );
  }, [allMenuItems, staff]);

  useQuery({
    queryKey: ['staff-attendance', 'today'],
    queryFn: getMyAttendanceToday,
    enabled: !!staff?.id && showAttendanceShortcuts,
    staleTime: 60_000,
    refetchOnMount: 'always',
  });

  const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
  useQuery({
    queryKey: ['admin-attendance', 'day', todayKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_attendance_daily_report')
        .select('*')
        .eq('work_date', todayKey)
        .order('full_name', { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!staff?.id && showAdminAttendancePanel,
    staleTime: 30_000,
    refetchOnMount: 'always',
  });

  const handleSignOutPress = useCallback(() => {
    Alert.alert(t('signOut'), t('signOutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('signOut'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            closeMenu();
            await signOut();
            safeRouterReplace(router, '/');
          })();
        },
      },
    ]);
  }, [t, closeMenu, signOut, router]);

  if (!sheetEverMounted) return null;

  return (
    <View style={styles.host} pointerEvents="box-none">
      <StaffQuickMenuSheet
        visible={visible}
        navigatingAway={navigatingAway}
        instant={instant}
        onClose={closeMenu}
        closeLabel={t('close')}
        identity={menuIdentity}
        onProfilePress={() => {
          if (profileMenuItem) {
            navigateFromMenu(profileMenuItem.href, { itemId: profileMenuItem.id, item: profileMenuItem });
            return;
          }
          navigateFromMenu('/staff/profile');
        }}
        layout={menuLayout}
        menuTheme={menuTheme}
        recentItems={recentItems}
        showAttendanceShortcuts={showAttendanceShortcuts}
        showAdminAttendancePanel={showAdminAttendancePanel}
        onAdminAttendanceNavigate={closeMenu}
        onSelect={navigateFromMenu}
        onSignOutPress={handleSignOutPress}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    elevation: 200,
  },
});
