import { useCallback } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useStaffNewAssignmentHintStore } from '@/stores/staffNewAssignmentHintStore';
import { useStaffHamburgerUiStore } from '@/stores/staffHamburgerUiStore';
import { useStaffHamburgerRecentsStore } from '@/stores/staffHamburgerRecentsStore';
import {
  clearStaffHamburgerReopenPending,
  navigateStaffFromHamburgerMenu,
  signalStaffNavigatedFromHamburger,
} from '@/lib/staffHamburgerNavigation';
import type { StaffHamburgerMenuItem } from '@/lib/staffHamburgerMenu';

const IS_ANDROID = Platform.OS === 'android';

export function useStaffHamburgerMenuActions() {
  const router = useRouter();
  const staffId = useAuthStore((s) => s.staff?.id);
  const visible = useStaffHamburgerUiStore((s) => s.visible);
  const open = useStaffHamburgerUiStore((s) => s.open);
  const beginNavTransition = useStaffHamburgerUiStore((s) => s.beginNavTransition);
  const finishNavTransition = useStaffHamburgerUiStore((s) => s.finishNavTransition);
  const reopenInstant = useStaffHamburgerUiStore((s) => s.reopenInstant);
  const markNewAssignMenuOpened = useStaffNewAssignmentHintStore((s) => s.markHamburgerMenuOpened);
  const pushRecent = useStaffHamburgerRecentsStore((s) => s.pushRecent);

  const closeMenu = useCallback(() => {
    finishNavTransition();
    clearStaffHamburgerReopenPending();
  }, [finishNavTransition]);

  const toggleMenu = useCallback(() => {
    if (visible) {
      closeMenu();
      return;
    }
    open({ instant: IS_ANDROID });
    if (staffId) void markNewAssignMenuOpened(staffId);
  }, [visible, closeMenu, open, staffId, markNewAssignMenuOpened]);

  const navigateFromMenu = useCallback(
    (href: string, target?: { itemId?: string; scrollY?: number; item?: StaffHamburgerMenuItem }) => {
      if (staffId && target?.item) void pushRecent(staffId, target.item);
      const normalized = href.replace(/\/+$/, '') || '/staff';
      if (normalized === '/staff') {
        closeMenu();
        navigateStaffFromHamburgerMenu(router, href);
        return;
      }
      signalStaffNavigatedFromHamburger(target);
      beginNavTransition();
      navigateStaffFromHamburgerMenu(router, href);
    },
    [closeMenu, router, staffId, pushRecent, beginNavTransition]
  );

  return {
    visible,
    closeMenu,
    toggleMenu,
    navigateFromMenu,
    reopenInstant,
  };
}
