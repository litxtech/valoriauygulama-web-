import { memo, useEffect, useMemo } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { StaffQuickMenuSheet } from '@/components/header/StaffQuickMenuSheet';
import { buildStaffHamburgerMenuLayout, flattenStaffHamburgerMenu } from '@/lib/staffHamburgerMenu';
import { staffRoleLabel } from '@/lib/staffAssignments';
import { useAuthStore } from '@/stores/authStore';
import { useOrganizationUiFeaturesStore } from '@/stores/organizationUiFeaturesStore';
import { useStaffHamburgerUiStore } from '@/stores/staffHamburgerUiStore';
import { useStaffHamburgerRecentsStore } from '@/stores/staffHamburgerRecentsStore';
import { useStaffHamburgerMenuActions } from '@/hooks/useStaffHamburgerMenuActions';
import { runAfterUiReady } from '@/lib/runAfterUiReady';

const IS_ANDROID = Platform.OS === 'android';
const MENU_PREMOUNT_DELAY_MS = IS_ANDROID ? 0 : 400;

/**
 * Hamburger menü — tab layout dışında; menü state değişince Tabs yeniden çizilmez.
 */
export const StaffHamburgerMenuOverlay = memo(function StaffHamburgerMenuOverlay() {
  const { t } = useTranslation();
  const staff = useAuthStore((s) => s.staff);
  const orgUiConfig = useOrganizationUiFeaturesStore((s) => s.config);
  const visible = useStaffHamburgerUiStore((s) => s.visible);
  const navigatingAway = useStaffHamburgerUiStore((s) => s.navigatingAway);
  const instant = useStaffHamburgerUiStore((s) => s.instant);
  const sheetEverMounted = useStaffHamburgerUiStore((s) => s.sheetEverMounted);
  const markSheetMounted = useStaffHamburgerUiStore((s) => s.markSheetMounted);
  const { closeMenu, navigateFromMenu } = useStaffHamburgerMenuActions();
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
    if (!menuLayout.primary) return flat;
    return [menuLayout.primary, ...flat.filter((item) => item.id !== menuLayout.primary?.id)];
  }, [menuLayout]);

  const recentItems = useMemo(
    () => resolveRecents(allMenuItems),
    [allMenuItems, recents, resolveRecents]
  );

  const profileMenuItem = useMemo(
    () => allMenuItems.find((item) => item.id === 'profile') ?? null,
    [allMenuItems]
  );

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
        recentItems={recentItems}
        onSelect={navigateFromMenu}
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
