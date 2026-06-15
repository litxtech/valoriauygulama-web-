import { memo, useLayoutEffect, useRef } from 'react';
import { InteractionManager } from 'react-native';
import { usePathname } from 'expo-router';
import {
  isStaffFeedHomePath,
  shouldReopenStaffHamburgerOnFeedReturn,
} from '@/lib/staffHamburgerNavigation';
import { useStaffHamburgerUiStore } from '@/stores/staffHamburgerUiStore';
import { StaffHamburgerMenuOverlay } from '@/components/header/StaffHamburgerMenuOverlay';

/** Personel hamburger menü + pathname tabanlı geçiş/kapanış — tüm staff stack üzerinde. */
export const StaffHamburgerNavigationHost = memo(function StaffHamburgerNavigationHost() {
  const pathname = usePathname();
  const prevPathRef = useRef(pathname);
  const reopenInstant = useStaffHamburgerUiStore((s) => s.reopenInstant);

  useLayoutEffect(() => {
    const prev = prevPathRef.current;
    prevPathRef.current = pathname;

    const state = useStaffHamburgerUiStore.getState();

    if (state.navigatingAway && !isStaffFeedHomePath(pathname)) {
      InteractionManager.runAfterInteractions(() => {
        const next = useStaffHamburgerUiStore.getState();
        if (next.navigatingAway) next.finishNavTransition();
      });
      return;
    }

    if (!isStaffFeedHomePath(pathname) && state.visible && !state.navigatingAway) {
      state.close();
      return;
    }

    if (!shouldReopenStaffHamburgerOnFeedReturn(prev, pathname)) return;
    reopenInstant();
  }, [pathname, reopenInstant]);

  return <StaffHamburgerMenuOverlay />;
});
